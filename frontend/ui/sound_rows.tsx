import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// (B2) "Sound file: 30 Second Warning" and "Sound file: Out of Time": each
// shows Default or Custom, with Play, Load file, Restore Default (Custom
// only) and a "?". Loading or restoring takes effect at once.
const SOUNDS = [
  ['warning', '30 Second Warning'],
  ['end', 'Out of Time'],
];
const ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';
const MAX_BYTES = 1024 * 1024;

const errorText = (err) =>
  err.response?.data?.error ||
  (err.response?.status === 413 ? 'That file is larger than 1 MB.' : 'Something went wrong. Please try again.');

export const SoundRows = ({ rulesetID, sounds, onChange, disabled }) => {
  const [playing, setPlaying] = React.useState(null); // { kind, audio }
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(null);
  const [help, setHelp] = React.useState(false);
  const inputs = { warning: React.useRef(null), end: React.useRef(null) };
  const setError = (kind, msg) => setErrors((e) => ({ ...e, [kind]: msg }));

  const stop = () => {
    playing?.audio.pause();
    setPlaying(null);
  };
  // Leaving the page stops a sound that is still playing.
  React.useEffect(() => () => playing?.audio.pause(), [playing]);

  const play = (kind) => {
    if (playing?.kind === kind) return stop();
    playing?.audio.pause();
    setError(kind, null);
    const audio = new Audio(sounds[kind].url);
    audio.onended = () => setPlaying((p) => (p?.audio === audio ? null : p));
    audio.play().catch(() => {
      setError(kind, 'This browser could not play that sound.');
      setPlaying(null);
    });
    setPlaying({ kind, audio });
  };

  const load = async (kind, file) => {
    if (!file) return;
    stop();
    setError(kind, null);
    if (file.size > MAX_BYTES) return setError(kind, 'That file is larger than 1 MB.');
    setBusy(kind);
    try {
      const { data } = await axios.post(`/api/rulesets/${rulesetID}/sounds/${kind}`, file, {
        headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      });
      onChange(data);
    } catch (err) {
      setError(kind, errorText(err));
    }
    setBusy(null);
  };

  const restore = async (kind) => {
    stop();
    setError(kind, null);
    setBusy(kind);
    try {
      const { data } = await axios.delete(`/api/rulesets/${rulesetID}/sounds/${kind}`);
      onChange(data);
    } catch (err) {
      setError(kind, errorText(err));
    }
    setBusy(null);
  };

  return (
    <>
      {SOUNDS.map(([kind, label]) => {
        const s = sounds[kind];
        return (
          <React.Fragment key={kind}>
            <label>Sound file: {label}</label>
            <span className="sound-row">
              <span className="sound-status" title={s.custom ? s.filename : undefined}>
                {s.custom ? 'Custom' : 'Default'}
              </span>
              <button type="button" onClick={() => play(kind)}>
                {playing?.kind === kind ? 'Stop' : 'Play'}
              </button>
              <button type="button" disabled={disabled || busy === kind} onClick={() => inputs[kind].current.click()}>
                Load file
              </button>
              {s.custom && (
                <button type="button" disabled={disabled || busy === kind} onClick={() => restore(kind)}>
                  Restore Default
                </button>
              )}
              <button type="button" className="help-button" title="Acceptable files" onClick={() => setHelp(true)}>
                ?
              </button>
              <input
                ref={inputs[kind]}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  load(kind, e.target.files[0]);
                  e.target.value = ''; // so the same file can be chosen again
                }}
              />
              {errors[kind] && <span className="form-error sound-error">{errors[kind]}</span>}
            </span>
          </React.Fragment>
        );
      })}
      {help && (
        <Popup title="Sound Files" onClose={() => setHelp(false)}>
          <p>Acceptable files:</p>
          <ul>
            <li>MP3 (.mp3)</li>
            <li>M4A / AAC (.m4a)</li>
            <li>WAV (.wav)</li>
          </ul>
          <p>Maximum size: 1 MB.</p>
          <p>
            A new file replaces the sound for everyone in this game right away. Restore Default brings back the
            standard gong.
          </p>
          <div className="button-row centered">
            <button type="button" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        </Popup>
      )}
    </>
  );
};
