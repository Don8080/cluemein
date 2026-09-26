import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

const firstLetter = (w) => Array.from(w)[0] || '';

// (P2) Change Vocabulary: filter, add and delete this game's words.
// Changes apply to this game only, never to the standard lists.
export const Vocabulary = ({ rulesetID, onClose }) => {
  const [words, setWords] = React.useState(null); // [{ word, source }]
  const [searchText, setSearchText] = React.useState('');
  const [search, setSearch] = React.useState(''); // applied search
  const [letter, setLetter] = React.useState(null);
  const [toDelete, setToDelete] = React.useState(new Set());
  const [addText, setAddText] = React.useState('');
  const [message, setMessage] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    axios.get(`/api/rulesets/${rulesetID}/words`).then(({ data }) => {
      setWords(data);
      // Start filtered on the first word alphabetically so the list is short.
      if (data.length) {
        setSearchText(data[0].word);
        setSearch(data[0].word);
      }
    });
  }, []);

  // Starting letters come from the vocabulary itself, so other alphabets work.
  const letters = React.useMemo(
    () => [...new Set((words || []).map((w) => firstLetter(w.word)))].sort((a, b) => a.localeCompare(b)),
    [words]
  );

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (words || []).filter(
      (w) =>
        (!letter || firstLetter(w.word) === letter) &&
        (!q || w.word.toLowerCase().includes(q) || w.source.toLowerCase().includes(q))
    );
  }, [words, search, letter]);

  const toggleDelete = (word) => {
    const next = new Set(toDelete);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setToDelete(next);
  };

  const addWords = addText
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  const apply = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/rulesets/${rulesetID}/words`, {
        add: addWords,
        delete: [...toDelete],
      });
      setWords(data.words);
      setToDelete(new Set());
      setAddText('');
      setMessage(`Added ${data.added}, deleted ${data.deleted}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popup title="Change Vocabulary" onClose={onClose} wide>
      <div className="vocabulary">
        <form
          className="vocab-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchText);
          }}
        >
          <label>
            Search String{' '}
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </label>
          <button type="submit">Search</button>
        </form>

        <div className="vocab-letters">
          <span className="hint">Starting Letter</span>
          {letters.map((l) => (
            <button
              key={l}
              type="button"
              className={'letter' + (l === letter ? ' active' : '')}
              onClick={() => setLetter(l === letter ? null : l)}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="vocab-add">
          Add Words (comma separated)
          <input value={addText} onChange={(e) => setAddText(e.target.value)} />
        </label>

        <div className="vocab-count hint">
          {words ? `Showing ${shown.length} of ${words.length} words` : 'Loading…'}
          {toDelete.size > 0 && ` · ${toDelete.size} marked for deletion`}
        </div>
        <div className="vocab-list">
          <table>
            <thead>
              <tr>
                <th>Word</th>
                <th>Delete</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.word}>
                  <td>{w.word}</td>
                  <td>
                    <input type="checkbox" checked={toDelete.has(w.word)} onChange={() => toggleDelete(w.word)} />
                  </td>
                  <td>{w.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-message">{message}</div>}

        <div className="button-row">
          <button type="button" disabled={busy || (!addWords.length && !toDelete.size)} onClick={apply}>
            Add / Delete
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={() => (window.location.href = `/api/rulesets/${rulesetID}/words.csv`)}>
            Export Vocabulary
          </button>
        </div>
      </div>
    </Popup>
  );
};
