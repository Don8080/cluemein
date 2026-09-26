// Automatic role assignment ("Next Game" / Begin Game).
//
// Goals, in priority order (from the spec):
//   1. Spread the Cluer role evenly: between any two players, Cluer turns
//      counted from when the later of them joined differ by at most 1.
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
  return { n: 0, joined: {}, cluerAt: {}, floater: {}, faceoff: {}, pairs: {} };
}

// Register players seen for the first time. A newcomer's Floater count
// starts level with the least-floated player, so they don't jump the queue.
function register(stats, ids) {
  const known = ids.filter((id) => stats.joined[id] !== undefined);
  for (const id of ids) {
    if (stats.joined[id] !== undefined) continue;
    stats.joined[id] = stats.n;
    stats.cluerAt[id] = [];
    const floats = known.map((k) => stats.floater[k] || 0);
    stats.floater[id] = floats.length ? Math.min(...floats) : 0;
  }
}

// Goal 1 check: would making `bump` the Cluers keep every pair of players
// within 1 Cluer turn of each other (counted from the later join)?
function cluersFair(stats, ids, bump) {
  const since = (id, t) => stats.cluerAt[id].filter((x) => x >= t).length + (bump.includes(id) ? 1 : 0);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const t = Math.max(stats.joined[ids[i]], stats.joined[ids[j]]);
      if (Math.abs(since(ids[i], t) - since(ids[j], t)) > 1) return false;
    }
  }
  return true;
}

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

// Goals 2 then 3: among fair Cluer pairs, the best face-off balance (now and
// a few games ahead), then the best Cluer–guesser balance they allow.
function chooseCluers(stats, ids, g) {
  const all = combinations(ids, 2);
  const fair = all.filter((p) => cluersFair(stats, ids, p));
  if (!fair.length) {
    // Can happen after players come and go: take the fewest recent turns.
    const recent = (id) => stats.cluerAt[id].filter((x) => x >= stats.joined[id]).length;
    return best(all, ([a, b]) => [Math.max(recent(a), recent(b)), recent(a) + recent(b), rand()]);
  }
  const depth = planDepth(ids.length);
  return best(fair, (p) => {
    applyCluers(stats, p);
    const future = lookahead(stats, ids, depth - 1);
    const now = faceoffScore(stats, ids);
    undoCluers(stats, p);
    const split = bestSplit(stats, ids, p[0], p[1], g).score;
    return [now[0], future[0], split[0], split[1], future[1], now[1], split[2], rand()];
  });
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

// Floaters and team split for the given Cluers: whoever has floated least
// floats; then the split that best balances Cluer–guesser pairings.
// Returns { score: [floatCost + pair spread, pair sum of squares, random], floaters, red, blue }.
function bestSplit(stats, ids, redCluer, blueCluer, g) {
  const rest = ids.filter((id) => id !== redCluer && id !== blueCluer);
  let result = null;
  for (const floaters of combinations(rest, rest.length - 2 * g)) {
    const floatCost = floaters.reduce((n, id) => n + stats.floater[id], 0);
    const guessers = rest.filter((id) => !floaters.includes(id));
    for (const red of combinations(guessers, g)) {
      const blue = guessers.filter((id) => !red.includes(id));
      const extra = [...red.map((id) => `${redCluer}>${id}`), ...blue.map((id) => `${blueCluer}>${id}`)];
      const [pairSpread, pairSq] = pairScore(stats, ids, extra);
      const full = [floatCost, pairSpread, pairSq, rand()];
      if (!result || compareScores(full, result.full) < 0) {
        result = { full, floaters, red, blue };
      }
    }
  }
  // Floater fairness is settled first; report the pairing balance.
  return { ...result, score: result.full.slice(1) };
}

// Returns { roles, floatersCanClick } for the present players `ids` and
// updates `stats`. roles: userID -> { team, role }.
function assignRoles(stats, ids, minTeamSize) {
  register(stats, ids);
  const g = guessersPerTeam(ids.length, minTeamSize);

  const [c1, c2] = chooseCluers(stats, ids, g);
  const [redCluer, blueCluer] = rand() < 0.5 ? [c1, c2] : [c2, c1];
  const { floaters, red, blue } = bestSplit(stats, ids, redCluer, blueCluer, g);

  const roles = {};
  roles[redCluer] = { team: 'red', role: 'cluer' };
  roles[blueCluer] = { team: 'blue', role: 'cluer' };
  red.forEach((id) => (roles[id] = { team: 'red', role: 'guesser' }));
  blue.forEach((id) => (roles[id] = { team: 'blue', role: 'guesser' }));
  floaters.forEach((id) => (roles[id] = { team: null, role: 'floater' }));

  applyCluers(stats, [c1, c2]);
  const inc = (obj, key) => (obj[key] = (obj[key] || 0) + 1);
  red.forEach((id) => inc(stats.pairs, `${redCluer}>${id}`));
  blue.forEach((id) => inc(stats.pairs, `${blueCluer}>${id}`));
  floaters.forEach((id) => inc(stats.floater, id));

  // Floaters may click automatically when there are no guessers at all.
  return { roles, floatersCanClick: g === 0 };
}

module.exports = {
  assignRoles,
  newStats,
  register,
  guessersPerTeam,
  pairKey,
  setRandom: (fn) => (rand = fn), // for tests
};
