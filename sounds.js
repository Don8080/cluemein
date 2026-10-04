// Timer sounds: the default gongs, or a game's custom files (B2), stored in
// ruleset_sounds. Accepted: MP3, M4A (AAC) or WAV, up to 1 MB, recognized by
// their contents rather than the file name.
const KINDS = ['warning', 'end']; // 30 seconds left; out of time
const MAX_BYTES = 1024 * 1024;
const DEFAULTS = { warning: '/static/sounds/gong-30s.mp3', end: '/static/sounds/gong-end.mp3' };

function typeOf(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg'; // MP3 frame without a tag
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WAVE') return 'audio/wav';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4'; // M4A / AAC
  return null;
}

// { warning: { custom, filename, url }, end: {...} }. A custom file's URL
// changes with each upload, so browsers fetch the new one.
function info(db, rulesetID) {
  const rows = db.prepare('SELECT kind, filename, uploaded_at FROM ruleset_sounds WHERE ruleset_id = ?').all(rulesetID);
  return Object.fromEntries(
    KINDS.map((kind) => {
      const r = rows.find((x) => x.kind === kind);
      return [
        kind,
        r
          ? { custom: true, filename: r.filename, url: `/api/rulesets/${rulesetID}/sounds/${kind}?v=${r.uploaded_at}` }
          : { custom: false, filename: null, url: DEFAULTS[kind] },
      ];
    })
  );
}

module.exports = { KINDS, MAX_BYTES, DEFAULTS, typeOf, info };
