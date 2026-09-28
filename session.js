// Live play sessions: Waiting Room (A2), presence, automatic role
// assignment, and the board (C1) with turn-locked clicking.
//
// A RuleSet has at most one session. Its state is kept in memory and saved
// to the play_sessions table after every change, so boards survive a
// server restart. Browsers long-poll /state, which doubles as a presence
// heartbeat.
const { Game, randomState, nextGameState } = require('./game');
const { assignRoles, newStats, promoteCluer, recordCluer, register } = require('./roles');

// Silent this long => no longer present. PRESENCE_GRACE_MS overrides it for testing.
const GRACE_MS = Number(process.env.PRESENCE_GRACE_MS) || 2 * 60 * 1000;
const CLOSING_TAB_MS = 15 * 1000; // after a tab closes (long enough for a reload)
const LONG_POLL_MS = 15 * 1000;
const SWEEP_MS = 5 * 1000;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
    s.loggedOff = s.loggedOff || [];
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
      boards: [], // { game, roles (as dealt), guesses: [{ team, word, color }] }
      current: -1,
      resumable: false, // a board was interrupted by dropping below quorum
      stats: newStats(), // role-rotation history (see roles.js)
      presentIDs: [],
      loggedOff: [], // players removed with Log Off, until they click Play again
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
    entry.s.endedAt = Date.now();
    db.prepare('UPDATE rulesets SET last_session_ended_at = ? WHERE id = ?').run(entry.s.endedAt, entry.s.rulesetID);
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    waiters.forEach((fn) => fn());
  }

  // ---- Presence ------------------------------------------------------------

  function presentIDs(entry) {
    const now = Date.now();
    const loggedOff = entry.s.loggedOff || [];
    const ids = [];
    for (const [uid, tabs] of entry.presence) {
      if (loggedOff.includes(uid)) continue;
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
    s.floatersAuto = floatersCanClick; // switched on automatically, not by a player
  }

  // Every team needs a present Cluer. When one is missing, promote one of
  // that team's guessers by the fairness rules, as long as the team still
  // reaches the minimum team size; otherwise reassign everyone. A new Cluer
  // has seen the board as a guesser, so a new board is dealt.
  // Returns true if roles changed.
  function ensureCluers(s, rs, entry) {
    const present = presentMembers(entry);
    let changedRoles = false;
    for (const team of ['red', 'blue']) {
      const cluerID = Object.keys(s.roles).map(Number).find((id) => s.roles[id].team === team && s.roles[id].role === 'cluer');
      if (cluerID && present.includes(cluerID)) continue;
      if (cluerID) delete s.roles[cluerID];
      const guessers = present.filter((id) => s.roles[id]?.team === team && s.roles[id].role === 'guesser');
      const floaters = present.filter((id) => s.roles[id]?.role === 'floater').length;
      // After promotion: 1 Cluer + remaining guessers + all Floaters.
      if (!guessers.length || guessers.length + floaters < rs.min_team_size) {
        reassign(s, present, rs);
        return true;
      }
      const other = present.find((id) => s.roles[id]?.team !== team && s.roles[id]?.role === 'cluer');
      const pick = promoteCluer(s.stats, present, guessers, other, guessers);
      s.roles[pick] = { team, role: 'cluer' };
      changedRoles = true;
    }
    return changedRoles;
  }

  // ---- Boards --------------------------------------------------------------

  function currentBoard(s) {
    return s.current >= 0 ? s.boards[s.current] : null;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // The game's vocabulary, re-read for each board so Modify Vocabulary
  // edits made during a session take effect on the next board.
  function refreshWords(s) {
    const words = db
      .prepare('SELECT word FROM ruleset_words WHERE ruleset_id = ? ORDER BY word')
      .all(s.rulesetID)
      .map((r) => r.word);
    if (words.length >= 25 && words.join('\n') !== s.words.join('\n')) {
      s.words = words;
      s.deck = null; // reshuffle the new vocabulary
    }
  }

  function dealBoard(s, rs) {
    // Remember the roles as they ended on the board being left (Prev Game
    // restores them).
    const leaving = currentBoard(s);
    if (leaving) leaving.finalRoles = clone(s.roles);
    refreshWords(s);
    const next = s.deck
      ? nextGameState({ ...s.deck, word_set: s.words })
      : randomState(s.words);
    s.deck = { seed: next.seed, perm_index: next.perm_index };
    const game = new Game(String(s.boards.length + 1), next, {
      first_turn_ms: rs.timer_on ? rs.first_turn_seconds * 1000 : 0,
      next_turn_ms: rs.timer_on ? rs.next_turn_seconds * 1000 : 0,
      enforce_timer: !!(rs.timer_on && rs.enforce_timer),
    });
    // marks: word indexes each team's guessers flagged for later.
    s.boards.push({ game, roles: clone(s.roles), guesses: [], marks: { red: [], blue: [] } });
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
    if (s.ended) return { ended: s.ended, ended_at: s.endedAt };
    if (s.loggedOff.includes(uid)) return { logged_off: true };
    const rs = getRuleset.get(s.rulesetID);
    const present = new Set(presentIDs(entry));
    const players = getMembers.all(s.rulesetID).map((m) => ({
      user_id: m.user_id,
      name: m.name,
      present: present.has(m.user_id),
      team: s.roles[m.user_id]?.team ?? null,
      role: s.roles[m.user_id]?.role ?? null,
      // Role changed since this board was dealt (shown with an asterisk).
      changed: !!(currentBoard(s) && s.roles[m.user_id] && JSON.stringify(currentBoard(s).roles[m.user_id]) !== JSON.stringify(s.roles[m.user_id])),
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
      boards_played: s.boards.length, // 0 before the session's first game
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
        timer_duration_ms: g.turnDurationMs(),
        enforce_timer: g.enforce_timer,
        guesses: board.guesses,
        // Marks are for guessers; Cluers don't see them.
        marks: isCluer ? { red: [], blue: [] } : board.marks || { red: [], blue: [] },
        can_mark: s.roles[uid]?.role === 'guesser' && !over,
        has_prev: s.current > 0,
        can_click: mayClick(s, uid),
        // A turn can only be ended after at least one guess.
        guessed_this_turn: board.guesses.some((x) => x.round === g.round),
        // Time ran out with no guess: one guess allowed, then the turn ends.
        last_guess: board.lastGuessRound === g.round,
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
      res.json({ ended: 'none', ended_at: rs.last_session_ended_at || null });
      return null;
    }
    return { entry, s: entry.s, rs, uid };
  }

  // Heartbeat bookkeeping shared by /join and /state.
  function checkIn(ctx, tab) {
    const { entry, s, uid } = ctx;
    if (s.loggedOff.includes(uid)) return; // logged off: no longer counts as here
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
    ctx.s.loggedOff = ctx.s.loggedOff.filter((id) => id !== ctx.uid); // Play again rejoins
    checkIn(ctx, req.body.tab);
    res.json(view(ctx.entry, ctx.uid));
  });

  // Long-poll for changes; also the presence heartbeat.
  app.post('/api/play/:rid/state', requireAuth, (req, res) => {
    const ctx = load(req, res);
    if (!ctx) return;
    const { entry, s, uid } = ctx;
    checkIn(ctx, req.body.tab);
    if (req.body.version !== s.version || s.loggedOff.includes(uid)) return res.json(view(entry, uid));

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
      if (ctx.s.loggedOff.includes(ctx.uid)) return res.status(400).json({ error: "You have left this session. Click Join Session to rejoin." });
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
      // A Cluer who is no longer here must be replaced (new board).
      if (ensureCluers(s, rs, entry)) dealBoard(s, rs);
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
    const round = board.game.round;
    try {
      board.game.guess(body.index);
    } catch (err) {
      return err.message;
    }
    // `round` groups a team's guesses by turn for the guess lists.
    const word = board.game.words[body.index];
    const sameTurn = board.guesses.filter((g) => g.round === round && g.team === team);
    board.guesses.push({ team, round, word, color: board.game.layout[body.index] });
    countPairs(word, sameTurn.map((g) => g.word));
    if (board.game.winning_team) recordResult(ctx, board);
    // Time ran out before this turn's first guess: that one guess ends it.
    else if (board.lastGuessRound === round) {
      board.game.nextTurn(round); // no effect if a wrong guess already ended it
      board.lastGuessRound = null;
    }
    return null;
  });

  // Word-pair tally (all games): each new guess pairs with every earlier
  // guess of the same turn.
  const addPair = db.prepare(
    `INSERT INTO word_pairs (word_a, word_b, count) VALUES (?, ?, 1)
     ON CONFLICT(word_a, word_b) DO UPDATE SET count = count + 1`
  );
  function countPairs(word, earlier) {
    for (const other of earlier) {
      const [a, b] = word < other ? [word, other] : [other, word];
      addPair.run(a, b);
    }
  }

  // Outcome of a finished board: "Blue by 3" (3 unguessed Red words left)
  // or "Red by Assassination" (Blue guessed the Assassin).
  function boardResult(board) {
    const g = board.game;
    if (!g.winning_team) return null;
    const loser = g.winning_team === 'red' ? 'blue' : 'red';
    const assassinated = board.guesses.some((x) => x.color === 'black');
    return {
      winner: g.winning_team,
      by_assassination: assassinated,
      margin: assassinated ? null : g.remaining(loser),
      text: assassinated ? `${cap(g.winning_team)} by Assassination` : `${cap(g.winning_team)} by ${g.remaining(loser)}`,
    };
  }

  // Player history: one row per Cluer and guesser (not Floaters) when a
  // board is played to completion, using the final role configuration.
  const addHistory = db.prepare(
    `INSERT INTO player_history (ruleset_id, user_id, role, won, by_assassination, margin)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  function recordResult(ctx, board) {
    if (board.recorded) return;
    board.recorded = true;
    const result = boardResult(board);
    for (const [id, r] of Object.entries(ctx.s.roles)) {
      if (r.role === 'floater' || !r.team) continue;
      addHistory.run(
        ctx.rs.id, Number(id), r.role, r.team === result.winner ? 1 : 0,
        result.by_assassination ? 1 : 0, result.margin
      );
    }
  }

  // Mark (right-click or Safe Click Mode): a guesser flags a word for later
  // for their team; marking it again clears their team's mark. Floaters
  // and Cluers can't mark.
  action('mark', (ctx, body) => {
    const { s, uid } = ctx;
    const board = currentBoard(s);
    const r = s.roles[uid];
    if (s.status !== 'playing' || !board || board.game.winning_team) return 'No board in play.';
    if (r?.role !== 'guesser') return 'Only guessers can mark words.';
    const idx = body.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= board.game.words.length || board.game.revealed[idx]) {
      return 'That word can not be marked.';
    }
    board.marks = board.marks || { red: [], blue: [] };
    const list = board.marks[r.team];
    const at = list.indexOf(idx);
    if (at >= 0) list.splice(at, 1);
    else list.push(idx);
    return null;
  });

  // (D1) Session History: every board of this session with its teams,
  // guesses by turn, result and final board. Unfinished boards keep their
  // unrevealed colors hidden (except from that board's Cluers), since play
  // can return to them with Prev Game.
  app.post('/api/play/:rid/history', requireAuth, (req, res) => {
    const ctx = load(req, res);
    if (!ctx) return;
    const { s, uid } = ctx;
    const names = new Map(getMembers.all(s.rulesetID).map((m) => [m.user_id, m.name]));
    const nameOf = (id) => names.get(Number(id)) || 'Former player';
    const boards = s.boards.map((b, i) => {
      const g = b.game;
      // Final roles: as left, or live for the current board.
      const roles = i === s.current ? s.roles : b.finalRoles || b.roles;
      const members = (pred) =>
        Object.entries(roles)
          .filter(([, r]) => pred(r))
          .sort(([, a], [, b2]) => (a.role === 'cluer' ? -1 : b2.role === 'cluer' ? 1 : 0))
          .map(([id, r]) => ({ name: nameOf(id), cluer: r.role === 'cluer' }));
      const over = !!g.winning_team;
      const sawColors = roles[uid]?.role === 'cluer';
      // Guesses grouped into turns.
      const turns = [];
      b.guesses.forEach((x, j) => {
        const prev = b.guesses[j - 1];
        if (!prev || prev.round !== x.round || prev.team !== x.team) turns.push({ team: x.team, number: x.round !== undefined ? x.round + 1 : null, guesses: [] });
        turns[turns.length - 1].guesses.push({ word: x.word, color: x.color });
      });
      return {
        number: i + 1,
        current: i === s.current,
        first_team: g.starting_team,
        red: members((r) => r.team === 'red'),
        blue: members((r) => r.team === 'blue'),
        floaters: members((r) => r.role === 'floater'),
        turns,
        result: boardResult(b)?.text || null,
        winner: g.winning_team || null,
        final_board: {
          words: g.words,
          layout: g.layout.map((c, k) => (over || sawColors || g.revealed[k] ? c : 'hidden')),
          revealed: g.revealed,
          remaining: { red: g.remaining('red'), blue: g.remaining('blue') },
          winning_team: g.winning_team,
        },
      };
    });
    res.json({ boards });
  });

  // Prev Game: go back to the previous board of this session, with the
  // roles as they were when it was left.
  action('prev-board', (ctx) => {
    const { s } = ctx;
    if (s.status !== 'playing') return 'The game is not in progress.';
    if (s.current <= 0) return 'This is the first board of the session.';
    currentBoard(s).finalRoles = clone(s.roles);
    s.current--;
    const board = currentBoard(s);
    s.roles = clone(board.finalRoles || board.roles);
    // Players who have since left drop out; newcomers become Floaters.
    s.loggedOff.forEach((id) => delete s.roles[id]);
    presentMembers(ctx.entry)
      .filter((id) => !s.roles[id])
      .forEach((id) => addFloater(s, id));
    return null;
  });

  action('end-turn', (ctx, body) => {
    const { s, uid } = ctx;
    const board = currentBoard(s);
    if (!board) return 'No board in play.';
    const g = board.game;
    // The timer may end a turn from any browser once it has run out.
    const expired =
      g.enforce_timer && Date.now() - Date.parse(g.round_started_at) >= g.turnDurationMs();
    if (!mayClick(s, uid) && !expired) return "It isn't your turn.";
    // A turn needs at least one guess. If an enforced timer runs out before
    // any guess, the team gets exactly one more guess and then the turn
    // ends (see 'guess').
    if (!board.guesses.some((x) => x.round === g.round)) {
      if (!expired) return 'Make at least one guess before ending the turn.';
      if (body.round === g.round) board.lastGuessRound = g.round;
      return null;
    }
    g.nextTurn(body.round);
    return null;
  });

  // Change a player's role (any player may do this for any player):
  //   'red' / 'blue'  become a guesser on that team
  //   'floater'       float
  //   'cluer'         a guesser takes over their team's Cluer role; the old
  //                   Cluer becomes a guesser on the same team and a new
  //                   board is dealt, since the new Cluer has seen this one.
  // Cluers can't switch teams.
  action('set-role', (ctx, body) => {
    const { s, rs, entry } = ctx;
    const target = Number(body.user_id);
    const cur = s.roles[target];
    if (s.status !== 'playing' || !cur) return 'That player has no role in this game.';
    if (cur.role === 'cluer') return 'Cluers can not switch teams.';
    const to = body.to;
    if (to === 'red' || to === 'blue') {
      s.roles[target] = { team: to, role: 'guesser' };
    } else if (to === 'floater') {
      s.roles[target] = { team: null, role: 'floater' };
    } else if (to === 'cluer') {
      if (cur.role !== 'guesser') return 'Only a guesser can take over their team\'s Cluer role.';
      const team = cur.team;
      const ids = Object.keys(s.roles).map(Number);
      const oldCluer = ids.find((id) => s.roles[id].team === team && s.roles[id].role === 'cluer');
      if (oldCluer) s.roles[oldCluer] = { team, role: 'guesser' };
      s.roles[target] = { team, role: 'cluer' };
      const other = ids.find((id) => s.roles[id].team !== team && s.roles[id].role === 'cluer');
      const teammates = ids.filter((id) => s.roles[id].team === team && s.roles[id].role === 'guesser');
      recordCluer(s.stats, presentMembers(entry), target, other, teammates);
      dealBoard(s, rs);
    } else {
      return 'Unknown role.';
    }
    // Floaters may click automatically when nobody is a guesser.
    // Floaters Can Click follows the roles while it was set automatically:
    // on when nobody is a guesser, off again once both teams have a guesser.
    const roles = Object.values(s.roles);
    const hasGuesser = (team) => roles.some((r) => r.role === 'guesser' && r.team === team);
    if (!hasGuesser('red') && !hasGuesser('blue')) {
      s.floatersCanClick = true;
      s.floatersAuto = true;
    } else if (s.floatersAuto && hasGuesser('red') && hasGuesser('blue')) {
      s.floatersCanClick = false;
      s.floatersAuto = false;
    }
    return null;
  });

  // Leave the Session (any player, for any player): removes them from the
  // session at once. A departing Cluer is replaced by a teammate (fairness
  // rules), and if too few players remain, everyone returns to the Waiting
  // Room.
  action('log-off', (ctx, body) => {
    const { s, rs, entry } = ctx;
    const target = Number(body.user_id);
    if (!isMember.get(rs.id, target)) return 'That player is not in this game.';
    if (!s.loggedOff.includes(target)) s.loggedOff.push(target);
    entry.presence.delete(target);
    const wasCluer = s.roles[target]?.role === 'cluer';
    delete s.roles[target];
    const board = currentBoard(s);
    if (board) delete board.roles[target];
    if (s.status !== 'playing') return null;
    if (presentMembers(entry).length < rs.min_players) {
      s.status = 'waiting';
      s.resumable = !!(board && !board.game.winning_team);
      return null;
    }
    if (wasCluer && ensureCluers(s, rs, entry)) dealBoard(s, rs);
    return null;
  });

  action('floaters-can-click', (ctx, body) => {
    ctx.s.floatersCanClick = !!body.on;
    ctx.s.floatersAuto = false; // a player chose; leave it alone from now on
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
