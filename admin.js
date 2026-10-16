// Admin page (Start → Admin, admins only): the Database tab's Condense
// (VACUUM), Backup and Restore. The other tabs are still to come.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { DatabaseSync, backup } = require('node:sqlite');
const { upgradeSchema, DB_PATH } = require('./db');

const RESTORE_MAX = 500 * 1024 * 1024; // a backup this large would be surprising
// Tables a Clue Me In backup must have.
const REQUIRED_TABLES = ['users', 'rulesets', 'ruleset_members', 'wordlists', 'standard_words', 'ruleset_words'];

// Backup file names start with Prod- on Railway and Dev- anywhere else.
const SERVER = process.env.RAILWAY_ENVIRONMENT_NAME ? 'Prod' : 'Dev';
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const fileSize = (p) => (fs.existsSync(p) ? fs.statSync(p).size : 0);
// The database file plus its write-ahead log.
const dbBytes = () => fileSize(DB_PATH) + fileSize(DB_PATH + '-wal');

function setupAdmin(app, db, requireAuth, { forgetLive }) {
  const isAdmin = db.prepare('SELECT is_admin FROM users WHERE id = ?');
  function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
      if (isAdmin.get(req.session.userID)?.is_admin) return next();
      res.status(403).json({ error: 'Admins only.' });
    });
  }

  function info() {
    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const pages = db.prepare('PRAGMA page_count').get().page_count;
    const free = db.prepare('PRAGMA freelist_count').get().freelist_count;
    const pageSize = db.prepare('PRAGMA page_size').get().page_size;
    return {
      file: DB_PATH,
      bytes: dbBytes(),
      unused_bytes: free * pageSize,
      total_pages: pages,
      counts: {
        accounts: count('users'),
        games: count('rulesets'),
        word_lists: count('wordlists'),
        game_words: count('ruleset_words'),
        word_pairs: count('word_pairs'),
        player_history: count('player_history'),
      },
    };
  }

  app.get('/api/admin/db-info', requireAdmin, (req, res) => res.json(info()));

  // Account Stats tab. Rulesets per account count active games the account's
  // email is listed in; sessions come from session_log_players, which starts
  // with this feature.
  app.get('/api/admin/account-stats', requireAdmin, (req, res) => {
    const one = (sql, ...args) => db.prepare(sql).get(...args);
    const addedWithin = (days) => one(`SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', ?)`, `-${days} days`).n;
    const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
    const rulesets = db
      .prepare(
        `SELECT u.email, COUNT(r.id) AS n FROM users u
           LEFT JOIN ruleset_members m ON m.email = u.email
           LEFT JOIN rulesets r ON r.id = m.ruleset_id AND r.active = 1
          GROUP BY u.id ORDER BY n DESC, u.email`
      )
      .all();
    const sessions = db
      .prepare(
        `SELECT u.email, COUNT(p.session_id) AS n FROM users u
           LEFT JOIN session_log_players p ON p.user_id = u.id
          GROUP BY u.id ORDER BY n DESC, u.email`
      )
      .all();
    const avg = (rows) => (rows.length ? round1(rows.reduce((t, x) => t + x.n, 0) / rows.length) : null);
    res.json({
      total: rulesets.length,
      verified: one('SELECT COUNT(*) AS n FROM users WHERE email_verified = 1').n,
      added: { days7: addedWithin(7), days30: addedWithin(30), year: addedWithin(365) },
      avg_rulesets: avg(rulesets),
      max_rulesets: rulesets.length ? { rulesets: rulesets[0].n, email: rulesets[0].email } : null,
      sessions_logged: one('SELECT COUNT(*) AS n FROM session_log').n,
      avg_sessions: avg(sessions),
      max_sessions: sessions.length && sessions[0].n ? { sessions: sessions[0].n, email: sessions[0].email } : null,
    });
  });

  // Ruleset Stats tab. Counts cover active (not deleted) games; session
  // figures come from session_log, which starts with this feature. "This
  // week" and "the prior week" both mean the last 7 days.
  app.get('/api/admin/ruleset-stats', requireAdmin, (req, res) => {
    const one = (sql, ...args) => db.prepare(sql).get(...args);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const playedWithin = (days) =>
      one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 1 AND last_session_ended_at >= ?', now - days * DAY).n;
    const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

    const weekSessions = db
      .prepare(
        `SELECT r.name, COUNT(*) AS n FROM session_log l JOIN rulesets r ON r.id = l.ruleset_id
          WHERE l.started_at >= ? GROUP BY l.ruleset_id ORDER BY n DESC, r.name`
      )
      .all(now - 7 * DAY);
    const vocab = db
      .prepare(
        `SELECT r.name, COUNT(w.word) AS n FROM rulesets r LEFT JOIN ruleset_words w ON w.ruleset_id = r.id
          WHERE r.active = 1 GROUP BY r.id ORDER BY n DESC, r.name`
      )
      .all();
    const biggestSession = one(
      `SELECT r.name, l.players FROM session_log l JOIN rulesets r ON r.id = l.ruleset_id
        ORDER BY l.players DESC, l.ended_at DESC LIMIT 1`
    );

    res.json({
      total: one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 1').n,
      deleted: one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 0').n,
      timer: {
        off: one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 1 AND timer_on = 0').n,
        enforced: one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 1 AND timer_on = 1 AND enforce_timer = 1').n,
        not_enforced: one('SELECT COUNT(*) AS n FROM rulesets WHERE active = 1 AND timer_on = 1 AND enforce_timer = 0').n,
      },
      played: { days7: playedWithin(7), days30: playedWithin(30), year: playedWithin(365) },
      avg_accounts: round1(
        one(
          `SELECT AVG(n) AS a FROM (SELECT COUNT(m.email) AS n FROM rulesets r
             LEFT JOIN ruleset_members m ON m.ruleset_id = r.id WHERE r.active = 1 GROUP BY r.id)`
        ).a
      ),
      sessions_logged: one('SELECT COUNT(*) AS n FROM session_log').n,
      avg_players: round1(one('SELECT AVG(players) AS a FROM session_log').a),
      max_players: biggestSession ? { players: biggestSession.players, name: biggestSession.name } : null,
      avg_sessions_week: weekSessions.length ? round1(weekSessions.reduce((t, x) => t + x.n, 0) / weekSessions.length) : null,
      max_sessions_week: weekSessions.length ? { sessions: weekSessions[0].n, name: weekSessions[0].name } : null,
      avg_vocab: vocab.length ? Math.round(vocab.reduce((t, x) => t + x.n, 0) / vocab.length) : null,
      max_vocab: vocab.length ? { words: vocab[0].n, name: vocab[0].name } : null,
    });
  });

  // Condense: rewrite the file without unused space.
  app.post('/api/admin/vacuum', requireAdmin, (req, res) => {
    const before = dbBytes();
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log(`[admin] vacuum by ${req.session.email}: ${before} -> ${dbBytes()} bytes`);
    res.json({ before, after: dbBytes(), info: info() });
  });

  // Backup: a consistent copy of the whole database, made while it runs.
  app.get('/api/admin/backup', requireAdmin, (req, res) => {
    const tmp = path.join(os.tmpdir(), `cluemein-backup-${process.pid}-${Date.now()}.db`);
    try {
      db.prepare('VACUUM INTO ?').run(tmp);
    } catch (err) {
      return res.status(500).json({ error: `Backup failed: ${err.message}` });
    }
    console.log(`[admin] backup by ${req.session.email}`);
    res.download(tmp, `${SERVER}-cluemein-backup-${stamp()}.db`, () => fs.rm(tmp, { force: true }, () => {}));
  });

  // Restore: the uploaded backup replaces the whole database. The current
  // database is first saved next to the live one as a safety copy.
  app.post(
    '/api/admin/restore',
    requireAdmin,
    express.raw({ type: () => true, limit: RESTORE_MAX }),
    async (req, res) => {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buf.slice(0, 16).toString('latin1') !== 'SQLite format 3\0') {
        return res.status(400).json({ error: 'That file is not a database backup.' });
      }
      const tmp = path.join(os.tmpdir(), `cluemein-restore-${process.pid}-${Date.now()}.db`);
      fs.writeFileSync(tmp, buf);
      let src;
      try {
        src = new DatabaseSync(tmp);
        const ok = src.prepare('PRAGMA quick_check').get();
        if (Object.values(ok)[0] !== 'ok') throw new Error('the file is damaged');
        const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
        const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
        if (missing.length) throw new Error(`it isn't a Clue Me In backup (missing ${missing.join(', ')})`);

        // Safety copy of the current database, next to it (on the volume).
        const safety = path.join(path.dirname(DB_PATH), `cluemein-before-restore-${stamp()}.db`);
        db.prepare('VACUUM INTO ?').run(safety);

        await backup(src, DB_PATH); // page-by-page copy into the live file
        src.close();
        src = null;
        upgradeSchema(db); // an older backup gets any newer tables and columns
        forgetLive();
        console.log(`[admin] restore by ${req.session.email}; previous database saved as ${safety}`);
        res.json({ ok: true, safety_copy: path.basename(safety), info: info() });
      } catch (err) {
        res.status(400).json({ error: `Restore failed: ${err.message}.` });
      } finally {
        if (src) src.close();
        fs.rm(tmp, { force: true }, () => {});
      }
    }
  );

  return { requireAdmin };
}

module.exports = { setupAdmin };
