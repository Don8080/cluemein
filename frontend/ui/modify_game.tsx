import * as React from 'react';
import axios from 'axios';
import { RulesetForm, settingsFromRuleset, settingsProblem, settingsToRequest } from '~/ui/ruleset_form';
import { Vocabulary } from '~/ui/vocabulary';
import { Popup } from '~/ui/popup';
import { SoundRows } from '~/ui/sound_rows';

// (B2) Rename popup: "Rename <old name> to ____". Saves at once.
const RenamePopup = ({ rulesetID, oldName, onRenamed, onClose }) => {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const rename = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/rulesets/${rulesetID}/rename`, { name });
      onRenamed(data.name);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <Popup title="Rename Game" onClose={onClose}>
      <form className="login-form rename-form" onSubmit={rename}>
        <label>
          Rename {oldName} to{' '}
          <input className="rename-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="button-row">
          <button type="submit" disabled={busy || !name.trim() || name.trim() === oldName}>
            Rename
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
};

const errorText = (err) => err.response?.data?.error || 'Something went wrong. Please try again.';

// (B2) Modify Game. Any member of the game can change it.
export const ModifyGame = ({ rulesetID }) => {
  const [ruleset, setRuleset] = React.useState(null);
  const [settings, setSettings] = React.useState(null);
  const [lists, setLists] = React.useState([]);
  const [showVocabulary, setShowVocabulary] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = () =>
    axios
      .get(`/api/rulesets/${rulesetID}`)
      .then(({ data }) => {
        setRuleset(data);
        setSettings(settingsFromRuleset(data));
      })
      .catch((err) => setError(errorText(err)));

  React.useEffect(() => {
    load();
    axios.get('/api/wordlists').then(({ data }) => setLists(data));
  }, []);

  // Opened from the board in its own tab: close it to return to the game.
  // (Staying on the board's tab keeps the player present in the session.)
  const fromBoard = new URLSearchParams(window.location.search).get('from') === 'board';
  const goBack = () => {
    if (fromBoard) {
      window.close();
      return;
    }
    window.location.href = '/';
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await axios.put(`/api/rulesets/${rulesetID}`, settingsToRequest(settings));
      goBack();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  // Delete turns the game's Active flag off and stays here, offering
  // Restore Game until the page closes.
  const [deleted, setDeleted] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const toggleDeleted = async () => {
    if (!deleted && !window.confirm(`Delete "${ruleset.name}" for all of its players?`)) return;
    setError(null);
    setBusy(true);
    try {
      await axios.post(`/api/rulesets/${rulesetID}/${deleted ? 'restore' : 'delete'}`);
      setDeleted(!deleted);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  if (!settings) {
    return <div id="ruleset-screen">{error ? <div className="form-error">{error}</div> : <p>Loading…</p>}</div>;
  }

  const problem = settingsProblem(settings, false);

  return (
    <div id="ruleset-screen">
      <h2 className="screen-heading">Modify Game: {ruleset.name}</h2>
      <div className="rename-row">
        <button type="button" disabled={busy || deleted} onClick={() => setRenaming(true)}>
          Rename
        </button>
      </div>

      <RulesetForm
        value={settings}
        onChange={setSettings}
        lists={lists}
        mode="modify"
        addedListIDs={ruleset.wordlist_ids}
        afterGraffito={
          <SoundRows
            rulesetID={rulesetID}
            sounds={ruleset.sounds}
            disabled={deleted}
            onChange={(sounds) => setRuleset({ ...ruleset, sounds })}
          />
        }
        beforeWordLists={
          <div className="form-section">
            <button type="button" disabled={deleted} onClick={() => setShowVocabulary(true)}>
              Modify Vocabulary
            </button>{' '}
            <span className="hint">{ruleset.word_count} words in this game</span>
          </div>
        }
      />

      {error && <div className="form-error">{error}</div>}
      {!error && problem && <div className="form-hint">{problem}</div>}

      <div className="button-row">
        <button type="button" className="primary" disabled={busy || deleted || !!problem} onClick={save}>
          Save
        </button>
        <button type="button" onClick={goBack}>
          {deleted ? 'Return' : 'Cancel'}
        </button>
        <button type="button" className={deleted ? 'restore-game' : 'delete-game'} disabled={busy} onClick={toggleDeleted}>
          {deleted ? 'Restore Game' : 'Delete'}
        </button>
      </div>

      {renaming && (
        <RenamePopup
          rulesetID={rulesetID}
          oldName={ruleset.name}
          onClose={() => setRenaming(false)}
          onRenamed={(name) => {
            setRuleset({ ...ruleset, name });
            setRenaming(false);
          }}
        />
      )}

      {showVocabulary && (
        <Vocabulary
          rulesetID={rulesetID}
          onClose={() => {
            setShowVocabulary(false);
            // Refresh the word count without discarding unsaved settings.
            axios.get(`/api/rulesets/${rulesetID}`).then(({ data }) => setRuleset(data));
          }}
        />
      )}
    </div>
  );
};
