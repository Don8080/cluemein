import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// (P3) Change Password. Opened from the Login popup (needs the current
// password) or from the forgot-password email (`resetToken`, no current
// password; saving also logs in).
export const ChangePassword = ({ email: initialEmail, resetToken, onSaved, onCancel }) => {
  const [email, setEmail] = React.useState(initialEmail || '');
  const [current, setCurrent] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await axios.post('/api/change-password', {
        token: resetToken,
        email,
        current,
        password,
      });
      onSaved(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = resetToken ? 'Set a New Password' : 'Password Change for ' + (email || '…');

  return (
    <Popup title={title} onClose={onCancel}>
      <form className="login-form" onSubmit={save}>
        {!resetToken && !initialEmail && (
          <label>
            Email
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {!resetToken && (
          <label>
            Current Password
            <input
              type="password"
              autoComplete="current-password"
              autoFocus={!!initialEmail}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
        )}
        <label>
          New Password
          <input
            type="password"
            autoComplete="new-password"
            autoFocus={!!resetToken}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="button-row">
          <button
            type="submit"
            disabled={busy || !password || (!resetToken && (!email || !current))}
          >
            Save
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
};
