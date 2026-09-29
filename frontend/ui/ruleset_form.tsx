import * as React from 'react';
import axios from 'axios';
import WordSetToggle from '~/ui/wordset_toggle';
import { Popup } from '~/ui/popup';

// Settings shared by Create Game (B1) and Modify Game (B2). The parent owns
// the values; timer durations are edited in minutes.

export const emptyPlayer = () => ({ name: '', email: '' });
const isBlank = (p) => !p.name.trim() && !p.email.trim();

export const DESCRIPTION_MAX = 75;

// How a game appears in dropdowns: its name and description.
export const gameLabel = (g) => (g.description ? `${g.name} — ${g.description}` : g.name);

export function defaultSettings(myEmail) {
  return {
    description: '',
    max_session_hours: '4',
    min_players: '4',
    min_team_size: '',
    players: [{ name: '', email: myEmail || '' }, emptyPlayer()],
    video_url: '',
    graffito_message: '',
    graffito_url: '',
    wordlist_ids: [],
    timer_on: false,
    first_turn_minutes: '5',
    next_turn_minutes: '2',
    enforce_timer: false,
    team_mode: 'random',
  };
}

// Converts a RuleSet from the server into form values.
export function settingsFromRuleset(rs) {
  return {
    description: rs.description,
    max_session_hours: String(rs.max_session_hours),
    min_players: String(rs.min_players),
    min_team_size: String(rs.min_team_size),
    players: [...rs.players.map((p) => ({ name: p.name, email: p.email, status: p.status })), emptyPlayer()],
    video_url: rs.video_url,
    graffito_message: rs.graffito_message,
    graffito_url: rs.graffito_url,
    wordlist_ids: [],
    timer_on: rs.timer_on,
    first_turn_minutes: String(rs.first_turn_seconds / 60),
    next_turn_minutes: String(rs.next_turn_seconds / 60),
    enforce_timer: rs.enforce_timer,
    team_mode: rs.team_mode,
  };
}

// Converts form values into the request body the server expects.
export function settingsToRequest(s) {
  return {
    description: s.description,
    max_session_hours: s.max_session_hours,
    min_players: s.min_players,
    min_team_size: s.min_team_size,
    players: s.players.filter((p) => !isBlank(p)).map((p) => ({ name: p.name, email: p.email })),
    video_url: s.video_url,
    graffito_message: s.graffito_message,
    graffito_url: s.graffito_url,
    wordlist_ids: s.wordlist_ids,
    timer_on: s.timer_on,
    first_turn_seconds: Math.round(Number(s.first_turn_minutes) * 60),
    next_turn_seconds: Math.round(Number(s.next_turn_minutes) * 60),
    enforce_timer: s.enforce_timer,
    team_mode: s.team_mode,
  };
}

// Returns why the form can't be saved yet, or null. `needLists` is true for
// Create Game, where at least one word list is required.
export function settingsProblem(s, needLists) {
  const minPlayers = Number(s.min_players);
  const minTeam = Number(s.min_team_size);
  if (!s.max_session_hours || !s.min_players || !s.min_team_size) return 'Fill in the required (*) fields.';
  if (Number.isInteger(minPlayers) && Number.isInteger(minTeam) && minTeam > minPlayers - 1) {
    return `Minimum Team Size can be at most ${minPlayers - 1} with ${minPlayers} players.`;
  }
  const complete = s.players.filter((p) => p.name.trim() && p.email.trim()).length;
  if (s.players.some((p) => !isBlank(p) && (!p.name.trim() || !p.email.trim()))) {
    return 'Every player needs both a name and an email.';
  }
  if (complete < 3) return 'Enter at least 3 players.';
  if (needLists && !s.wordlist_ids.length) return 'Choose at least one word list.';
  return null;
}

const STATUS_LABELS = { none: 'No Account', pending: 'Pending', verified: 'Verified' };
const looksLikeEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Player rows. A spare blank row is added when one gets focus, keeping at
// most two blank rows. Each email's account status (No Account / Pending /
// Verified) is looked up when you tab out of it.
const PlayerRows = ({ players, onChange, removable }) => {
  const set = (i, field, value) => onChange(players.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  // email (lowercase) -> 'none' | 'pending' | 'verified'
  const [statuses, setStatuses] = React.useState(() =>
    Object.fromEntries(players.filter((p) => p.status).map((p) => [p.email.toLowerCase(), p.status]))
  );
  const lookUp = (email) => {
    const key = email.trim().toLowerCase();
    if (!looksLikeEmail(key) || statuses[key]) return;
    axios
      .get('/api/account-status', { params: { email: key } })
      .then(({ data }) => setStatuses((s) => ({ ...s, [key]: data.status })));
  };
  // Emails already filled in when the form opens (e.g. your own on Create Game).
  React.useEffect(() => {
    players.forEach((p) => p.email && lookUp(p.email));
  }, []);
  const onFocus = (i) => {
    if (!isBlank(players[i])) return;
    if (players.filter(isBlank).length < 2) onChange([...players, emptyPlayer()]);
  };
  const remove = (i) => {
    const rest = players.filter((_, j) => j !== i);
    onChange(rest.some(isBlank) ? rest : [...rest, emptyPlayer()]);
  };

  return (
    <table className="players-table">
      <thead>
        <tr>
          <th>*Player Name</th>
          <th>*Email</th>
          <th>Status</th>
          {removable && <th></th>}
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const status = statuses[p.email.trim().toLowerCase()];
          return (
          <tr key={i}>
            <td>
              <input value={p.name} onFocus={() => onFocus(i)} onChange={(e) => set(i, 'name', e.target.value)} />
            </td>
            <td>
              <input
                type="email"
                value={p.email}
                onFocus={() => onFocus(i)}
                onChange={(e) => set(i, 'email', e.target.value)}
                onBlur={(e) => lookUp(e.target.value)}
              />
            </td>
            <td className={`account-status ${status || ''}`}>{status ? STATUS_LABELS[status] : ''}</td>
            {removable && (
              <td>
                {!isBlank(p) && (
                  <button type="button" className="link-button" onClick={() => remove(i)}>
                    Remove
                  </button>
                )}
              </td>
            )}
          </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// Word-list toggles: English lists on row 1, other languages below.
// `hideIDs` hides lists already in the game (Modify Game).
export const WordListPicker = ({ lists, selected, onChange, hideIDs = [] }) => {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const row = (n) => {
    const shown = lists.filter((l) => l.picker_row === n && !hideIDs.includes(l.id));
    if (!shown.length) return null;
    return (
      <div className="wordset-row">
        {shown.map((l) => (
          <WordSetToggle
            key={l.id}
            label={`${l.name} (${l.count})`}
            selected={selected.includes(l.id)}
            onToggle={() => toggle(l.id)}
          />
        ))}
      </div>
    );
  };
  return (
    <div id="wordsets" className="wordlist-picker">
      {row(1)}
      {row(2)}
    </div>
  );
};

// Game Description field with a character count (max 75).
export const DescriptionInput = ({ value, onChange }) => (
  <span className="description-field">
    <input value={value} maxLength={DESCRIPTION_MAX} onChange={onChange} />
    <span className="hint">
      {value.length}/{DESCRIPTION_MAX}
    </span>
  </span>
);

export const TEAM_MODES = [
  ['fixed_teams', 'Fixed Teams'],
  ['fixed_roles', 'Fixed Roles'],
  ['random', 'Random'],
];

// The "?" next to Team Assignment Mode.
const TeamModeHelp = ({ onClose }) => (
  <Popup title="Team Assignment Mode" onClose={onClose} wide>
    <ol className="team-mode-help">
      <li>
        <b>Fixed Teams:</b> The first game is randomly assigned. Players can make any changes they like. Next Game
        will not change team members, but the Cluer roles are selected randomly taking care to keep roles fairly
        distributed. Players can make manual changes at any time.
      </li>
      <li>
        <b>Fixed Roles:</b> The first game is randomly assigned. Players can make any changes they like. Next Game
        will not change team members or roles. The assigned Cluers remain Cluers. Players can make manual changes at
        any time.
      </li>
      <li>
        <b>Random:</b> Roles and team membership are assigned randomly at every game, taking care to keep roles
        fairly distributed.
      </li>
    </ol>
    <p>In all cases, changing a Cluer forces a new board.</p>
    <div className="button-row centered">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  </Popup>
);

export const RulesetForm = ({ value, onChange, lists, mode, addedListIDs = [], beforeWordLists = null }) => {
  const set = (field) => (e) =>
    onChange({ ...value, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const [showModeHelp, setShowModeHelp] = React.useState(false);

  // Mouseover text for the label and its field.
  const tips = {
    sessionDuration: `Session ends after ${value.max_session_hours || 'x'} hours`,
    minPlayers: 'Define when the team assignments can be made',
    minTeamSize:
      'Establish how the number of session players determines the number of floaters. For example:\n\n' +
      'When there are 5 players:\n' +
      'A minimum team size of 3 means 1 floater.\n' +
      'A minimum team size of 4 means 3 floaters',
  };

  return (
    <div className="ruleset-form">
      <div className="form-grid">
        {mode === 'modify' && (
          <>
            <label>Game Description</label>
            <DescriptionInput value={value.description} onChange={set('description')} />
          </>
        )}
        <label title={tips.sessionDuration}>*Maximum Session Duration</label>
        <span title={tips.sessionDuration}>
          <input className="short" type="number" min="0.5" max="24" step="0.5" value={value.max_session_hours} onChange={set('max_session_hours')} /> Hours
        </span>
        <label title={tips.minPlayers}>*Minimum Number of Players</label>
        <span title={tips.minPlayers}>
          <input className="short" type="number" min="3" value={value.min_players} onChange={set('min_players')} />
        </span>
        <label title={tips.minTeamSize}>*Minimum Team Size</label>
        <span title={tips.minTeamSize}>
          <input className="short" type="number" min="2" value={value.min_team_size} onChange={set('min_team_size')} />{' '}
          <span className="hint">Includes Cluers and Floaters</span>
        </span>
        <label>Team Assignment Mode</label>
        <span>
          <select value={value.team_mode} onChange={set('team_mode')}>
            {TEAM_MODES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>{' '}
          <button type="button" className="help-button" title="What do these mean?" onClick={() => setShowModeHelp(true)}>
            ?
          </button>
        </span>
      </div>
      {showModeHelp && <TeamModeHelp onClose={() => setShowModeHelp(false)} />}

      <PlayerRows
        players={value.players}
        onChange={(players) => onChange({ ...value, players })}
        removable={mode === 'modify'}
      />

      <div className="form-grid">
        <label>Video Chat URL</label>
        <input value={value.video_url} onChange={set('video_url')} />
        <label>Graffito Message</label>
        <input value={value.graffito_message} onChange={set('graffito_message')} />
        <label>Graffito URL</label>
        <input value={value.graffito_url} onChange={set('graffito_url')} />
      </div>

      {beforeWordLists}

      <div className="form-section">
        <div className="section-label">{mode === 'create' ? '*Build Word List' : 'Add Word Lists'}</div>
        <WordListPicker
          lists={lists}
          selected={value.wordlist_ids}
          onChange={(wordlist_ids) => onChange({ ...value, wordlist_ids })}
          hideIDs={addedListIDs}
        />
      </div>

      <div className="form-section timer-settings">
        <label className="check">
          Timer <input type="checkbox" checked={value.timer_on} onChange={set('timer_on')} />
        </label>
        {/* The timer's settings only appear while the timer is on. */}
        {value.timer_on && (
          <div className="form-grid">
            <label>First Turn Duration</label>
            <span>
              <input className="short" type="number" min="0.5" step="0.5" value={value.first_turn_minutes} onChange={set('first_turn_minutes')} /> Minutes
            </span>
            <label>Subsequent Turn Duration</label>
            <span>
              <input className="short" type="number" min="0.5" step="0.5" value={value.next_turn_minutes} onChange={set('next_turn_minutes')} /> Minutes
            </span>
            <label>Enforce Timer</label>
            <span>
              <input type="checkbox" checked={value.enforce_timer} onChange={set('enforce_timer')} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
