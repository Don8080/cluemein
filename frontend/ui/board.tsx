import * as React from 'react';
import { Settings, SettingsButton, SettingsPanel } from '~/ui/settings';
import { Popup } from '~/ui/popup';
import { SessionHistory } from '~/ui/session_history';
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

// This team's guesses, one line per turn, each word in the color it turned
// out to be. Turns are numbered in one sequence for the whole board, so the
// team that went first has the odd numbers and the other team the even.
const GuessList = ({ guesses, team }) => {
  const turns = [];
  let lastRound = null;
  guesses
    .filter((g) => g.team === team)
    .forEach((g, i) => {
      // Older records have no round; treat each as its own turn.
      const round = g.round ?? `x${i}`;
      if (round !== lastRound) turns.push({ number: g.round !== undefined ? g.round + 1 : null, guesses: [] });
      turns[turns.length - 1].guesses.push(g);
      lastRound = round;
    });
  if (!turns.length) return null;
  return (
    <div className="guess-list">
      <div className="section-label">Guesses</div>
      {turns.map((t, i) => (
        <div key={i} className="guess-turn">
          {t.number ?? i + 1}){' '}
          {t.guesses.map((g, j) => (
            <span key={j} className={`guess-word ${g.color}`}>
              {j > 0 ? ', ' : ''}
              {g.word}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

// One team's column: players (Cluer first), then the team's guesses.
const TeamList = ({ players, team, me, onName, guesses }) => {
  const members = players
    .filter((p) => p.team === team)
    .sort((a, b) => (a.role === 'cluer' ? -1 : b.role === 'cluer' ? 1 : 0));
  return (
    <div className={`team-list ${team}`}>
      {members.map((p) => (
        <PlayerName key={p.user_id} p={p} me={me} onClick={onName} />
      ))}
      <GuessList guesses={guesses} team={team} />
    </div>
  );
};

// Corner triangles for a word marked by the Red (left) and/or Blue (right)
// team.
const Marks = ({ red, blue }) => (
  <>
    {red && <span className="mark red top" />}
    {red && <span className="mark red bottom" />}
    {blue && <span className="mark blue top" />}
    {blue && <span className="mark blue bottom" />}
  </>
);

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
        <button type="button" className={`switch-${other}`} onClick={() => setRole(other)}>
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
        <button type="button" className="switch-red" onClick={() => setRole('red')}>
          Switch to Red
        </button>
        <button type="button" className="switch-blue" onClick={() => setRole('blue')}>
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
  const [showHistory, setShowHistory] = React.useState(false);
  const [touchIdx, setTouchIdx] = React.useState(null); // word under a dragging finger
  const board = view.board;
  const me = view.players.find((p) => p.user_id === view.me);
  const isCluer = me?.role === 'cluer';
  const over = !!board.winning_team;
  const safeClick = !!settings.safeClick;

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

  // Right-click, or any click in Safe Click Mode, marks the word instead of
  // guessing it.
  const mark = (idx) => {
    if (!board.can_mark || board.revealed[idx]) return;
    act('mark', { index: idx });
  };
  const onCellClick = (idx) => (safeClick ? mark(idx) : guess(idx));

  // On touch screens, dragging a finger across the board enlarges the word
  // under it, like a mouseover.
  const onTouch = (e) => {
    const t = e.touches[0];
    const cell = t && document.elementFromPoint(t.clientX, t.clientY)?.closest('.cell');
    setTouchIdx(cell ? Number(cell.getAttribute('data-idx')) : null);
  };

  const openModifyGame = () => window.open(`/modify/${view.ruleset.id}?from=board`, '_blank');

  const graffito = (() => {
    const { graffito_message: text, graffito_url: url } = view.ruleset;
    if (!text && !url) return null;
    return (
      <div className="graffito">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {text || url}
          </a>
        ) : (
          text
        )}
      </div>
    );
  })();

  const endTurn = () => act('end-turn', { round: board.round });

  const next = (path) => act(path);

  const cellLabel = (idx) => {
    let label = board.words[idx].toLowerCase();
    const color = board.layout[idx];
    if (color !== 'hidden') label += ', ' + (color === 'black' ? 'assassin' : color);
    return label + (board.revealed[idx] ? ', revealed word.' : ', hidden word.');
  };

  // Turn banner on the current team's side (Red over column 2, Blue over
  // column 4). For players allowed to click, the banner is itself the
  // "End Red's Turn" button.
  const turnCell = (team) => {
    if (over) return team === board.winning_team ? <div className={`turn-banner ${team}`}>{cap(team)} wins!</div> : null;
    if (team !== board.current_team) return null;
    if (board.can_click) {
      return (
        <button
          type="button"
          onClick={endTurn}
          className={`turn-banner ${team} end-turn`}
          disabled={!board.guessed_this_turn}
          title={board.guessed_this_turn ? undefined : 'Make at least one guess before ending the turn'}
        >
          End {cap(team)}&#39;s Turn
        </button>
      );
    }
    return <div className={`turn-banner ${team}`}>{cap(team)}&#39;s Turn</div>;
  };

  const statusClass = over ? `${board.winning_team} win` : `${board.current_team}-turn`;
  const extraClasses = (settings.colorBlind ? ' color-blind' : '') + (settings.fullscreen ? ' full-screen' : '');
  const floaters = view.players.filter((p) => p.role === 'floater');

  // At the end of a game everyone sees the board as the Cluers do.
  const viewClass = isCluer || over ? 'cluegiver' : 'player';

  return (
    <div id="play-view" className={viewClass + extraClasses}>
      <TeamList players={view.players} team="red" me={view.me} onName={setMenuFor} guesses={board.guesses} />

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

        <div className="board-toolbar">
          <label
            className="check"
            title="When on, clicking a word marks it for later consideration instead of guessing it. A right-click always marks a word; repeating the action clears the mark."
          >
            Safe Click Mode{' '}
            <input type="checkbox" checked={safeClick} onChange={(e) => toggleSetting(null, 'safeClick')} />
          </label>
          <label className="check">
            Floaters Can Click{' '}
            <input
              type="checkbox"
              checked={view.floaters_can_click}
              onChange={(e) => act('floaters-can-click', { on: e.target.checked })}
            />
          </label>
          <button type="button" onClick={openModifyGame}>
            Modify Game
          </button>
          <button type="button" onClick={() => setShowHistory(true)}>
            Session History
          </button>
          <SettingsButton onClick={() => setShowSettings(true)} />
        </div>

        <div className="status-grid">
          <div></div>
          <div>{turnCell('red')}</div>
          <div className="score">
            <span className="red-remaining">{board.remaining.red}</span>
            &nbsp;&ndash;&nbsp;
            <span className="blue-remaining">{board.remaining.blue}</span>
          </div>
          <div>{turnCell('blue')}</div>
          <div></div>
        </div>

        <div
          className={'board ' + statusClass}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onTouchEnd={() => setTouchIdx(null)}
        >
          {board.words.map((w, idx) => {
            const clickable = safeClick ? board.can_mark : board.can_click;
            return (
              <div
                key={idx}
                data-idx={idx}
                className={
                  'cell ' +
                  board.layout[idx] +
                  ' ' +
                  (clickable ? '' : 'disabled ') +
                  (board.revealed[idx] ? 'revealed' : 'hidden-word') +
                  (touchIdx === idx ? ' touched' : '')
                }
                onClick={() => onCellClick(idx)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  mark(idx);
                }}
              >
                {!board.revealed[idx] && (
                  <Marks red={board.marks.red.includes(idx)} blue={board.marks.blue.includes(idx)} />
                )}
                <span
                  className="word"
                  role="button"
                  aria-disabled={!clickable || board.revealed[idx] || over}
                  aria-label={cellLabel(idx)}
                >
                  {w}
                </span>
              </div>
            );
          })}
        </div>

        <div className="board-bottom">
          <button type="button" disabled={!board.has_prev} onClick={() => act('prev-board')}>
            Prev Game
          </button>
          <div className="floater-list">
            <div className="section-label">Floaters</div>
            {floaters.length ? (
              floaters.map((p) => <PlayerName key={p.user_id} p={p} me={view.me} onClick={setMenuFor} />)
            ) : (
              <div className="hint">none</div>
            )}
          </div>
          <div className="next-buttons">
            <button type="button" onClick={() => next('next-board')}>
              Next Board
            </button>
            <button type="button" onClick={() => next('next-game')}>
              Next Game
            </button>
          </div>
        </div>

        {graffito}
      </div>

      <TeamList players={view.players} team="blue" me={view.me} onName={setMenuFor} guesses={board.guesses} />

      {showHistory && <SessionHistory rulesetID={view.ruleset.id} onClose={() => setShowHistory(false)} />}

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
