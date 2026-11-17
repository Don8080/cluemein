// Marks where long words may split, with soft hyphens (U+00AD): invisible
// unless the word has to wrap, then shown as "-" at the end of the line.
// Simple English syllable rules, no dictionary. Between two vowels, the
// next syllable takes the longest group of consonants that can start one:
//   o-pen, hel-lo, ex-tra, tele-phone, play-ground, earth-quake, kit-chen;
// ck and gh stay with the syllable before (pock-et, laugh-ter), and so do
// th, sh, ch... before an ending (wash-ing). At least 2 letters before a
// split and 3 after; words under 6 letters are left alone.
const SHY = String.fromCharCode(0xad); // soft hyphen
// Consonant groups that can start a syllable (besides any single consonant).
const ONSETS = new Set([
  'th', 'ph', 'ch', 'sh', 'wh',
  'thr', 'shr', 'chr', 'phr',
  'br', 'cr', 'dr', 'fr', 'gr', 'kr', 'pr', 'tr',
  'bl', 'cl', 'fl', 'gl', 'kl', 'pl',
  'tl', 'dl', // bat-tle, nee-dle
]);
const ENDERS = new Set(['ck', 'gh']);
const ENDINGS = new Set(['ing', 'ings', 'er', 'ers', 'ed', 'es', 'est', 'et', 'ets', 'y']);

const isVowel = (w, i) => {
  const c = w[i];
  if ('aeiou'.includes(c)) return true;
  // y is a vowel except at the start or before another vowel (yes, crayon).
  const next = w[i + 1];
  return c === 'y' && i > 0 && !(next && 'aeiou'.includes(next));
};

function breaks(word) {
  const w = word.toLowerCase();
  const n = w.length;
  const out = [];
  let i = 0;
  while (i < n && !isVowel(w, i)) i++; // leading consonants
  while (i < n) {
    while (i < n && isVowel(w, i)) i++; // vowels
    const start = i;
    while (i < n && !isVowel(w, i)) i++; // consonants
    if (i >= n) break; // trailing consonants: no vowel after them
    const run = w.slice(start, i);
    // The longest ending of the run that can start a syllable.
    let take = 1;
    for (let k = Math.min(3, run.length); k > 1; k--) {
      if (ONSETS.has(run.slice(-k))) {
        take = k;
        break;
      }
    }
    let at = i - take;
    // Don't split ck or gh; move the split after them.
    if (at > start && ENDERS.has(w.slice(at - 1, at + 1))) at++;
    // ght stays together (light-house).
    if (take > 1 && w.slice(at - 2, at + 1) === 'ght') at++;
    // th, sh... right before an ending stay with the first part (wash-ing).
    if (at === start && take === 2 && ENDINGS.has(w.slice(i))) at = i;
    if (at >= 2 && at <= n - 3 && (!out.length || at - out[out.length - 1] >= 2)) out.push(at);
  }
  return out;
}

export function hyphenate(text) {
  return String(text).replace(/[A-Za-z]{6,}/g, (word) => {
    let result = '';
    let from = 0;
    for (const at of breaks(word)) {
      result += word.slice(from, at) + SHY;
      from = at;
    }
    return result + word.slice(from);
  });
}
