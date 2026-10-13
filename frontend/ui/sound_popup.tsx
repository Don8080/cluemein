import * as React from 'react';
import { Popup } from '~/ui/popup';

// This browser's id, kept in localStorage so all its windows count as one
// device. Falls back to an id for this page if storage is unavailable.
let pageDevice = null;
export function deviceId() {
  try {
    let id = localStorage.getItem('cluemein_device');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('cluemein_device', id);
    }
    return id;
  } catch {
    pageDevice = pageDevice || Math.random().toString(36).slice(2);
    return pageDevice;
  }
}

// Is sound on for this device? Devices the server hasn't seen yet follow
// "All Players: Off".
export function myDeviceOn(sound) {
  const mine = sound?.devices?.[deviceId()];
  return mine === undefined ? !sound?.all_off : mine;
}

// Which side the popup shows ("device" or "all"), remembered for this
// session only, so a new session opens on My Device.
const scopeKey = (rulesetID, startedAt) => `cluemein_sound_scope_${rulesetID}_${startedAt}`;
function loadScope(rulesetID, startedAt) {
  try {
    return localStorage.getItem(scopeKey(rulesetID, startedAt)) === 'all' ? 'all' : 'device';
  } catch {
    return 'device';
  }
}
function saveScope(rulesetID, startedAt, scope) {
  try {
    localStorage.setItem(scopeKey(rulesetID, startedAt), scope);
  } catch {
    // not remembered; harmless
  }
}

// (C1) Sound popup: one button switches between "My Device:" and "All
// Players:"; the toggle beside it turns sound on or off for that choice.
// All Players shows On while anyone still has sound on.
export const SoundPopup = ({ view, act, onClose }) => {
  const { sound } = view;
  const [scope, setScope] = React.useState(() => loadScope(view.ruleset.id, sound.session_started));
  const switchScope = () => {
    const next = scope === 'device' ? 'all' : 'device';
    setScope(next);
    saveScope(view.ruleset.id, sound.session_started, next);
  };
  const on = scope === 'device' ? myDeviceOn(sound) : sound.any_on;
  const toggle = () => act('sound', { scope, on: !on, device: deviceId() });

  return (
    <Popup title="Sound" onClose={onClose}>
      <div className="sound-popup">
        <button type="button" className="sound-scope" onClick={switchScope} title="Switch between this device and all players">
          {scope === 'device' ? 'My Device:' : 'All Players:'}
        </button>
        <label className={'sound-switch' + (on ? ' on' : '')}>
          <input type="checkbox" checked={on} onChange={toggle} />
          <span className="sound-switch-track">
            <span className="sound-switch-knob" />
          </span>
          <span className="sound-switch-label">{on ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className="button-row centered">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Popup>
  );
};
