import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// (B2) "Sound file: 30 Second Warning" and "Sound file: Out of Time": each
// shows Default or Custom, with Play, a volume slider, Load file, Restore
// Default (Custom only) and a "?". Loading, restoring and the volume take
// effect at once.
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
  // Slider positions (0-100) while dragging; saved shortly after the last move.
  const [volumes, setVolumes] = React.useState({});
  const saveTimers = React.useRef({});
  const volumeOf = (kind) => volumes[kind] ?? Math.round((sounds[kind].volume ?? 1) * 100);

  const changeVolume = (kind, percent) => {
    setVolumes((v) => ({ ...v, [kind]: percent }));
    if (playing?.kind === kind) playing.audio.volume = percent / 100;
    clearTimeout(saveTimers.current[kind]);
    saveTimers.current[kind] = setTimeout(async () => {
      try {
        const { data } = await axios.post(`/api/rulesets/${rulesetID}/sounds/${kind}/volume`, { volume: percent / 100 });
        onChange(data);
        setVolumes((v) => ({ ...v, [kind]: undefined }));
      } catch (err) {
        setError(kind, errorText(err));
      }
    }, 400);
  };

  const stop = () => {
    playing?.audio.pause();
    setPlaying(null);
  };
  // Leaving the page stops a sound that is still playing.
  React.useEffect(() => () => playing?.audio.pause(), [playing]);

  // Out of Time: Repeat Sound, Every __ Seconds. Saved shortly after a change.
  const [repeatDraft, setRepeatDraft] = React.useState(null); // { on, seconds } while editing
  const repeatTimer = React.useRef(null);
  const repeat = repeatDraft ?? { on: !!sounds.end.repeat, seconds: String(sounds.end.repeatSeconds ?? 10) };
  const changeRepeat = (next) => {
    setRepeatDraft(next);
    setError('end', null);
    clearTimeout(repeatTimer.current);
    const seconds = Number(next.seconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) {
      if (next.seconds !== '') setError('end', 'Enter a whole number of seconds from 1 to 600.');
      return;
    }
    repeatTimer.current = setTimeout(async () => {
      try {
        const { data } = await axios.post(`/api/rulesets/${rulesetID}/sounds/end/repeat`, { on: next.on, seconds });
        onChange(data);
        setRepeatDraft(null);
      } catch (err) {
        setError('end', errorText(err));
      }
    }, 500);
  };

  const play = (kind) => {
    if (playing?.kind === kind) return stop();
    playing?.audio.pause();
    setError(kind, null);
    const audio = new Audio(sounds[kind].url);
    audio.volume = volumeOf(kind) / 100;
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
              <span className="sound-volume" title="Volume">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={volumeOf(kind)}
                  disabled={disabled}
                  onChange={(e) => changeVolume(kind, Number(e.target.value))}
                  aria-label={`${label} volume`}
                />
                <span className="sound-volume-value">{volumeOf(kind)}%</span>
              </span>
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
              {kind === 'end' && (
                <span className="sound-repeat">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={repeat.on}
                      disabled={disabled}
                      onChange={(e) => changeRepeat({ ...repeat, on: e.target.checked })}
                    />{' '}
                    Repeat Sound
                  </label>
                  {repeat.on && (
                    <>
                      {' '}
                      Every{' '}
                      <input
                        className="short"
                        type="number"
                        min="1"
                        max="600"
                        step="1"
                        value={repeat.seconds}
                        disabled={disabled}
                        onChange={(e) => changeRepeat({ ...repeat, seconds: e.target.value })}
                        aria-label="Repeat every how many seconds"
                      />{' '}
                      Seconds
                    </>
                  )}
                </span>
              )}
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
            </span>
            {errors[kind] && (
              <>
                <span />
                <span className="form-error sound-error">{errors[kind]}</span>
              </>
            )}
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
