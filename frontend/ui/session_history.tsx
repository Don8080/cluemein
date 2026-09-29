import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// One guessed word in the color it turned out to be (gray for neutral,
// black for the Assassin). The other team's word gets an outline in the
// color of the team that guessed it (a Red word guessed on Blue's turn: blue).
const Guess = ({ word, color, team }) => {
  const kind = color === 'neutral' ? 'neutral' : color === 'black' ? 'assassin' : color;
  const wrongTeam = (color === 'red' || color === 'blue') && color !== team;
  return <span className={`history-guess ${kind}${wrongTeam ? ` other-team by-${team}` : ''}`}>{word}</span>;
};

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
                        {t.number && <span className={`turn-number ${t.team}`}>{t.number})</span>}
                        {t.guesses.map((g, j) => (
                          <Guess key={j} word={g.word} color={g.color} team={t.team} />
                        ))}
                      </div>
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
    </>
  );
};
