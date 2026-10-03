import * as React from 'react';
import axios from 'axios';
import {
  DescriptionInput,
  RulesetForm,
  defaultSettings,
  gameLabel,
  settingsProblem,
  settingsToRequest,
  Req,
} from '~/ui/ruleset_form';
import { setLastRuleset } from '~/ui/prefs';

const errorText = (err) => err.response?.data?.error || 'Something went wrong. Please try again.';

// (B1) Create Game: either copy an existing game (then edit it in Modify
// Game) or build one from scratch.
export const CreateGame = ({ user }) => {
  const [name, setName] = React.useState('');
  const [games, setGames] = React.useState([]);
  const [copyFrom, setCopyFrom] = React.useState('');
  const [lists, setLists] = React.useState([]);
  const [settings, setSettings] = React.useState(defaultSettings(user.email));
  const [error, setError] = React.useState(null);
  const [copyError, setCopyError] = React.useState(null); // shown under Copy From
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    axios.get('/api/rulesets').then(({ data }) => setGames(data));
    axios.get('/api/wordlists').then(({ data }) => setLists(data));
  }, []);

  const copy = async () => {
    setError(null);
    setCopyError(null);
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/rulesets/${copyFrom}/copy`, {
        name,
        description: settings.description,
      });
      setLastRuleset(data.id);
      window.location.href = '/modify';
    } catch (err) {
      setCopyError(errorText(err));
      setBusy(false);
    }
  };

  const addGame = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await axios.post('/api/rulesets', { name, ...settingsToRequest(settings) });
      setLastRuleset(data.id);
      window.location.href = '/';
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const problem = !name.trim() ? 'Enter a Name of Game.' : settingsProblem(settings, true);

  return (
    <div id="ruleset-screen">
      <h2 className="screen-heading">Create Game</h2>

      <div className="form-grid">
        <label><Req />Name of Game</label>
        <input
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            setCopyError(null);
          }}
        />
        <label>Game Description</label>
        <DescriptionInput
          value={settings.description}
          onChange={(e) => setSettings({ ...settings, description: e.target.value })}
        />
        <label>Copy From</label>
        <span className="copy-row">
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} disabled={!games.length}>
            <option value="">{games.length ? 'Choose a game…' : 'No games to copy'}</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {gameLabel(g)}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !name.trim() || !copyFrom} onClick={copy}>
            Copy
          </button>
        </span>
        {copyError && (
          <>
            <span />
            <div className="form-error copy-error">{copyError}</div>
          </>
        )}
      </div>

      <div className="or-divider">OR</div>

      <RulesetForm value={settings} onChange={setSettings} lists={lists} mode="create" />

      {error && <div className="form-error">{error}</div>}
      {!error && problem && <div className="form-hint">{problem}</div>}

      <div className="button-row">
        <button type="button" className="primary" disabled={busy || !!problem} onClick={addGame}>
          Add Game
        </button>
        <button type="button" onClick={() => (window.location.href = '/')}>
          Cancel
        </button>
      </div>
    </div>
  );
};
