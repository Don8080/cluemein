// Game logic ported from HorsePaste's game.go.
const crypto = require('crypto');

const WORDS_PER_GAME = 25;

// Small seeded PRNG so a word set's shuffle order is reproducible from its seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, n) {
  return Math.floor(rng() * n);
}

function perm(rng, n) {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

function newSeed() {
  return crypto.randomInt(1, 2 ** 31);
}

function otherTeam(t) {
  if (t === 'red') return 'blue';
  if (t === 'blue') return 'red';
  return t;
}

// The persistent part of a game: enough to rebuild the board.
function randomState(words) {
  return {
    seed: newSeed(),
    perm_index: 0,
    round: 0,
    revealed: new Array(WORDS_PER_GAME).fill(false),
    word_set: words,
  };
}

// Advance to the next 25 words of the same shuffled word set, reshuffling
// when the set runs out.
function nextGameState(state) {
  let permIndex = state.perm_index + WORDS_PER_GAME;
  let seed = state.seed;
  if (permIndex + WORDS_PER_GAME >= state.word_set.length) {
    seed = newSeed();
    permIndex = 0;
  }
  return {
    seed,
    perm_index: permIndex,
    round: 0,
    revealed: new Array(WORDS_PER_GAME).fill(false),
    word_set: state.word_set,
  };
}

class Game {
  constructor(id, state, opts = {}) {
    // Same seed => same word order; seed * (permIndex+1) => distinct layouts per board.
    const seedRnd = mulberry32(state.seed);
    const randRnd = mulberry32(Math.imul(state.seed, state.perm_index + 1));

    const now = new Date().toISOString();
    this.id = id;
    this.seed = state.seed;
    this.perm_index = state.perm_index;
    this.round = state.round;
    this.revealed = [...state.revealed];
    this.created_at = now;
    this.updated_at = now;
    this.round_started_at = now;
    this.starting_team = randInt(randRnd, 2) === 0 ? 'red' : 'blue';
    this.winning_team = null;
    // Turn timer: the first turn of a board may get longer than the rest.
    this.first_turn_ms = opts.first_turn_ms || 0;
    this.next_turn_ms = opts.next_turn_ms || 0;
    this.enforce_timer = !!opts.enforce_timer;
    this.version = 0;

    const p = perm(seedRnd, state.word_set.length);
    this.words = p
      .slice(state.perm_index, state.perm_index + WORDS_PER_GAME)
      .map((i) => state.word_set[i]);

    const layout = [
      ...new Array(8).fill('red'),
      ...new Array(8).fill('blue'),
      ...new Array(7).fill('neutral'),
      'black',
      this.starting_team,
    ];
    this.layout = perm(randRnd, layout.length).map((i) => layout[i]);
  }

  // A Game saves as plain JSON (its own fields); restore() rebuilds it.
  static restore(data) {
    return Object.assign(Object.create(Game.prototype), data);
  }

  // Length of the current turn in ms (0 = no timer).
  turnDurationMs() {
    return this.round === 0 ? this.first_turn_ms : this.next_turn_ms;
  }

  touch() {
    this.version++;
    this.updated_at = new Date().toISOString();
  }

  currentTeam() {
    return this.round % 2 === 0 ? this.starting_team : otherTeam(this.starting_team);
  }

  anyRevealed() {
    return this.revealed.some(Boolean);
  }

  checkWinningCondition() {
    if (this.winning_team) return;
    let redRemaining = false;
    let blueRemaining = false;
    this.layout.forEach((t, i) => {
      if (this.revealed[i]) return;
      if (t === 'red') redRemaining = true;
      if (t === 'blue') blueRemaining = true;
    });
    if (!redRemaining) this.winning_team = 'red';
    if (!blueRemaining) this.winning_team = 'blue';
  }

  // Returns false (no change) if the turn already moved on.
  nextTurn(currentRound) {
    if (this.winning_team) return false;
    if (this.round !== currentRound) return false;
    this.round++;
    this.round_started_at = new Date().toISOString();
    this.touch();
    return true;
  }

  // Throws on an invalid guess.
  guess(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.layout.length) {
      throw new Error(`index ${idx} is invalid`);
    }
    if (this.revealed[idx]) throw new Error('cell has already been revealed');
    if (this.winning_team) throw new Error('game is over');

    this.revealed[idx] = true;
    if (this.layout[idx] === 'black') {
      this.winning_team = otherTeam(this.currentTeam());
    } else {
      this.checkWinningCondition();
      if (this.layout[idx] !== this.currentTeam()) {
        this.round++;
        this.round_started_at = new Date().toISOString();
      }
    }
    this.touch();
  }

  remaining(team) {
    return this.layout.filter((t, i) => t === team && !this.revealed[i]).length;
  }
}

module.exports = { Game, randomState, nextGameState, WORDS_PER_GAME };
