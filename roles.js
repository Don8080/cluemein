// Automatic role assignment ("Next Game" / Begin Game).
//
// Goals, in priority order (from the spec):
//   1. Spread the Cluer role AND the Floater role evenly (equal priority):
//      between any two players, Cluer turns counted from when the later of
//      them joined differ by at most 1, and so do Floater turns.
//   2. Don't repeat the same two Cluers facing off 2 or more times more than
//      another pair.
//   3. Don't pair the same Cluer and guesser more than 2 times more than
//      another Cluer–guesser pair.
//
// `stats` lives in the session and is updated here:
//   n        number of assignments so far
//   joined   userID -> assignment number when first seen
//   cluerAt  userID -> [assignment numbers when they were a Cluer]
//   floater  userID -> times a Floater
//   floatAt  userID -> [assignment numbers when they were a Floater]
//   faceoff  "a-b" -> times a and b were the two Cluers
//   pairs    "cluer>guesser" -> times together

let rand = Math.random;

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// All ways to choose k items from arr.
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// The item with the lowest score (arrays compare element by element).
function best(items, score) {
  let bestItem = null;
  let bestScore = null;
  for (const item of items) {
    const s = score(item);
    if (!bestScore || compareScores(s, bestScore) < 0) {
      bestItem = item;
      bestScore = s;
    }
  }
  return bestItem;
}

// Guessers per team for n players: as many as possible while each team
// (Cluer + guessers + all Floaters) still reaches the minimum team size.
function guessersPerTeam(n, minTeamSize) {
  return Math.max(0, Math.min(Math.floor((n - 2) / 2), n - 1 - minTeamSize));
}

function newStats() {
  return { n: 0, joined: {}, cluerAt: {}, floater: {}, floatAt: {}, faceoff: {}, pairs: {} };
}

// Register players seen for the first time. A newcomer's Floater count
// starts level with the least-floated player, so they don't jump the queue.
function register(stats, ids) {
  // Sessions saved before Floater turns were tracked start counting now.
  stats.floatAt = stats.floatAt || {};
  for (const id of Object.keys(stats.joined)) stats.floatAt[id] = stats.floatAt[id] || [];
  const known = ids.filter((id) => stats.joined[id] !== undefined);
  for (const id of ids) {
    if (stats.joined[id] !== undefined) continue;
    stats.joined[id] = stats.n;
    stats.cluerAt[id] = [];
    stats.floatAt[id] = [];
    const floats = known.map((k) => stats.floater[k] || 0);
    stats.floater[id] = floats.length ? Math.min(...floats) : 0;
  }
}

// Goal 1 check: would giving `bump` one more turn (as recorded in
// stats[key]: 'cluerAt' or 'floatAt') keep every pair of players within 1
// turn of each other, counted from the later of the two joining?
function turnsFair(stats, key, ids, bump) {
  const since = (id, t) => stats[key][id].filter((x) => x >= t).length + (bump.includes(id) ? 1 : 0);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const t = Math.max(stats.joined[ids[i]], stats.joined[ids[j]]);
      if (Math.abs(since(ids[i], t) - since(ids[j], t)) > 1) return false;
    }
  }
  return true;
}
const cluersFair = (stats, ids, bump) => turnsFair(stats, 'cluerAt', ids, bump);
const floatersFair = (stats, ids, bump) => turnsFair(stats, 'floatAt', ids, bump);
// Turns since this player joined (tie-breaks).
const recent = (stats, key, id) => stats[key][id].filter((x) => x >= stats.joined[id]).length;

// Face-off balance over the present players: [spread, sum of squares].
function faceoffScore(stats, ids) {
  let min = Infinity;
  let max = 0;
  let sq = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const c = stats.faceoff[pairKey(ids[i], ids[j])] || 0;
      min = Math.min(min, c);
      max = Math.max(max, c);
      sq += c * c;
    }
  }
  return [max - min, sq];
}

function applyCluers(stats, [a, b]) {
  stats.cluerAt[a].push(stats.n);
  stats.cluerAt[b].push(stats.n);
  stats.faceoff[pairKey(a, b)] = (stats.faceoff[pairKey(a, b)] || 0) + 1;
  stats.n++;
}

function undoCluers(stats, [a, b]) {
  stats.n--;
  stats.cluerAt[a].pop();
  stats.cluerAt[b].pop();
  stats.faceoff[pairKey(a, b)]--;
}

// Best face-off score reachable within `depth` more assignments of fair
// Cluer pairs (the same players staying).
function lookahead(stats, ids, depth) {
  const here = faceoffScore(stats, ids);
  if (depth === 0) return here;
  const fair = combinations(ids, 2).filter((p) => cluersFair(stats, ids, p));
  if (!fair.length) return here;
  let bestScore = null;
  for (const p of fair) {
    applyCluers(stats, p);
    const s = lookahead(stats, ids, depth - 1);
    undoCluers(stats, p);
    if (!bestScore || compareScores(s, bestScore) < 0) bestScore = s;
  }
  return bestScore;
}

// How many games ahead to plan Cluer face-offs; fewer for big groups,
// where there are plenty of fresh pairs anyway.
const planDepth = (n) => (n <= 6 ? 4 : n <= 8 ? 3 : 2);

// Goal 1 first: a Cluer pair that keeps both Cluer and Floater turns even
// (equal priority: the fewest of the two rules broken). Then goals 2 and 3:
// the best face-off balance (now and a few games ahead), then the best
// Cluer–guesser balance the pair allows.
//
// Cluers and Floaters are chosen together, looking a few games ahead: a
// choice that is fair now but leaves no fair choice later (e.g. the one
// player due to float is also due to be a Cluer) loses to one that doesn't.
// Returns { pair: [cluer, cluer], floaters }.
function chooseCluers(stats, ids, g) {
  const depth = planDepth(ids.length);
  const options = [];
  for (const p of combinations(ids, 2)) {
    const rest = ids.filter((id) => !p.includes(id));
    for (const floaters of combinations(rest, rest.length - 2 * g)) options.push({ pair: p, floaters });
  }

  // Cheap scores first, cached per Cluer pair where they depend only on it.
  const perPair = {};
  const pairInfo = (p) => {
    const key = pairKey(p[0], p[1]);
    if (!perPair[key]) {
      const cluerOK = cluersFair(stats, ids, p);
      // When turns can't be kept even (players came and went), the fewest
      // recent turns go first.
      const turns = p.map((id) => recent(stats, 'cluerAt', id));
      applyCluers(stats, p);
      const now = faceoffScore(stats, ids);
      undoCluers(stats, p);
      perPair[key] = { cluerOK, catchUp: cluerOK ? [0, 0] : [Math.max(...turns), turns[0] + turns[1]], now, future: null };
    }
    return perPair[key];
  };
  const future = (p) => {
    const info = pairInfo(p);
    if (!info.future) {
      applyCluers(stats, p);
      info.future = info.cluerOK ? lookahead(stats, ids, depth - 1) : [0, 0];
      undoCluers(stats, p);
    }
    return info.future;
  };
  for (const o of options) {
    const info = pairInfo(o.pair);
    o.broken = (info.cluerOK ? 0 : 1) + (floatersFair(stats, ids, o.floaters) ? 0 : 1);
    o.cheap = [o.broken, ...info.catchUp, o.floaters.reduce((n, id) => n + recent(stats, 'floatAt', id), 0), info.now[0]];
  }
  options.sort((a, b) => compareScores(a.cheap, b.cheap));

  // Full score: the cheap part, then no dead end ahead, then face-offs ahead
  // and the Cluer–guesser balance.
  const full = (o) => {
    const split = bestSplit(stats, ids, o.pair[0], o.pair[1], g, o.floaters).score;
    const fut = future(o.pair);
    return [...o.cheap.slice(0, 1), o.deadEnd, ...o.cheap.slice(1), fut[0], split[0], split[1], fut[1], pairInfo(o.pair).now[1], split[2], rand()];
  };
  const deadEnd = (o) => {
    if (o.broken) return 1;
    applyTurns(stats, o.pair, o.floaters);
    const ok = fairAhead(stats, ids, g, Math.min(depth, 3) - 1);
    undoTurns(stats, o.pair, o.floaters);
    return ok ? 0 : 1;
  };

  // Walk groups of equal cheap score in order; the first group with an
  // option that has no dead end ahead holds the answer. Big groups (large
  // games) are sampled in random order: 25 dead-end-free options are plenty
  // to choose the best from.
  const ENOUGH = 25;
  for (let i = 0; i < options.length; ) {
    let j = i;
    while (j < options.length && compareScores(options[j].cheap, options[i].cheap) === 0) j++;
    const group = options.slice(i, j).map((o) => ({ o, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.o);
    const clear = [];
    for (const o of group) {
      o.deadEnd = deadEnd(o);
      if (o.deadEnd === 0 && clear.push(o) >= ENOUGH) break;
    }
    if (clear.length) return best(clear, full);
    i = j;
  }
  // Every choice breaks a rule now or later: the best by the same order.
  options.forEach((o) => (o.deadEnd = o.deadEnd ?? 1));
  return best(options.slice(0, Math.min(options.length, 200)), full);
}

// Record (or take back) one assignment's Cluers and Floaters, for planning.
function applyTurns(stats, pair, floaters) {
  floaters.forEach((id) => stats.floatAt[id].push(stats.n));
  applyCluers(stats, pair);
}
function undoTurns(stats, pair, floaters) {
  undoCluers(stats, pair);
  floaters.forEach((id) => stats.floatAt[id].pop());
}

// Can the next `depth` games all keep Cluer and Floater turns even?
function fairAhead(stats, ids, g, depth) {
  if (depth <= 0) return true;
  for (const p of combinations(ids, 2)) {
    if (!cluersFair(stats, ids, p)) continue;
    const rest = ids.filter((id) => !p.includes(id));
    for (const floaters of combinations(rest, rest.length - 2 * g)) {
      if (!floatersFair(stats, ids, floaters)) continue;
      applyTurns(stats, p, floaters);
      const ok = fairAhead(stats, ids, g, depth - 1);
      undoTurns(stats, p, floaters);
      if (ok) return true;
    }
  }
  return false;
}

// Cluer–guesser balance after a split: [spread, sum of squares] over all
// Cluer–guesser pairs among the present players.
function pairScore(stats, ids, extra) {
  let min = Infinity;
  let max = 0;
  let sq = 0;
  for (const c of ids) {
    for (const g of ids) {
      if (c === g) continue;
      const k = `${c}>${g}`;
      const v = (stats.pairs[k] || 0) + (extra.includes(k) ? 1 : 0);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sq += v * v;
    }
  }
  return [max - min, sq];
}

// Floaters and team split for the given Cluers: Floaters that keep Floater
// turns even (goal 1), favoring whoever has floated least since joining
// (or the given `fixedFloaters`); then the split that best balances
// Cluer–guesser pairings.
// Returns { floatFair, score: [pair spread, pair sum of squares, random], floaters, red, blue }.
function bestSplit(stats, ids, redCluer, blueCluer, g, fixedFloaters = null) {
  const rest = ids.filter((id) => id !== redCluer && id !== blueCluer);
  let result = null;
  for (const floaters of fixedFloaters ? [fixedFloaters] : combinations(rest, rest.length - 2 * g)) {
    const floatFair = floatersFair(stats, ids, floaters);
    const floatCost = floaters.reduce((n, id) => n + recent(stats, 'floatAt', id), 0);
    const guessers = rest.filter((id) => !floaters.includes(id));
    for (const red of combinations(guessers, g)) {
      const blue = guessers.filter((id) => !red.includes(id));
      const extra = [...red.map((id) => `${redCluer}>${id}`), ...blue.map((id) => `${blueCluer}>${id}`)];
      const [pairSpread, pairSq] = pairScore(stats, ids, extra);
      const full = [floatFair ? 0 : 1, floatCost, pairSpread, pairSq, rand()];
      if (!result || compareScores(full, result.full) < 0) {
        result = { full, floatFair, floaters, red, blue };
      }
    }
  }
  // Floater fairness is settled first; report the pairing balance.
  return { ...result, score: result.full.slice(2) };
}

// Returns { roles, floatersCanClick } for the present players `ids` and
// updates `stats`. roles: userID -> { team, role }.
function assignRoles(stats, ids, minTeamSize) {
  register(stats, ids);
  const g = guessersPerTeam(ids.length, minTeamSize);

  const choice = chooseCluers(stats, ids, g);
  const [c1, c2] = choice.pair;
  const [redCluer, blueCluer] = rand() < 0.5 ? [c1, c2] : [c2, c1];
  const { floaters, red, blue } = bestSplit(stats, ids, redCluer, blueCluer, g, choice.floaters);

  const roles = {};
  roles[redCluer] = { team: 'red', role: 'cluer' };
  roles[blueCluer] = { team: 'blue', role: 'cluer' };
  red.forEach((id) => (roles[id] = { team: 'red', role: 'guesser' }));
  blue.forEach((id) => (roles[id] = { team: 'blue', role: 'guesser' }));
  floaters.forEach((id) => (roles[id] = { team: null, role: 'floater' }));

  floaters.forEach((id) => stats.floatAt[id].push(stats.n)); // this assignment's number
  applyCluers(stats, [c1, c2]);
  const inc = (obj, key) => (obj[key] = (obj[key] || 0) + 1);
  red.forEach((id) => inc(stats.pairs, `${redCluer}>${id}`));
  blue.forEach((id) => inc(stats.pairs, `${blueCluer}>${id}`));
  floaters.forEach((id) => inc(stats.floater, id));

  // Floaters may click automatically when there are no guessers at all.
  return { roles, floatersCanClick: g === 0 };
}

// Fixed Teams: the teams stay as they are; pick one new Cluer from each
// (`red` and `blue` are the present members of each team) by goals 1 and 2
// only: keep Cluer turns even where the teams allow, then the least-repeated
// face-off, then whoever has had the fewest turns, then at random. Records
// the turns, face-off and pairings. Returns [redCluer, blueCluer].
function chooseTeamCluers(stats, ids, red, blue) {
  register(stats, ids);
  const recent = (id) => stats.cluerAt[id].filter((x) => x >= stats.joined[id]).length;
  const options = [];
  red.forEach((r) => blue.forEach((b) => options.push([r, b])));
  const [redCluer, blueCluer] = best(options, (p) => {
    applyCluers(stats, p);
    const face = faceoffScore(stats, ids);
    undoCluers(stats, p);
    return [cluersFair(stats, ids, p) ? 0 : 1, face[0], recent(p[0]) + recent(p[1]), face[1], rand()];
  });
  applyCluers(stats, [redCluer, blueCluer]);
  const inc = (key) => (stats.pairs[key] = (stats.pairs[key] || 0) + 1);
  red.filter((id) => id !== redCluer).forEach((id) => inc(`${redCluer}>${id}`));
  blue.filter((id) => id !== blueCluer).forEach((id) => inc(`${blueCluer}>${id}`));
  return [redCluer, blueCluer];
}

// A Cluer left mid-game: choose which of `guessers` (their team's
// guessers) takes over, preferring whoever keeps Cluer turns fairest, then
// the least-repeated face-off with `otherCluer`. Records the new Cluer
// turn, face-off and pairings. Returns the chosen user ID.
function promoteCluer(stats, ids, guessers, otherCluer, teammates) {
  register(stats, ids);
  const pick = best(guessers, (c) => [
    cluersFair(stats, ids, [c]) ? 0 : 1,
    stats.cluerAt[c].filter((x) => x >= stats.joined[c]).length,
    otherCluer ? stats.faceoff[pairKey(c, otherCluer)] || 0 : 0,
    rand(),
  ]);
  stats.cluerAt[pick].push(stats.n);
  if (otherCluer) stats.faceoff[pairKey(pick, otherCluer)] = (stats.faceoff[pairKey(pick, otherCluer)] || 0) + 1;
  stats.n++;
  teammates
    .filter((id) => id !== pick)
    .forEach((id) => (stats.pairs[`${pick}>${id}`] = (stats.pairs[`${pick}>${id}`] || 0) + 1));
  return pick;
}

// A guesser chose to take over their team's Cluer role: the new
// assignment counts toward rotation (the dropped one isn't undone).
function recordCluer(stats, ids, cluer, otherCluer, teammates) {
  register(stats, ids);
  stats.cluerAt[cluer].push(stats.n);
  if (otherCluer) stats.faceoff[pairKey(cluer, otherCluer)] = (stats.faceoff[pairKey(cluer, otherCluer)] || 0) + 1;
  stats.n++;
  teammates
    .filter((id) => id !== cluer)
    .forEach((id) => (stats.pairs[`${cluer}>${id}`] = (stats.pairs[`${cluer}>${id}`] || 0) + 1));
}

module.exports = {
  assignRoles,
  chooseTeamCluers,
  promoteCluer,
  recordCluer,
  newStats,
  register,
  guessersPerTeam,
  pairKey,
  setRandom: (fn) => (rand = fn), // for tests
};
