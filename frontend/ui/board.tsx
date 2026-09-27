import * as React from 'react';
import { Settings, SettingsButton, SettingsPanel } from '~/ui/settings';
import { Popup } from '~/ui/popup';
import Timer from '~/ui/timer';

const defaultFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAA8SURBVHgB7dHBDQAgCAPA1oVkBWdzPR84kW4AD0LCg36bXJqUcLL2eVY/EEwDFQBeEfPnqUpkLmigAvABK38Grs5TfaMAAAAASUVORK5CYII=';
const blueTurnFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cxBAQAABATBo5ls6ulEiPt47ASYqJ6VIWUiICD4Ehyi7wKv/xtOewAAAABJRU5ErkJggg==';
const redTurnFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cwxAQAACMOwgaL5d4EiELGHoxGQGnsVaIUICAi+BAci2gJQFUhklQAAAABJRU5ErkJggg==';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const roleText = (p) =>
  !p?.role ? 'Watching' : p.role === 'floater' ? 'Floater' : `${cap(p.team)} ${p.role === 'cluer' ? 'Cluer' : 'Guesser'}`;

// A clickable player name; opens that player's actions.
const PlayerName = ({ p, me, onClick }) => (
  <button
    type="button"
    className={
      'player-name' + (p.role === 'cluer' ? ' cluer' : '') + (p.present ? '' : ' absent') + (p.user_id === me ? ' me' : '')
    }
    onClick={() => onClick(p)}
    title={p.changed ? 'Role changed since this board was dealt' : undefined}
  >
    {p.name}
    {p.changed ? '*' : ''}
  </button>
);

// Players of one team, Cluer first.
const TeamList = ({ players, team, me, onName }) => {
  const members = players
    .filter((p) => p.team === team)
    .sort((a, b) => (a.role === 'cluer' ? -1 : b.role === 'cluer' ? 1 : 0));
  return (
    <div className={`team-list ${team}`}>
      {members.map((p) => (
        <PlayerName key={p.user_id} p={p} me={me} onClick={onName} />
      ))}
    </div>
  );
};

// Actions for a player, opened by clicking their name. Any player may do
// these for any player: switch to Red/Blue/Float as appropriate (Cluers
// can't switch teams), take over the team's Cluer role, or leave.
const PlayerActions = ({ p, isMe, act, onClose }) => {
  const run = async (path, body, question = null) => {
    if (question && !confirm(question)) return;
    if (await act(path, { user_id: p.user_id, ...body })) onClose();
  };
  const setRole = (to) => run('set-role', { to });

  let options = null;
  if (p.role === 'guesser') {
    const other = p.team === 'red' ? 'blue' : 'red';
    options = (
      <>
        <button type="button" onClick={() => setRole(other)}>
          Switch to {cap(other)}
        </button>
        <button type="button" onClick={() => setRole('floater')}>
          Float
        </button>
        <button
          type="button"
          onClick={() =>
            run(
              'set-role',
              { to: 'cluer' },
              `Make ${p.name} the ${cap(p.team)} Cluer? This forces a new board, and the current Cluer becomes a guesser.`
            )
          }
        >
          Become {cap(p.team)} Cluer
        </button>
      </>
    );
  } else if (p.role === 'floater') {
    options = (
      <>
        <button type="button" onClick={() => setRole('red')}>
          Switch to Red
        </button>
        <button type="button" onClick={() => setRole('blue')}>
          Switch to Blue
        </button>
      </>
    );
  }

  return (
    <Popup title={p.name} onClose={onClose}>
      <p className="hint">
        {roleText(p)}
        {p.role === 'cluer' && ' (Cluers can not switch teams)'}
      </p>
      <div className="button-row player-actions">
        {options}
        <button
          type="button"
          onClick={() =>
            run('log-off', {}, isMe ? 'Leave this session?' : `Remove ${p.name} from this session?`)
          }
        >
          Leave the Session
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Popup>
  );
};

// (C1) Game Board. Roles come from the server: Cluers see the colors, and
// only the team whose turn it is (or Floaters, if allowed) can click a word
// or end the turn.
export const Board = ({ view, act }) => {
  const [settings, setSettings] = React.useState(Settings.load());
  const [showSettings, setShowSettings] = React.useState(false);
  const [menuFor, setMenuFor] = React.useState(null);
  const board = view.board;
  const me = view.players.find((p) => p.user_id === view.me);
  const isCluer = me?.role === 'cluer';
  const over = !!board.winning_team;

  React.useEffect(() => {
    document.body.classList.toggle('dark-mode', !!settings.darkMode);
  }, [settings.darkMode]);

  React.useEffect(() => {
    const icon = over ? defaultFavicon : board.current_team === 'blue' ? blueTurnFavicon : redTurnFavicon;
    document.getElementById('favicon')?.setAttribute('href', icon);
    return () => document.getElementById('favicon')?.setAttribute('href', defaultFavicon);
  }, [over, board.current_team]);

  const toggleSetting = (e, setting) => {
    e?.preventDefault();
    const vals = { ...settings, [setting]: !settings[setting] };
    setSettings(vals);
    Settings.save(vals);
  };

  if (showSettings) {
    return (
      <SettingsPanel
        toggleView={(e) => {
          e?.preventDefault();
          setShowSettings(false);
        }}
        toggle={toggleSetting}
        values={settings}
      />
    );
  }

  const guess = (idx) => {
    if (!board.can_click || board.revealed[idx] || over) return;
    act('guess', { index: idx });
  };

  const endTurn = () => act('end-turn', { round: board.round });

  const next = (path, label) => {
    if (!over && !confirm(`Start a new board with "${label}"? The current board isn't finished.`)) return;
    act(path);
  };

  const cellLabel = (idx) => {
    let label = board.words[idx].toLowerCase();
    const color = board.layout[idx];
    if (color !== 'hidden') label += ', ' + (color === 'black' ? 'assassin' : color);
    return label + (board.revealed[idx] ? ', revealed word.' : ', hidden word.');
  };

  // Turn banner and End Turn button sit on the current team's side:
  // Red over columns 1–2, Blue over columns 4–5, score in the middle.
  const turnCell = (team) => {
    if (over) return team === board.winning_team ? <div className={`turn-banner ${team}`}>{cap(team)} wins!</div> : null;
    return team === board.current_team ? <div className={`turn-banner ${team}`}>{cap(team)}&#39;s Turn</div> : null;
  };
  const endTurnCell = (team) =>
    !over && board.can_click && team === board.current_team ? (
      <button onClick={endTurn} className={`end-turn-btn ${team}`}>
        End {cap(team)}&#39;s Turn
      </button>
    ) : null;

  const statusClass = over ? `${board.winning_team} win` : `${board.current_team}-turn`;
  const extraClasses = (settings.colorBlind ? ' color-blind' : '') + (settings.fullscreen ? ' full-screen' : '');
  const floaters = view.players.filter((p) => p.role === 'floater');

  return (
    <div id="play-view" className={(isCluer ? 'cluegiver' : 'player') + extraClasses}>
      <TeamList players={view.players} team="red" me={view.me} onName={setMenuFor} />

      <div id="game-view">
        <div className="board-info">
          {view.ruleset.name} · Board {board.number} ·{' '}
          <span className="my-role" title={me ? `Logged in as ${me.name}` : undefined}>
            Your Role: {roleText(me)}
          </span>
        </div>
        {!!board.timer_duration_ms && (
          <div id="timer">
            <Timer
              roundStartedAt={board.round_started_at}
              timerDurationMs={board.timer_duration_ms}
              handleExpiration={() => board.enforce_timer && endTurn()}
              freezeTimer={over}
            />
          </div>
        )}

        <div className="status-grid">
          <div>{endTurnCell('red')}</div>
          <div>{turnCell('red')}</div>
          <div className="score">
            <span className="red-remaining">{board.remaining.red}</span>
            &nbsp;&ndash;&nbsp;
            <span className="blue-remaining">{board.remaining.blue}</span>
          </div>
          <div>{turnCell('blue')}</div>
          <div>{endTurnCell('blue')}</div>
        </div>

        <div className={'board ' + statusClass}>
          {board.words.map((w, idx) => (
            <div
              key={idx}
              className={
                'cell ' +
                board.layout[idx] +
                ' ' +
                (board.can_click ? '' : 'disabled ') +
                (board.revealed[idx] ? 'revealed' : 'hidden-word')
              }
              onClick={() => guess(idx)}
            >
              <span
                className="word"
                role="button"
                aria-disabled={!board.can_click || board.revealed[idx] || over}
                aria-label={cellLabel(idx)}
              >
                {w}
              </span>
            </div>
          ))}
        </div>

        <div className="floater-list">
          <div className="section-label">Floaters</div>
          {floaters.length ? (
            floaters.map((p) => <PlayerName key={p.user_id} p={p} me={view.me} onClick={setMenuFor} />)
          ) : (
            <div className="hint">none</div>
          )}
        </div>

        <form id="mode-toggle" onSubmit={(e) => e.preventDefault()}>
          <label className="floaters-toggle">
            Floaters Can Click{' '}
            <input
              type="checkbox"
              checked={view.floaters_can_click}
              onChange={(e) => act('floaters-can-click', { on: e.target.checked })}
            />
          </label>
          <SettingsButton onClick={() => setShowSettings(true)} />
          <button type="button" onClick={() => next('next-board', 'Next Board')}>
            Next Board
          </button>
          <button type="button" onClick={() => next('next-game', 'Next Game')}>
            Next Game
          </button>
        </form>
      </div>

      <TeamList players={view.players} team="blue" me={view.me} onName={setMenuFor} />

      {menuFor && (
        <PlayerActions
          p={view.players.find((p) => p.user_id === menuFor.user_id) || menuFor}
          isMe={menuFor.user_id === view.me}
          act={act}
          onClose={() => setMenuFor(null)}
        />
      )}
    </div>
  );
};
