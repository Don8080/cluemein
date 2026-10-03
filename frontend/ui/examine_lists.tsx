import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// (B1/B2) Examine Word Lists: every standard list as a button; clicking one
// shows its words (replacing the list shown before). The filter box narrows
// the words as you type. Read only.
export const ExamineWordLists = ({ lists, onClose }) => {
  const [listID, setListID] = React.useState(null);
  const [words, setWords] = React.useState(null);
  const [filter, setFilter] = React.useState('');
  const cache = React.useRef({});
  const wanted = React.useRef(null); // the list most recently clicked

  const show = (id) => {
    wanted.current = id;
    setListID(id);
    if (cache.current[id]) {
      setWords(cache.current[id]);
      return;
    }
    setWords(null);
    axios.get(`/api/wordlists/${id}/words`).then(({ data }) => {
      cache.current[id] = data;
      if (wanted.current === id) setWords(data); // ignore a slow answer for an earlier click
    });
  };

  const q = filter.trim().toLowerCase();
  const shown = (words || []).filter((w) => !q || w.toLowerCase().includes(q));
  // Three columns read top to bottom: first third, middle third, last third.
  const per = Math.ceil(shown.length / 3);
  const columns = [0, 1, 2].map((i) => shown.slice(i * per, (i + 1) * per));
  const row = (n) => (
    <div className="examine-row">
      {lists
        .filter((l) => l.picker_row === n)
        .map((l) => (
          <button
            key={l.id}
            type="button"
            className={'examine-list' + (l.id === listID ? ' active' : '')}
            onClick={() => show(l.id)}
          >
            {l.name} ({l.count})
          </button>
        ))}
    </div>
  );

  return (
    <Popup title="Examine Word Lists" onClose={onClose} wide>
      <div className="vocabulary examine-lists">
        {row(1)}
        {row(2)}
        <label className="vocab-search">
          Filter <input value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="vocab-count hint">
          {listID === null
            ? 'Click a word list to see its words.'
            : words
            ? `${lists.find((l) => l.id === listID)?.name}: showing ${shown.length} of ${words.length} words`
            : 'Loading…'}
        </div>
        <div className="vocab-list examine-words">
          {columns.map((col, i) => (
            <div key={i} className="examine-column">
              {col.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="button-row">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Popup>
  );
};
