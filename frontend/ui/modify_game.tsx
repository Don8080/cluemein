import * as React from 'react';
import axios from 'axios';
import { RulesetForm, settingsFromRuleset, settingsProblem, settingsToRequest } from '~/ui/ruleset_form';
import { Vocabulary } from '~/ui/vocabulary';

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

  const goBack = () => (window.location.href = '/');

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

  if (!settings) {
    return <div id="ruleset-screen">{error ? <div className="form-error">{error}</div> : <p>Loading…</p>}</div>;
  }

  const problem = settingsProblem(settings, false);

  return (
    <div id="ruleset-screen">
      <h2>Modify Game: {ruleset.name}</h2>

      <RulesetForm
        value={settings}
        onChange={setSettings}
        lists={lists}
        mode="modify"
        addedListIDs={ruleset.wordlist_ids}
      />

      <div className="form-section">
        <button type="button" onClick={() => setShowVocabulary(true)}>
          Modify Vocabulary
        </button>{' '}
        <span className="hint">{ruleset.word_count} words in this game</span>
      </div>

      {error && <div className="form-error">{error}</div>}
      {!error && problem && <div className="form-hint">{problem}</div>}

      <div className="button-row">
        <button type="button" className="primary" disabled={busy || !!problem} onClick={save}>
          Save
        </button>
        <button type="button" onClick={goBack}>
          Cancel
        </button>
      </div>

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
