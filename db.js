// db.js - SQLite schema and word-list seeding.
// Uses Node.js built-in node:sqlite (requires Node v22.5+).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'cluemein.db');
const ASSETS = path.join(__dirname, 'assets');

// Standard lists. English lists are shown on row 1 of the list picker (in this
// order); every other language list goes on row 2, alphabetically.
// `key` is the list's name in assets/words.json; `file` is a plain word file.
const ENGLISH_LISTS = [
  { name: 'Original', key: 'English (Original)' },
  { name: 'Duet', key: 'English (Duet)' },
  { name: 'Roebuck', file: 'roebuck.txt' },
  { name: 'Ribald', key: 'English (Deep Undercover) [MA]' },
];

function normalizeWord(w) {
  return String(w).trim().replace(/\s+/g, ' ').toUpperCase();
}

function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    -- One-use emailed links: 'verify' (confirm a new account) and 'reset'
    -- (forgot password: direct login or set a new password).
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL        -- epoch milliseconds
    );

    -- Login sessions (express-session store), so logins survive restarts.
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Word list names (the "Wordlist names" table).
    CREATE TABLE IF NOT EXISTS wordlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      language TEXT NOT NULL,
      picker_row INTEGER NOT NULL,      -- 1 = English lists, 2 = other languages
      sort_order INTEGER NOT NULL
    );

    -- Every word of every standard list.
    CREATE TABLE IF NOT EXISTS standard_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wordlist_id INTEGER NOT NULL REFERENCES wordlists(id) ON DELETE CASCADE,
      word TEXT NOT NULL COLLATE NOCASE,
      UNIQUE (wordlist_id, word)
    );

    -- A RuleSet (shown on screens as a "Game").
    CREATE TABLE IF NOT EXISTS rulesets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      description TEXT,                 -- up to 75 characters, shown beside the name
      max_session_hours REAL NOT NULL DEFAULT 4,
      min_players INTEGER NOT NULL DEFAULT 4,
      min_team_size INTEGER NOT NULL,
      video_url TEXT,
      graffito_message TEXT,
      graffito_url TEXT,
      timer_on INTEGER NOT NULL DEFAULT 0,
      first_turn_seconds INTEGER NOT NULL DEFAULT 300,
      next_turn_seconds INTEGER NOT NULL DEFAULT 120,
      enforce_timer INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Players in a RuleSet. The player name is per RuleSet.
    CREATE TABLE IF NOT EXISTS ruleset_members (
      ruleset_id INTEGER NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_name TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY (ruleset_id, user_id),
      UNIQUE (ruleset_id, player_name)
    );

    -- Which standard lists a RuleSet has added (lists can't be removed).
    CREATE TABLE IF NOT EXISTS ruleset_wordlists (
      ruleset_id INTEGER NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
      wordlist_id INTEGER NOT NULL REFERENCES wordlists(id),
      PRIMARY KEY (ruleset_id, wordlist_id)
    );

    -- A RuleSet's own copy of its vocabulary. wordlist_id is the source list,
    -- or NULL for words added by hand ("Manual"). Deleting a word deletes
    -- only this row, never the standard list.
    CREATE TABLE IF NOT EXISTS ruleset_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ruleset_id INTEGER NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
      word TEXT NOT NULL COLLATE NOCASE,
      wordlist_id INTEGER REFERENCES wordlists(id),
      UNIQUE (ruleset_id, word)
    );

    -- The live session of a RuleSet (at most one), saved as JSON so boards
    -- survive a server restart. Deleted when the session ends.
    CREATE TABLE IF NOT EXISTS play_sessions (
      ruleset_id INTEGER PRIMARY KEY REFERENCES rulesets(id) ON DELETE CASCADE,
      state TEXT NOT NULL
    );

    -- Words guessed in the same turn, counted across all games. The pair
    -- is stored in alphabetical order (word_a < word_b). Kept permanently.
    CREATE TABLE IF NOT EXISTS word_pairs (
      word_a TEXT NOT NULL,
      word_b TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (word_a, word_b)
    );

    -- One row per non-floater player per completed board.
    CREATE TABLE IF NOT EXISTS player_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ruleset_id INTEGER REFERENCES rulesets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      role TEXT NOT NULL CHECK (role IN ('cluer', 'guesser')),
      won INTEGER NOT NULL,             -- 1 = won, 0 = lost
      by_assassination INTEGER NOT NULL DEFAULT 0,
      margin INTEGER                    -- "by #": unguessed words of the losing team
    );
  `);

  // Columns added after a table was first created.
  const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!hasColumn('rulesets', 'description')) {
    db.exec('ALTER TABLE rulesets ADD COLUMN description TEXT');
  }
  if (!hasColumn('rulesets', 'last_session_ended_at')) {
    // Epoch ms; the Start screen shows "Previous session ended ...".
    db.exec('ALTER TABLE rulesets ADD COLUMN last_session_ended_at INTEGER');
  }

  seedWordlists(db);
  return db;
}

// Load any standard list that isn't in the database yet. Existing lists are
// never touched: once seeded, the database is the source of truth.
function seedWordlists(db) {
  const json = JSON.parse(fs.readFileSync(path.join(ASSETS, 'words.json'), 'utf8'));
  const englishKeys = new Set(ENGLISH_LISTS.map((l) => l.key).filter(Boolean));

  const lists = ENGLISH_LISTS.map((l, i) => ({
    name: l.name,
    language: 'English',
    row: 1,
    order: i,
    words: l.file
      ? fs.readFileSync(path.join(ASSETS, l.file), 'utf8').split(/\r?\n/)
      : json[l.key],
  }));
  Object.keys(json)
    .filter((k) => !englishKeys.has(k))
    .sort()
    .forEach((k, i) => {
      lists.push({ name: k, language: k.replace(/\s*\(.*$/, ''), row: 2, order: i, words: json[k] });
    });

  const exists = db.prepare('SELECT id FROM wordlists WHERE name = ?');
  const addList = db.prepare(
    'INSERT INTO wordlists (name, language, picker_row, sort_order) VALUES (?, ?, ?, ?)'
  );
  const addWord = db.prepare('INSERT OR IGNORE INTO standard_words (wordlist_id, word) VALUES (?, ?)');

  db.exec('BEGIN');
  try {
    for (const l of lists) {
      if (exists.get(l.name)) continue;
      const { lastInsertRowid: id } = addList.run(l.name, l.language, l.row, l.order);
      for (const w of l.words) {
        const word = normalizeWord(w);
        if (word) addWord.run(id, word);
      }
      console.log(`Seeded word list "${l.name}"`);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Retention: a RuleSet is deleted (with its players, vocabulary and
// history) one year after it was last used; a player's history is deleted
// one year after they last finished a board. Boards and session details
// are already gone when a session ends. Word-pair counts are kept.
function deleteExpired(db) {
  const rulesets = db
    .prepare(
      `DELETE FROM rulesets WHERE last_used_at < datetime('now', '-365 days')
         AND id NOT IN (SELECT ruleset_id FROM play_sessions)`
    )
    .run().changes;
  const history = db
    .prepare(
      `DELETE FROM player_history WHERE user_id IN (
         SELECT user_id FROM player_history GROUP BY user_id
         HAVING MAX(played_at) < datetime('now', '-365 days'))`
    )
    .run().changes;
  if (rulesets || history) console.log(`[retention] deleted ${rulesets} game(s), ${history} history row(s)`);
}

module.exports = { initDb, normalizeWord, deleteExpired };
