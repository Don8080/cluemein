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
    res.download(tmp, `cluemein-backup-${stamp()}.db`, () => fs.rm(tmp, { force: true }, () => {}));
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
