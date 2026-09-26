import * as React from 'react';
import axios from 'axios';
import CustomWords from '~/ui/custom_words';
import WordSetToggle from '~/ui/wordset_toggle';
import TimerSettings from '~/ui/timer_settings';

export const Lobby = ({ defaultGameID }) => {
  const [newGameName, setNewGameName] = React.useState(defaultGameID);
  // Standard lists from the server: [{ id, name, language, picker_row, count }]
  const [wordLists, setWordLists] = React.useState([]);
  const [selectedListIDs, setSelectedListIDs] = React.useState([]);
  const [customSelected, setCustomSelected] = React.useState(false);
  const [customWordsText, setCustomWordsText] = React.useState('');
  const [warning, setWarning] = React.useState(null);
  const [timer, setTimer] = React.useState(null);
  const [enforceTimerEnabled, setEnforceTimerEnabled] = React.useState(false);

  React.useEffect(() => {
    axios.get('/api/wordlists').then(({ data }) => {
      setWordLists(data);
      const original = data.find((l) => l.name === 'Original');
      if (original) setSelectedListIDs([original.id]);
    });
  }, []);

  const customWords = customWordsText
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const selectedWordCount =
    wordLists
      .filter((l) => selectedListIDs.includes(l.id))
      .reduce((a, l) => a + l.count, 0) +
    (customSelected ? customWords.length : 0);

  React.useEffect(() => {
    if (selectedWordCount >= 25) {
      setWarning(null);
    }
  }, [selectedWordCount]);

  function handleNewGame(e) {
    e.preventDefault();
    if (!newGameName) {
      return;
    }

    if (selectedWordCount < 25) {
      setWarning('Selected wordsets do not include at least 25 words.');
      return;
    }

    axios
      .post('/next-game', {
        game_id: newGameName,
        wordlist_ids: selectedListIDs,
        word_set: customSelected ? customWords : [],
        create_new: false,
        timer_duration_ms:
          timer && timer.length ? timer[0] * 60 * 1000 + timer[1] * 1000 : 0,
        enforce_timer: timer && timer.length && enforceTimerEnabled,
      })
      .then(() => {
        window.location = '/game/' + encodeURIComponent(newGameName);
      })
      .catch((err) => setWarning(err.response?.data || 'Could not start the game.'));
  }

  const toggleList = (id) => {
    setSelectedListIDs(
      selectedListIDs.includes(id)
        ? selectedListIDs.filter((x) => x !== id)
        : [...selectedListIDs, id]
    );
  };

  const listRow = (row) => (
    <div className="wordset-row">
      {wordLists
        .filter((l) => l.picker_row === row)
        .map((l) => (
          <WordSetToggle
            key={l.id}
            label={l.name}
            selected={selectedListIDs.includes(l.id)}
            onToggle={() => toggleList(l.id)}
          ></WordSetToggle>
        ))}
    </div>
  );

  return (
    <div id="lobby">
      <div id="available-games">
        <form id="new-game">
          <p className="intro">
            Play ClueMeIn online across multiple devices on a shared board. To
            create a new game or join an existing game, enter a game identifier
            and click 'GO'.
          </p>
          <input
            type="text"
            id="game-name"
            aria-label="game identifier"
            autoFocus
            onChange={(e) => {
              setNewGameName(e.target.value);
            }}
            value={newGameName}
          />

          <button disabled={!newGameName.length} onClick={handleNewGame}>
            Go
          </button>

          {warning !== null ? (
            <div className="warning">{warning}</div>
          ) : (
            <div></div>
          )}

          <TimerSettings
            {...{
              timer,
              setTimer,
              enforceTimerEnabled,
              setEnforceTimerEnabled,
            }}
          />

          <div id="new-game-options">
            <div id="wordsets">
              <p className="instruction">
                You've selected <strong>{selectedWordCount}</strong> words.
              </p>
              <div id="default-wordsets">
                {listRow(1)}
                {listRow(2)}
              </div>

              <CustomWords
                words={customWordsText}
                onWordChange={setCustomWordsText}
                selected={customSelected}
                onToggle={() => setCustomSelected(!customSelected)}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
