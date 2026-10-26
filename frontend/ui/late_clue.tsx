import * as React from 'react';
import { Popup } from '~/ui/popup';
import { NO_SUGGESTIONS, NumberPick, defaultNumber } from '~/ui/clue_entry';

// Enter the clue for a turn that started without one (click the ******).
// Same rules as the clue box: up to 30 characters; the number from 0 to the
// team's unguessed words when the turn began (fixed at 1 if only one was
// left). onPost(word, number) returns true when the clue was saved.
export const LateClueDialog = ({ turn, max, onPost, onClose }) => {
  const [word, setWord] = React.useState('');
  const [number, setNumber] = React.useState(defaultNumber(max));
  const [busy, setBusy] = React.useState(false);
  const post = async (e) => {
    e.preventDefault();
    if (!word.trim()) return;
    setBusy(true);
    if (await onPost(word, max <= 1 ? 1 : number)) onClose();
    else setBusy(false);
  };
  return (
    <Popup title={`Clue for turn ${turn.number}`} onClose={onClose}>
      <form className="late-clue" autoComplete="off" onSubmit={post}>
        <div className="clue-line">
          <input
            className={`clue-word ${turn.team}`}
            placeholder="Clue"
            maxLength={30}
            {...NO_SUGGESTIONS}
            autoFocus
            value={word}
            onChange={(e) => setWord(e.target.value)}
            aria-label="Clue"
          />
          <NumberPick max={max} value={number} onChange={setNumber} label="Number of words" />
        </div>
        <div className="button-row">
          <button type="submit" disabled={busy || !word.trim()}>
            Post
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
};
