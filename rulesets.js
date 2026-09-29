// RuleSets ("Games" on screen): create (B1), copy, modify (B2) and edit
// vocabulary (P2). Any member of a RuleSet may view and change it.
const { normalizeWord } = require('./db');

class InputError extends Error {}

function setupRulesets(app, db, requireAuth) {
  // Members are stored by email; the logged-in player is matched by theirs.
  const isMember = db.prepare('SELECT 1 FROM ruleset_members WHERE ruleset_id = ? AND email = ?');
  const accountStatus = db.prepare('SELECT email_verified FROM users WHERE email = ?');
  // 'none' (No Account), 'pending' (not verified yet) or 'verified'.
  const statusOf = (email) => {
    const u = accountStatus.get(email);
    return !u ? 'none' : u.email_verified ? 'verified' : 'pending';
  };
  const getRuleset = db.prepare('SELECT * FROM rulesets WHERE id = ?');

  // Loads the RuleSet in :id if the logged-in user belongs to it.
  function memberRuleset(req, res) {
    const id = Number(req.params.id);
    const rs = Number.isInteger(id) && getRuleset.get(id);
    if (!rs || !rs.active || !isMember.get(id, req.session.email)) {
      res.status(404).json({ error: 'Game not found.' });
      return null;
    }
    return rs;
  }

  function details(rs) {
    const players = db
      .prepare(
        `SELECT m.email, m.player_name AS name FROM ruleset_members m
          WHERE m.ruleset_id = ? ORDER BY m.rowid`
      )
      .all(rs.id)
      .map((p) => ({ ...p, status: statusOf(p.email) }));
    const wordlistIDs = db
      .prepare('SELECT wordlist_id FROM ruleset_wordlists WHERE ruleset_id = ?')
      .all(rs.id)
      .map((r) => r.wordlist_id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM ruleset_words WHERE ruleset_id = ?').get(rs.id);
    return {
      id: rs.id,
      name: rs.name,
      description: rs.description || '',
      max_session_hours: rs.max_session_hours,
      min_players: rs.min_players,
      min_team_size: rs.min_team_size,
      video_url: rs.video_url || '',
      graffito_message: rs.graffito_message || '',
      graffito_url: rs.graffito_url || '',
      timer_on: !!rs.timer_on,
      first_turn_seconds: rs.first_turn_seconds,
      next_turn_seconds: rs.next_turn_seconds,
      enforce_timer: !!rs.enforce_timer,
      players,
      wordlist_ids: wordlistIDs,
      word_count: n,
    };
  }

  // Validates the settings and player list shared by create and modify.
  // Returns cleaned values or throws InputError.
  function cleanSettings(body) {
    const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    const hours = num(body.max_session_hours);
    const minPlayers = num(body.min_players);
    const minTeam = num(body.min_team_size);
    if (!(hours > 0 && hours <= 24)) throw new InputError('Maximum Session Duration must be between 0 and 24 hours.');
    if (!Number.isInteger(minPlayers) || minPlayers < 3) throw new InputError('Minimum Number of Players must be at least 3.');
    if (!Number.isInteger(minTeam) || minTeam < 2) throw new InputError('Minimum Team Size must be at least 2.');
    if (minTeam > minPlayers - 1) {
      throw new InputError(
        `Minimum Team Size can be at most ${minPlayers - 1} with ${minPlayers} players (Minimum Team Size ≤ Minimum Players − 1).`
      );
    }

    // Accepts "zoom.us/j/123" as well as a full link; adds https:// if missing.
    const url = (v, label) => {
      let s = String(v || '').trim();
      if (!s) return null;
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(s)) throw new InputError(`${label} doesn't look like a web address.`);
      return s;
    };

    const description = String(body.description || '').trim();
    if (description.length > 75) throw new InputError('Game Description can be at most 75 characters.');

    const timerOn = !!body.timer_on;
    const first = Math.round(num(body.first_turn_seconds));
    const next = Math.round(num(body.next_turn_seconds));
    if (timerOn && !(first > 0 && next > 0)) throw new InputError('Enter both turn durations for the timer.');

    const players = (body.players || [])
      .map((p) => ({ name: String(p.name || '').trim(), email: String(p.email || '').trim().toLowerCase() }))
      .filter((p) => p.name || p.email);
    if (players.length < 3) throw new InputError('A game needs at least 3 players.');
    for (const p of players) {
      if (!p.name || !p.email) throw new InputError('Every player needs both a name and an email.');
    }
    const lower = players.map((p) => p.name.toLowerCase());
    const dupName = lower.find((n, i) => lower.indexOf(n) !== i);
    if (dupName) throw new InputError(`The player name "${dupName}" is used twice. Names must be unique.`);
    const emails = players.map((p) => p.email);
    const dupEmail = emails.find((e, i) => emails.indexOf(e) !== i);
    if (dupEmail) throw new InputError(`${dupEmail} is listed twice.`);

    // Players may be added before they have an account; they join the game
    // when they sign up with that email.
    const bad = players.find((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
    if (bad) throw new InputError(`${bad.email} is not a valid email address.`);

    return {
      description: description || null,
      max_session_hours: hours,
      min_players: minPlayers,
      min_team_size: minTeam,
      video_url: url(body.video_url, 'Video Chat URL'),
      graffito_message: String(body.graffito_message || '').trim() || null,
      graffito_url: url(body.graffito_url, 'Graffito URL'),
      timer_on: timerOn ? 1 : 0,
      first_turn_seconds: first > 0 ? first : 300,
      next_turn_seconds: next > 0 ? next : 120,
      enforce_timer: body.enforce_timer ? 1 : 0,
      players,
    };
  }

  function checkName(name, exceptID) {
    const n = String(name || '').trim();
    if (!n) throw new InputError('Enter a Name of Game.');
    const other = db.prepare('SELECT id, active FROM rulesets WHERE name = ?').get(n);
    if (other && other.id !== exceptID) {
      if (other.active) throw new InputError(`There is already a game named "${n}".`);
      // A deleted game gives up its name.
      db.prepare('UPDATE rulesets SET name = ? WHERE id = ?').run(`${n} (deleted #${other.id})`, other.id);
    }
    return n;
  }

  function saveSettings(id, s) {
    db.prepare(
      `UPDATE rulesets SET description = ?, max_session_hours = ?, min_players = ?, min_team_size = ?,
         video_url = ?, graffito_message = ?, graffito_url = ?, timer_on = ?, first_turn_seconds = ?,
         next_turn_seconds = ?, enforce_timer = ? WHERE id = ?`
    ).run(
      s.description, s.max_session_hours, s.min_players, s.min_team_size, s.video_url, s.graffito_message,
      s.graffito_url, s.timer_on, s.first_turn_seconds, s.next_turn_seconds, s.enforce_timer, id
    );
    // Replace the player list, keeping the order given.
    db.prepare('DELETE FROM ruleset_members WHERE ruleset_id = ?').run(id);
    const add = db.prepare('INSERT INTO ruleset_members (ruleset_id, email, player_name) VALUES (?, ?, ?)');
    for (const p of s.players) add.run(id, p.email, p.name);
  }

  // Adds standard lists to a RuleSet, copying their words. A word already in
  // the RuleSet keeps its original source.
  function addWordlists(id, listIDs) {
    const valid = db.prepare('SELECT id FROM wordlists WHERE id = ?');
    const link = db.prepare('INSERT OR IGNORE INTO ruleset_wordlists (ruleset_id, wordlist_id) VALUES (?, ?)');
    const copy = db.prepare(
      `INSERT OR IGNORE INTO ruleset_words (ruleset_id, word, wordlist_id)
       SELECT ?, word, wordlist_id FROM standard_words WHERE wordlist_id = ?`
    );
    const ordered = db
      .prepare('SELECT id FROM wordlists ORDER BY picker_row, sort_order')
      .all()
      .map((r) => r.id)
      .filter((lid) => listIDs.includes(lid));
    for (const lid of ordered) {
      if (!valid.get(lid)) continue;
      if (link.run(id, lid).changes) copy.run(id, lid);
    }
  }

  function inTransaction(res, fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      if (err instanceof InputError) {
        res.status(400).json({ error: err.message });
        return undefined;
      }
      throw err;
    }
  }

  const listIDsOf = (body) => (body.wordlist_ids || []).map(Number).filter(Number.isInteger);

  // Games (RuleSets) this user belongs to, for the Start dropdown.
  app.get('/api/rulesets', requireAuth, (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT r.id, r.name, r.description, r.video_url FROM rulesets r
             JOIN ruleset_members m ON m.ruleset_id = r.id AND m.email = ?
            WHERE r.active = 1
            ORDER BY r.name`
        )
        .all(req.session.email)
    );
  });

  // Account status for an email typed into a player list (B1/B2):
  // 'none' (No Account), 'pending' or 'verified'.
  app.get('/api/account-status', requireAuth, (req, res) => {
    res.json({ status: statusOf(String(req.query.email || '').trim().toLowerCase()) });
  });

  app.get('/api/rulesets/:id', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (rs) res.json(details(rs));
  });

  // (B1) Create a game from scratch.
  app.post('/api/rulesets', requireAuth, (req, res) => {
    const id = inTransaction(res, () => {
      const name = checkName(req.body.name);
      const s = cleanSettings(req.body);
      if (!s.players.some((p) => p.email === String(req.session.email).toLowerCase())) {
        throw new InputError('Include yourself in the player list, or you won\'t be able to open this game.');
      }
      const listIDs = listIDsOf(req.body);
      if (!listIDs.length) throw new InputError('Choose at least one word list.');
      const { lastInsertRowid } = db
        .prepare('INSERT INTO rulesets (name, min_team_size, created_by) VALUES (?, ?, ?)')
        .run(name, s.min_team_size, req.session.userID);
      saveSettings(lastInsertRowid, s);
      addWordlists(lastInsertRowid, listIDs);
      return lastInsertRowid;
    });
    if (id !== undefined) res.json({ id });
  });

  // (B1) Copy an existing game under a new name: settings, players, lists
  // and the full vocabulary (including deletions and manual words).
  app.post('/api/rulesets/:id/copy', requireAuth, (req, res) => {
    const src = memberRuleset(req, res);
    if (!src) return;
    const id = inTransaction(res, () => {
      const name = checkName(req.body.name);
      const description = String(req.body.description || '').trim();
      if (description.length > 75) throw new InputError('Game Description can be at most 75 characters.');
      const { lastInsertRowid: newID } = db
        .prepare(
          `INSERT INTO rulesets (name, description, max_session_hours, min_players, min_team_size, video_url,
             graffito_message, graffito_url, timer_on, first_turn_seconds, next_turn_seconds,
             enforce_timer, created_by)
           SELECT ?, description, max_session_hours, min_players, min_team_size, video_url, graffito_message,
             graffito_url, timer_on, first_turn_seconds, next_turn_seconds, enforce_timer, ?
             FROM rulesets WHERE id = ?`
        )
        .run(name, req.session.userID, src.id);
      // A description typed in Create Game replaces the copied one.
      if (description) db.prepare('UPDATE rulesets SET description = ? WHERE id = ?').run(description, newID);
      db.prepare(
        `INSERT INTO ruleset_members (ruleset_id, email, player_name)
         SELECT ?, email, player_name FROM ruleset_members WHERE ruleset_id = ? ORDER BY rowid`
      ).run(newID, src.id);
      db.prepare(
        'INSERT INTO ruleset_wordlists (ruleset_id, wordlist_id) SELECT ?, wordlist_id FROM ruleset_wordlists WHERE ruleset_id = ?'
      ).run(newID, src.id);
      db.prepare(
        'INSERT INTO ruleset_words (ruleset_id, word, wordlist_id) SELECT ?, word, wordlist_id FROM ruleset_words WHERE ruleset_id = ?'
      ).run(newID, src.id);
      return newID;
    });
    if (id !== undefined) res.json({ id });
  });

  // (B2) Save changes. Lists can be added, not removed.
  app.put('/api/rulesets/:id', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (!rs) return;
    const ok = inTransaction(res, () => {
      saveSettings(rs.id, cleanSettings(req.body));
      // Modifying a game counts as using it (for the one-year retention).
      db.prepare("UPDATE rulesets SET last_used_at = datetime('now') WHERE id = ?").run(rs.id);
      addWordlists(rs.id, listIDsOf(req.body));
      return true;
    });
    if (ok) res.json(details(getRuleset.get(rs.id)));
  });

  // (B2) Delete: turns the game's Active flag off. Nothing is erased; the
  // game just disappears for everyone. A running session ends on its next
  // request (see session.js).
  app.post('/api/rulesets/:id/delete', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (!rs) return;
    db.prepare('UPDATE rulesets SET active = 0 WHERE id = ?').run(rs.id);
    res.json({ ok: true });
  });

  // (P2) The RuleSet's vocabulary with each word's source.
  const vocabulary = db.prepare(
    `SELECT w.word, COALESCE(l.name, 'Manual') AS source
       FROM ruleset_words w LEFT JOIN wordlists l ON l.id = w.wordlist_id
      WHERE w.ruleset_id = ? ORDER BY w.word`
  );

  app.get('/api/rulesets/:id/words', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (rs) res.json(vocabulary.all(rs.id));
  });

  // (P2) Add words (source "Manual") and delete checked words. Deleting only
  // affects this RuleSet, never the standard lists.
  app.post('/api/rulesets/:id/words', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (!rs) return;
    const add = (req.body.add || []).map(normalizeWord).filter(Boolean);
    const del = (req.body.delete || []).map(normalizeWord).filter(Boolean);
    let added = 0;
    let deleted = 0;
    inTransaction(res, () => {
      const ins = db.prepare('INSERT OR IGNORE INTO ruleset_words (ruleset_id, word, wordlist_id) VALUES (?, ?, NULL)');
      const rm = db.prepare('DELETE FROM ruleset_words WHERE ruleset_id = ? AND word = ?');
      for (const w of del) deleted += rm.run(rs.id, w).changes;
      for (const w of add) added += ins.run(rs.id, w).changes;
    });
    res.json({ added, deleted, words: vocabulary.all(rs.id) });
  });

  // (P2) Export Vocabulary as a CSV file.
  app.get('/api/rulesets/:id/words.csv', requireAuth, (req, res) => {
    const rs = memberRuleset(req, res);
    if (!rs) return;
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = ['Word,Source', ...vocabulary.all(rs.id).map((r) => `${q(r.word)},${q(r.source)}`)];
    const file = rs.name.replace(/[^\w.-]+/g, '_') + '-vocabulary.csv';
    res.attachment(file).type('text/csv').send(lines.join('\r\n') + '\r\n');
  });
}

module.exports = { setupRulesets };
