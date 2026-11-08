import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// Join Video Session (Start page and Waiting Room): open the game's video
// call in a new tab or a new window, or email the link to yourself. The
// last choice is remembered on this device.
const CHOICES = [
  ['tab', 'Open in new tab'],
  ['window', 'Open in new Window'],
  ['email', 'Send me an email invitation'],
];

const loadChoice = () => {
  try {
    const c = localStorage.getItem('cluemein_video_choice');
    return CHOICES.some(([id]) => id === c) ? c : 'tab';
  } catch {
    return 'tab';
  }
};
const saveChoice = (c) => {
  try {
    localStorage.setItem('cluemein_video_choice', c);
  } catch {
    // not remembered; harmless
  }
};

export const VideoPopup = ({ rulesetID, url, onClose }) => {
  const [choice, setChoice] = React.useState(loadChoice);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [error, setError] = React.useState(null);

  const go = async (e) => {
    e.preventDefault();
    saveChoice(choice);
    if (choice === 'tab') {
      window.open(url, '_blank', 'noopener');
      onClose();
    } else if (choice === 'window') {
      // Giving a size makes the browser open a separate window.
      const w = Math.min(1200, screen.availWidth - 80);
      const h = Math.min(850, screen.availHeight - 80);
      window.open(url, '_blank', `noopener,width=${w},height=${h}`);
      onClose();
    } else {
      setBusy(true);
      setError(null);
      try {
        const { data } = await axios.post(`/api/rulesets/${rulesetID}/video-invite`);
        setMessage(`An invitation with the link was sent to ${data.email}.`);
      } catch (err) {
        setError(
          err.response?.data?.error ||
            `The email could not be sent${err.response ? ` (server answered ${err.response.status})` : ' (no answer from the server)'}.`
        );
      }
      setBusy(false);
    }
  };

  return (
    <Popup title="Join Video Session" onClose={onClose}>
      <form className="video-choices" onSubmit={go}>
        {CHOICES.map(([id, label]) => (
          <label key={id} className="video-choice">
            <input
              type="radio"
              name="video-choice"
              value={id}
              checked={choice === id}
              onChange={() => {
                setChoice(id);
                setMessage(null);
                setError(null);
              }}
            />{' '}
            {label}
          </label>
        ))}
        {message && <div className="form-message">{message}</div>}
        {error && <div className="form-error">{error}</div>}
        <div className="button-row centered">
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : choice === 'email' ? 'Send' : 'Go'}
          </button>
          <button type="button" onClick={onClose}>
            {message ? 'Close' : 'Cancel'}
          </button>
        </div>
      </form>
    </Popup>
  );
};
