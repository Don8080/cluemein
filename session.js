// Live play sessions: Waiting Room (A2), presence, automatic role
// assignment, and the board (C1) with turn-locked clicking.
//
// A RuleSet has at most one session. Its state is kept in memory and saved
// to the play_sessions table after every change, so boards survive a
// server restart. Browsers long-poll /state, which doubles as a presence
// heartbeat.
const { Game, randomState, nextGameState } = require('./game');
const { assignRoles, newStats, register } = require('./roles');

// Silent this long => no longer present. PRESENCE_GRACE_MS overrides it for testing.
const GRACE_MS = Number(process.env.PRESENCE_GRACE_MS) || 2 * 60 * 1000;
const CLOSING_TAB_MS = 15 * 1000; // after a tab closes (long enough for a reload)
const LONG_POLL_MS = 15 * 1000;
const SWEEP_MS = 5 * 1000;

function setupSessions(app, db, requireAuth) {
  const live = new Map(); // rulesetID -> entry

  const getRuleset = db.prepare('SELECT * FROM rulesets WHERE id = ?');
  const getMembers = db.prepare(
    'SELECT user_id, player_name AS name FROM ruleset_members WHERE ruleset_id = ? ORDER BY rowid'
  );
  const isMember = db.prepare('SELECT 1 FROM ruleset_members WHERE ruleset_id = ? AND user_id = ?');
  const saveStmt = db.prepare(
    'INSERT INTO play_sessions (ruleset_id, state) VALUES (?, ?) ON CONFLICT(ruleset_id) DO UPDATE SET state = excluded.state'
  );

  // ---- Loading, saving, notifying -----------------------------------------

  function newEntry(s) {
    return { s, presence: new Map(), waiters: new Set() };
  }

  // The session for a RuleSet, loading it from the database if needed.
  function getEntry(rulesetID) {
    if (live.has(rulesetID)) return live.get(rulesetID);
    const row = db.prepare('SELECT state FROM play_sessions WHERE ruleset_id = ?').get(rulesetID);
    if (!row) return null;
    const s = JSON.parse(row.state);
    s.boards.forEach((b) => (b.game = Game.restore(b.game)));
    const entry = newEntry(s);
    // After a restart, assume everyone who was present still is, for one
    // grace period, until their browsers check in again.
    const until = Date.now() + GRACE_MS;
    for (const uid of s.presentIDs || []) entry.presence.set(uid, new Map([['restored', until]]));
    live.set(rulesetID, entry);
    return entry;
  }

  function createEntry(rs) {
    const words = db
      .prepare('SELECT word FROM ruleset_words WHERE ruleset_id = ? ORDER BY word')
      .all(rs.id)
      .map((r) => r.word);
    if (words.length < 25) throw new Error('This game needs at least 25 words in its vocabulary.');
    const s = {
      rulesetID: rs.id,
      startedAt: Date.now(),
      status: 'waiting', // 'waiting' (A2) or 'playing' (C1)
      version: 1,
      words,
      deck: null, // { seed, perm_index }: position in the shuffled vocabulary
      roles: {}, // userID -> { team: 'red'|'blue'|null, role: 'cluer'|'guesser'|'floater' }
      floatersCanClick: false,
      boards: [], // { game, roles, guesses: [{ team, word, color }] }
      current: -1,
      resumable: false, // a board was interrupted by dropping below quorum
      stats: newStats(), // role-rotation history (see roles.js)
      presentIDs: [],
    };
    db.prepare("UPDATE rulesets SET last_used_at = datetime('now') WHERE id = ?").run(rs.id);
    const entry = newEntry(s);
    live.set(rs.id, entry);
    return entry;
  }

  // Save and wake every waiting browser.
  function changed(entry) {
    const s = entry.s;
    s.version++;
    s.presentIDs = presentIDs(entry);
    saveStmt.run(s.rulesetID, JSON.stringify(s));
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    waiters.forEach((fn) => fn());
  }

  function endSession(entry, reason) {
    live.delete(entry.s.rulesetID);
    db.prepare('DELETE FROM play_sessions WHERE ruleset_id = ?').run(entry.s.rulesetID);
    entry.s.ended = reason;
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    waiters.forEach((fn) => fn());
  }

  // ---- Presence ------------------------------------------------------------

  function presentIDs(entry) {
    const now = Date.now();
    const ids = [];
    for (const [uid, tabs] of entry.presence) {
      if ([...tabs.values()].some((t) => t > now)) ids.push(uid);
    }
    return ids.sort((a, b) => a - b);
  }

  // Record a heartbeat. Returns true if the player wasn't present before.
  function touch(entry, uid, tab) {
    const wasPresent = presentIDs(entry).includes(uid);
    let tabs = entry.presence.get(uid);
    if (!tabs) entry.presence.set(uid, (tabs = new Map()));
    tabs.delete('restored');
    tabs.set(String(tab || 'default'), Date.now() + GRACE_MS);
    return !wasPresent;
  }

  // Present players who are (still) members of the RuleSet.
  function presentMembers(entry) {
    const members = new Set(getMembers.all(entry.s.rulesetID).map((m) => m.user_id));
    return presentIDs(entry).filter((id) => members.has(id));
  }

  // ---- Roles ---------------------------------------------------------------

  // A player who arrives mid-board starts as a Floater.
  function addFloater(s, uid) {
    register(s.stats, [uid]);
    s.roles[uid] = { team: null, role: 'floater' };
    const board = currentBoard(s);
    if (board) board.roles[uid] = { team: null, role: 'floater' };
  }

  // New Cluers, guessers and Floaters among the present players (roles.js).
  function reassign(s, ids, rs) {
    const { roles, floatersCanClick } = assignRoles(s.stats, ids, rs.min_team_size);
    s.roles = roles;
    s.floatersCanClick = floatersCanClick;
  }

  // ---- Boards --------------------------------------------------------------

  function currentBoard(s) {
    return s.current >= 0 ? s.boards[s.current] : null;
  }

  function dealBoard(s, rs) {
    const next = s.deck
      ? nextGameState({ ...s.deck, word_set: s.words })
      : randomState(s.words);
    s.deck = { seed: next.seed, perm_index: next.perm_index };
    const game = new Game(String(s.boards.length + 1), next, {
      timer_duration_ms: rs.timer_on ? rs.next_turn_seconds * 1000 : 0,
      enforce_timer: !!(rs.timer_on && rs.enforce_timer),
    });
    s.boards.push({ game, roles: JSON.parse(JSON.stringify(s.roles)), guesses: [] });
    s.current = s.boards.length - 1;
    s.status = 'playing';
    s.resumable = false;
  }

  function mayClick(s, uid) {
    const board = currentBoard(s);
    const r = s.roles[uid];
    if (s.status !== 'playing' || !board || board.game.winning_team || !r) return false;
    if (r.role === 'guesser') return r.team === board.game.currentTeam();
    if (r.role === 'floater') return s.floatersCanClick;
    return false; // Cluers never click
  }

  // ---- What each player sees -----------------------------------------------

  function view(entry, uid) {
    const s = entry.s;
    if (s.ended) return { ended: s.ended };
    const rs = getRuleset.get(s.rulesetID);
    const present = new Set(presentIDs(entry));
    const players = getMembers.all(s.rulesetID).map((m) => ({
      user_id: m.user_id,
      name: m.name,
      present: present.has(m.user_id),
      team: s.roles[m.user_id]?.team ?? null,
      role: s.roles[m.user_id]?.role ?? null,
    }));
    const presentCount = players.filter((p) => p.present).length;

    const out = {
      version: s.version,
      status: s.status,
      me: uid,
      ruleset: {
        id: rs.id,
        name: rs.name,
        description: rs.description || '',
        min_players: rs.min_players,
        video_url: rs.video_url || '',
        graffito_message: rs.graffito_message || '',
        graffito_url: rs.graffito_url || '',
      },
      players,
      quorum: { present: presentCount, needed: rs.min_players },
      resumable: s.resumable,
      floaters_can_click: s.floatersCanClick,
      board: null,
    };

    const board = currentBoard(s);
    if (s.status === 'playing' && board) {
      const g = board.game;
      const isCluer = s.roles[uid]?.role === 'cluer';
      const over = !!g.winning_team;
      out.board = {
        number: s.current + 1,
        words: g.words,
        // Colors of unrevealed words go only to Cluers until the game ends.
        layout: g.layout.map((c, i) => (isCluer || over || g.revealed[i] ? c : 'hidden')),
        revealed: g.revealed,
        round: g.round,
        starting_team: g.starting_team,
        current_team: g.currentTeam(),
        winning_team: g.winning_team,
        remaining: { red: g.remaining('red'), blue: g.remaining('blue') },
        round_started_at: g.round_started_at,
        timer_duration_ms: g.timer_duration_ms,
        enforce_timer: g.enforce_timer,
        guesses: board.guesses,
        can_click: mayClick(s, uid),
      };
    }
    return out;
  }

  // ---- Background sweep: presence changes, quorum and session end ------------

  setInterval(() => {
    for (const entry of [...live.values()]) {
      const s = entry.s;
      const rs = getRuleset.get(s.rulesetID);
      const now = presentIDs(entry);
      if (!rs || Date.now() > s.startedAt + rs.max_session_hours * 3600e3) {
        endSession(entry, 'time');
        continue;
      }
      if (now.length === 0) {
        endSession(entry, 'empty');
        continue;
      }
      let dirty = now.join(',') !== (s.presentIDs || []).join(',');
      // Below quorum mid-play: everyone back to the Waiting Room; the board
      // in progress is kept and resumes when quorum returns.
      if (s.status === 'playing' && presentMembers(entry).length < rs.min_players) {
        const board = currentBoard(s);
        s.status = 'waiting';
        s.resumable = !!(board && !board.game.winning_team);
        dirty = true;
      }
      if (dirty) changed(entry);
    }
  }, SWEEP_MS).unref();

  // ---- Routes --------------------------------------------------------------

  // Resolves the session for :rid and checks membership. `create` makes a
  // new session if none is running.
  function load(req, res, create = false) {
    const rid = Number(req.params.rid);
    const uid = req.session.userID;
    const rs = Number.isInteger(rid) && getRuleset.get(rid);
    if (!rs || !isMember.get(rid, uid)) {
      res.status(404).json({ error: 'Game not found.' });
      return null;
    }
    let entry = getEntry(rid);
    if (!entry && create) {
      try {
        entry = createEntry(rs);
      } catch (err) {
        res.status(400).json({ error: err.message });
        return null;
      }
    }
    if (!entry) {
      res.json({ ended: 'none' });
      return null;
    }
    return { entry, s: entry.s, rs, uid };
  }

  // Heartbeat bookkeeping shared by /join and /state.
  function checkIn(ctx, tab) {
    const { entry, s, uid } = ctx;
    let dirty = touch(entry, uid, tab);
    if (s.status === 'playing' && !s.roles[uid]) {
      addFloater(s, uid); // joining mid-game: start as a Floater
      dirty = true;
    }
    if (dirty) changed(entry);
  }

  // Play (A1): join the RuleSet's session, starting one if needed.
  app.post('/api/play/:rid/join', requireAuth, (req, res) => {
    const ctx = load(req, res, true);
    if (!ctx) return;
    checkIn(ctx, req.body.tab);
    res.json(view(ctx.entry, ctx.uid));
  });

  // Long-poll for changes; also the presence heartbeat.
  app.post('/api/play/:rid/state', requireAuth, (req, res) => {
    const ctx = load(req, res);
    if (!ctx) return;
    const { entry, s, uid } = ctx;
    checkIn(ctx, req.body.tab);
    if (req.body.version !== s.version) return res.json(view(entry, uid));

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      entry.waiters.delete(finish);
      res.json(view(entry, uid));
    };
    const timer = setTimeout(finish, LONG_POLL_MS);
    entry.waiters.add(finish);
    res.on('close', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      entry.waiters.delete(finish);
    });
  });

  // Sent by the browser as a tab closes (navigator.sendBeacon, plain text).
  app.post('/api/play/:rid/bye', require('express').text({ type: '*/*' }), (req, res) => {
    const entry = live.get(Number(req.params.rid));
    const tabs = entry && req.session.userID && entry.presence.get(req.session.userID);
    const tab = String(req.body || '');
    if (tabs && tabs.has(tab)) tabs.set(tab, Math.min(tabs.get(tab), Date.now() + CLOSING_TAB_MS));
    res.status(204).end();
  });

  // Runs a player action; `fn` returns an error message or nothing.
  function action(path, fn) {
    app.post(`/api/play/:rid/${path}`, requireAuth, (req, res) => {
      const ctx = load(req, res);
      if (!ctx) return;
      const err = fn(ctx, req.body || {});
      if (err) return res.status(400).json({ error: err });
      changed(ctx.entry);
      res.json(view(ctx.entry, ctx.uid));
    });
  }

  function requireQuorum(ctx) {
    const n = presentMembers(ctx.entry).length;
    return n < ctx.rs.min_players ? `Waiting for quorum: ${n} of ${ctx.rs.min_players} players are here.` : null;
  }

  // Begin Game (A2): resume an interrupted board, or deal a new one with
  // fresh role assignments.
  action('begin', (ctx) => {
    const { s, rs, entry } = ctx;
    if (s.status !== 'waiting') return null;
    const err = requireQuorum(ctx);
    if (err) return err;
    const ids = presentMembers(entry);
    if (s.resumable && currentBoard(s)) {
      ids.filter((id) => !s.roles[id]).forEach((id) => addFloater(s, id));
      s.status = 'playing';
      s.resumable = false;
      return null;
    }
    reassign(s, ids, rs);
    dealBoard(s, rs);
    return null;
  });

  // Next Board: same player assignments, new words.
  action('next-board', (ctx) => {
    const { s, rs } = ctx;
    if (s.status !== 'playing') return 'The game is not in progress.';
    const err = requireQuorum(ctx);
    if (err) return err;
    dealBoard(s, rs);
    return null;
  });

  // Next Game: new player assignments and new words.
  action('next-game', (ctx) => {
    const { s, rs, entry } = ctx;
    if (s.status !== 'playing') return 'The game is not in progress.';
    const err = requireQuorum(ctx);
    if (err) return err;
    reassign(s, presentMembers(entry), rs);
    dealBoard(s, rs);
    return null;
  });

  action('guess', (ctx, body) => {
    const { s, uid } = ctx;
    if (!mayClick(s, uid)) return "It isn't your turn to guess.";
    const board = currentBoard(s);
    const team = board.game.currentTeam();
    try {
      board.game.guess(body.index);
    } catch (err) {
      return err.message;
    }
    board.guesses.push({ team, word: board.game.words[body.index], color: board.game.layout[body.index] });
    return null;
  });

  action('end-turn', (ctx, body) => {
    const { s, uid } = ctx;
    const board = currentBoard(s);
    if (!board) return 'No board in play.';
    const g = board.game;
    // The timer may end a turn from any browser once it has run out.
    const expired =
      g.enforce_timer && Date.now() - Date.parse(g.round_started_at) >= g.timer_duration_ms;
    if (!mayClick(s, uid) && !expired) return "It isn't your turn.";
    g.nextTurn(body.round);
    return null;
  });

  action('floaters-can-click', (ctx, body) => {
    ctx.s.floatersCanClick = !!body.on;
    return null;
  });

  // Add Player (P1): permanently adds a registered player to the RuleSet.
  action('add-player', (ctx, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!email || !name) return 'Enter both an email and a name.';
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!user) return `${email} doesn't have a Clue Me In account yet. They need to create one first.`;
    if (isMember.get(ctx.rs.id, user.id)) return `${email} is already a player in this game.`;
    const taken = db
      .prepare('SELECT 1 FROM ruleset_members WHERE ruleset_id = ? AND player_name = ?')
      .get(ctx.rs.id, name);
    if (taken) return `The name "${name}" is already used in this game.`;
    db.prepare('INSERT INTO ruleset_members (ruleset_id, user_id, player_name) VALUES (?, ?, ?)').run(
      ctx.rs.id, user.id, name
    );
    return null;
  });
}

module.exports = { setupSessions };
