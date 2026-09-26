import * as React from 'react';
import { Settings, SettingsButton, SettingsPanel } from '~/ui/settings';
import Timer from '~/ui/timer';

const defaultFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAA8SURBVHgB7dHBDQAgCAPA1oVkBWdzPR84kW4AD0LCg36bXJqUcLL2eVY/EEwDFQBeEfPnqUpkLmigAvABK38Grs5TfaMAAAAASUVORK5CYII=';
const blueTurnFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cxBAQAABATBo5ls6ulEiPt47ASYqJ6VIWUiICD4Ehyi7wKv/xtOewAAAABJRU5ErkJggg==';
const redTurnFavicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cwxAQAACMOwgaL5d4EiELGHoxGQGnsVaIUICAi+BAci2gJQFUhklQAAAABJRU5ErkJggg==';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Players of one team, Cluer first.
const TeamList = ({ players, team, me }) => {
  const members = players
    .filter((p) => p.team === team)
    .sort((a, b) => (a.role === 'cluer' ? -1 : b.role === 'cluer' ? 1 : 0));
  return (
    <div className={`team-list ${team}`}>
      {members.map((p) => (
        <div
          key={p.user_id}
          className={(p.role === 'cluer' ? 'cluer' : 'guesser') + (p.present ? '' : ' absent') + (p.user_id === me ? ' me' : '')}
        >
          {p.name}
        </div>
      ))}
    </div>
  );
};

// (C1) Game Board. Roles come from the server: Cluers see the colors, and
// only the team whose turn it is (or Floaters, if allowed) can click.
export const Board = ({ view, act }) => {
  const [settings, setSettings] = React.useState(Settings.load());
  const [showSettings, setShowSettings] = React.useState(false);
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

  const otherTeam = board.starting_team === 'red' ? 'blue' : 'red';
  const statusClass = over ? `${board.winning_team} win` : `${board.current_team}-turn`;
  const status = over ? `${cap(board.winning_team)} wins!` : `${cap(board.current_team)}'s turn`;

  const cellLabel = (idx) => {
    let label = board.words[idx].toLowerCase();
    const color = board.layout[idx];
    if (color !== 'hidden') label += ', ' + (color === 'black' ? 'assassin' : color);
    return label + (board.revealed[idx] ? ', revealed word.' : ', hidden word.');
  };

  const extraClasses =
    (settings.colorBlind ? ' color-blind' : '') + (settings.fullscreen ? ' full-screen' : '');

  const floaters = view.players.filter((p) => p.role === 'floater');

  return (
    <div id="play-view" className={(isCluer ? 'cluegiver' : 'player') + extraClasses}>
      <TeamList players={view.players} team="red" me={view.me} />

      <div id="game-view">
        <div id="infoContent">
          <div className="board-info">
            {view.ruleset.name} · Board {board.number}
            {me && (
              <span className="my-role">
                {' '}
                · You: {me.role === 'floater' ? 'Floater' : `${cap(me.team)} ${me.role === 'cluer' ? 'Cluer' : 'guesser'}`}
              </span>
            )}
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
        </div>

        <div id="status-line" className={statusClass}>
          <div id="remaining">
            <span className={board.starting_team + '-remaining'}>{board.remaining[board.starting_team]}</span>
            &nbsp;&ndash;&nbsp;
            <span className={otherTeam + '-remaining'}>{board.remaining[otherTeam]}</span>
          </div>
          <div id="status" className="status-text">
            {status}
          </div>
          <div id="end-turn-cont">
            {board.can_click && (
              <button onClick={endTurn} id="end-turn-btn">
                End {cap(board.current_team)}&#39;s turn
              </button>
            )}
          </div>
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
          <span className="section-label">Floaters</span>{' '}
          {floaters.length ? floaters.map((p) => p.name).join(', ') : 'none'}
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

      <TeamList players={view.players} team="blue" me={view.me} />
    </div>
  );
};
