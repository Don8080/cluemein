import * as React from 'react';

// Optional clue entry above the board: a text box ("Clue"), a number (0 to
// the current team's unguessed words; fixed at 1 when one is left; default
// 2) and Post. It sits over columns 4-5 on Red's turn and 1-2 on Blue's.
// Anyone may post; the posted clue shows on every screen in the team's
// color. Typing is black and stays on your screen until you Post; if someone
// else posts first, your typing is replaced by their clue.
//
// The waiting team's Cluer also gets "your next clue": typed in advance,
// kept on their screen only, and moved into the clue box when their turn
// comes (still unposted until they click Post).

// No browser autocomplete list, spell-check or auto-correct in the clue boxes
// (the suggestion list swallowed the first click on Post).
export const NO_SUGGESTIONS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  name: 'cluemein-clue-' + Math.random().toString(36).slice(2), // no remembered entries to offer
};

export const defaultNumber = (max) => (max >= 2 ? 2 : max);

export const NumberPick = ({ max, value, onChange, label }) =>
  max <= 1 ? (
    <span className="clue-number-fixed" aria-label={label}>
      {max}
    </span>
  ) : (
    <select className="clue-number" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: max + 1 }, (_, i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );

export const ClueEntry = ({ board, me, act }) => {
  const round = board.round;
  const team = board.current_team;
  const posted = board.clues?.[round] || null;
  const max = board.remaining[team];
  const [draft, setDraft] = React.useState(null); // { round, word, number } typed here, not posted
  const [next, setNext] = React.useState(null); // { word, number } waiting Cluer's next clue
  const [busy, setBusy] = React.useState(false);

  // Someone (anyone) posted: their clue replaces what was being typed.
  const postedKey = posted ? `${round}|${posted.word}|${posted.number}` : '';
  const lastPosted = React.useRef(postedKey);
  React.useEffect(() => {
    if (postedKey !== lastPosted.current) setDraft(null);
    lastPosted.current = postedKey;
  }, [postedKey]);

  // A new turn: the Cluer whose turn it now is gets their prepared clue.
  const lastRound = React.useRef(round);
  React.useEffect(() => {
    if (round === lastRound.current) return;
    lastRound.current = round;
    if (next && me?.role === 'cluer' && me.team === team && next.word.trim()) {
      setDraft({ round, word: next.word, number: Math.min(next.number, board.remaining[team]) });
      setNext(null);
    } else {
      setDraft(null);
    }
  }, [round]);

  const mine = draft && draft.round === round ? draft : null;
  const word = mine ? mine.word : posted ? posted.word : '';
  const number = mine ? mine.number : posted ? posted.number : defaultNumber(max);
  const showingPosted = !mine && !!posted;
  const edit = (change) => setDraft({ round, word, number, ...change });

  const post = async () => {
    if (!word.trim()) return;
    setBusy(true);
    if (await act('clue', { round, word, number: max <= 1 ? 1 : number })) setDraft(null);
    setBusy(false);
  };

  const waitingCluer = me?.role === 'cluer' && me.team !== 'both' && me.team !== team;
  const nextMax = waitingCluer ? board.remaining[me.team] : 0;
  const nextValue = next || { word: '', number: defaultNumber(nextMax) };

  return (
    <div className="clue-grid">
      <div className="clue-entry" style={{ gridColumn: team === 'red' ? '4 / span 2' : '1 / span 2' }}>
        <form
          className="clue-line"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <input
            className={'clue-word' + (showingPosted ? ` posted ${team}` : '')}
            placeholder="Clue"
            maxLength={30}
            {...NO_SUGGESTIONS}
            value={word}
            onChange={(e) => edit({ word: e.target.value })}
            aria-label="Clue"
          />
          <NumberPick max={max} value={number} onChange={(n) => edit({ number: n })} label="Number of words" />
          <button type="submit" className="clue-post" disabled={busy || !word.trim() || showingPosted}>
            Post
          </button>
        </form>
        {waitingCluer && nextMax > 0 && (
          <div className="clue-line next">
            <input
              className={`clue-word next ${me.team}`}
              placeholder="your next clue"
              maxLength={30}
            {...NO_SUGGESTIONS}
              value={nextValue.word}
              onChange={(e) => setNext({ ...nextValue, word: e.target.value })}
              aria-label="Your next clue"
            />
            <NumberPick
              max={nextMax}
              value={nextValue.number}
              onChange={(n) => setNext({ ...nextValue, number: n })}
              label="Number of words for your next clue"
            />
          </div>
        )}
      </div>
    </div>
  );
};
