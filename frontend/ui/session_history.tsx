import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';
import { TurnLine, remainingAtTurnStart } from '~/ui/turn_line';
import { LateClueDialog } from '~/ui/late_clue';


// "Blue by 3" / "Red by Assassination", with the winning team's name in
// its color.
const Result = ({ board }) => {
  if (!board.result) return <>{board.current ? 'In progress' : 'Not finished'}</>;
  const [team, ...rest] = board.result.split(' ');
  return (
    <>
      <span className={`result-team ${board.winner}`}>{team}</span> {rest.join(' ')}
    </>
  );
};

const Names = ({ list }) => (
  <>
    {list.map((p, i) => (
      <div key={i} className={p.cluer ? 'history-cluer' : ''}>
        {p.name}
        {/* Times a Cluer (or Floater) so far: this game plus earlier completed ones. */}
        {p.count ? <span className="role-count"> ({p.count})</span> : null}
      </div>
    ))}
  </>
);

// The final state of a board, as the Cluers see it.
const FinalBoard = ({ board, onClose }) => {
  const b = board.final_board;
  return (
    <Popup title={`Game ${board.number}`} onClose={onClose} wide>
      <div className="final-board-summary">
        <span className="red-remaining">{b.remaining.red}</span> &ndash;{' '}
        <span className="blue-remaining">{b.remaining.blue}</span>
        {board.result && <span className="final-result"> · {board.result}</span>}
      </div>
      <div className="mini-board">
        {b.words.map((w, i) => (
          <div key={i} className={`mini-cell ${b.layout[i]} ${b.revealed[i] ? 'revealed' : 'unrevealed'}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="button-row centered">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Popup>
  );
};

// "Show Not Finished": this player's choice, remembered on this device for
// the rest of the session (a new session starts at No).
const unfinishedKey = (rulesetID, sessionStarted) => `cluemein_history_unfinished_${rulesetID}_${sessionStarted}`;
function loadShowUnfinished(rulesetID, sessionStarted) {
  try {
    return localStorage.getItem(unfinishedKey(rulesetID, sessionStarted)) === 'yes';
  } catch {
    return false;
  }
}
function saveShowUnfinished(rulesetID, sessionStarted, on) {
  try {
    localStorage.setItem(unfinishedKey(rulesetID, sessionStarted), on ? 'yes' : 'no');
  } catch {
    // not remembered; harmless
  }
}

// (D1) Session History: every board of the session so far (boards left
// unfinished only when "Show Not Finished" is on; the board in progress
// always shows).
export const SessionHistory = ({ rulesetID, sessionStarted, onClose }) => {
  const [showUnfinished, setShowUnfinished] = React.useState(() => loadShowUnfinished(rulesetID, sessionStarted));
  const toggleUnfinished = () => {
    setShowUnfinished(!showUnfinished);
    saveShowUnfinished(rulesetID, sessionStarted, !showUnfinished);
  };
  const [boards, setBoards] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [shown, setShown] = React.useState(null);
  const [late, setLate] = React.useState(null); // { board, turn }: entering a missing clue

  const load = () =>
    axios
      .post(`/api/play/${rulesetID}/history`)
      .then(({ data }) => setBoards(data.boards))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the history.'));
  React.useEffect(() => {
    load();
  }, []);

  // A missing clue's limit: the team's unguessed words when that turn began.
  const lateMax = ({ board, turn }) =>
    remainingAtTurnStart(
      board.final_board.remaining[turn.team],
      board.turns.flatMap((t) => t.guesses.map((g) => ({ ...g, round: t.round }))),
      turn.team,
      turn.round
    );
  const postLate = async (word, number) => {
    try {
      await axios.post(`/api/play/${rulesetID}/late-clue`, { board: late.board.number - 1, round: late.turn.round, word, number });
      await load();
      return true;
    } catch (err) {
      alert(err.response?.data?.error || 'Something went wrong.');
      return false;
    }
  };

  // The final-board popup is rendered beside (not inside) this one, since a
  // popup that has been dragged would otherwise confine it.
  return (
    <>
    <Popup title="Session History" onClose={onClose} extraWide>
      {error && <div className="form-error">{error}</div>}
      {!boards && !error && <p>Loading…</p>}
      <div className="history-options">
        <label className={'sound-switch' + (showUnfinished ? ' on' : '')}>
          <span className="history-option-label">Show Not Finished</span>
          <input type="checkbox" checked={showUnfinished} onChange={toggleUnfinished} />
          <span className="sound-switch-track">
            <span className="sound-switch-knob" />
          </span>
          <span className="sound-switch-label">{showUnfinished ? 'Yes' : 'No'}</span>
        </label>
      </div>
      {boards && !showUnfinished && boards.every((b) => !b.result && !b.current) && (
        <p className="hint">No finished games yet.</p>
      )}
      {boards && (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Game #</th>
                <th>Red Team</th>
                <th>Blue Team</th>
                <th>Floaters</th>
                <th>Turns</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {boards.filter((b) => showUnfinished || b.result || b.current).map((b) => (
                <tr key={b.number}>
                  <td>
                    <button type="button" onClick={() => setShown(b)}>
                      Game {b.number}
                    </button>
                  </td>
                  <td className="red">
                    <Names list={b.red} />
                  </td>
                  <td className="blue">
                    <Names list={b.blue} />
                  </td>
                  <td>
                    <Names list={b.floaters} />
                  </td>
                  <td>
                    {b.turns.map((t, i) => (
                      <TurnLine key={i} turn={t} onAddClue={(turn) => setLate({ board: b, turn })} />
                    ))}
                  </td>
                  <td>
                    <Result board={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="button-row centered">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Popup>
    {shown && <FinalBoard board={shown} onClose={() => setShown(null)} />}
    {late && <LateClueDialog turn={late.turn} max={lateMax(late)} onPost={postLate} onClose={() => setLate(null)} />}
    </>
  );
};
