import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// One guessed word, colored by what it turned out to be: the guessing
// team's color, red-and-blue stripes for the other team's word, gray for a
// neutral word, black for the Assassin.
const Guess = ({ word, color, team }) => {
  const kind = color === team ? team : color === 'neutral' ? 'neutral' : color === 'black' ? 'assassin' : 'other-team';
  return <span className={`history-guess ${kind}`}>{word}</span>;
};

const Names = ({ list }) => (
  <>
    {list.map((p, i) => (
      <div key={i} className={p.cluer ? 'history-cluer' : ''}>
        {p.name}
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

// (D1) Session History: every board of the session so far.
export const SessionHistory = ({ rulesetID, onClose }) => {
  const [boards, setBoards] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [shown, setShown] = React.useState(null);

  React.useEffect(() => {
    axios
      .post(`/api/play/${rulesetID}/history`)
      .then(({ data }) => setBoards(data.boards))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the history.'));
  }, []);

  // The final-board popup is rendered beside (not inside) this one, since a
  // popup that has been dragged would otherwise confine it.
  return (
    <>
    <Popup title="Session History" onClose={onClose} extraWide>
      {error && <div className="form-error">{error}</div>}
      {!boards && !error && <p>Loading…</p>}
      {boards && (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Game #</th>
                <th>First Cluer</th>
                <th>Red Team</th>
                <th>Blue Team</th>
                <th>Floaters</th>
                <th>Turns</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.number}>
                  <td>
                    <button type="button" onClick={() => setShown(b)}>
                      Game {b.number}
                    </button>
                  </td>
                  <td className={b.first_team}>{cap(b.first_team)}</td>
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
                      <div key={i} className="history-turn">
                        {t.guesses.map((g, j) => (
                          <Guess key={j} word={g.word} color={g.color} team={t.team} />
                        ))}
                      </div>
                    ))}
                  </td>
                  <td>{b.result || (b.current ? 'In progress' : 'Not finished')}</td>
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
    </>
  );
};
