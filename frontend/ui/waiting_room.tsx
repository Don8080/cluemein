import * as React from 'react';
import { Popup } from '~/ui/popup';

// (A2) Waiting Room. Begin Game is enabled once enough players are here;
// clicking it takes everyone present to the board.
export const WaitingRoom = ({ view, act }) => {
  const [adding, setAdding] = React.useState(false);
  const present = view.players.filter((p) => p.present);
  const missing = view.players.filter((p) => !p.present);
  const { present: n, needed } = view.quorum;
  const quorum = n >= needed;

  return (
    <div id="start" className="waiting-room">
      <h2 className="screen-heading">Waiting Room: {view.ruleset.name}</h2>

      {quorum ? (
        <p className="form-message">
          Quorum Reached, click Begin Game for {view.boards_played ? 'next' : 'first'} game.
        </p>
      ) : (
        <p className="hint">
          Waiting for quorum: {n} of {needed} players present.
          {view.resumable && ' The board in progress resumes when the game begins again.'}
        </p>
      )}

      <div className="presence-lists">
        <div>
          <div className="section-label">Present</div>
          {present.map((p) => (
            <div key={p.user_id} className={p.user_id === view.me ? 'me' : ''}>
              {p.name}
            </div>
          ))}
        </div>
        <div>
          <div className="section-label">Missing</div>
          {missing.map((p) => (
            <div key={p.user_id}>{p.name}</div>
          ))}
        </div>
      </div>

      <div className="start-row">
        <button onClick={() => setAdding(true)}>Add Player</button>
        <button disabled={!quorum} onClick={() => act('begin')}>
          Begin Game
        </button>
      </div>
      <p>
        <a href="/">Back to Start</a>
      </p>

      {adding && <AddPlayer act={act} onClose={() => setAdding(false)} />}
    </div>
  );
};

// (P1) Add Player: permanently adds a registered player to this game.
const AddPlayer = ({ act, onClose }) => {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');

  const add = async (e) => {
    e.preventDefault();
    if (await act('add-player', { email, name })) onClose();
  };

  return (
    <Popup title="Add Player" onClose={onClose}>
      <form className="login-form" onSubmit={add}>
        <label>
          Player Email
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Player Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="button-row">
          <button type="submit" disabled={!email.trim() || !name.trim()}>
            Add
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Popup>
  );
};
