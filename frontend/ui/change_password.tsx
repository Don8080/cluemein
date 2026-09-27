import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// (P3) Change Password. Opened from the Login popup (needs the current
// password) or from the forgot-password email (`resetToken`, no current
// password; saving also logs in). Field values are read when Save is
// clicked, so browser autofill is always picked up.
export const ChangePassword = ({ email: initialEmail, resetToken, onSaved, onCancel }) => {
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const emailRef = React.useRef(null);
  const currentRef = React.useRef(null);
  const passwordRef = React.useRef(null);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    const email = resetToken ? '' : (emailRef.current?.value ?? initialEmail ?? '').trim();
    const current = currentRef.current?.value || '';
    const password = passwordRef.current.value;
    if (!resetToken && !email) return setError('Enter your email address.');
    if (!resetToken && !current) return setError('Enter your current password.');
    if (!password) return setError('Enter a new password.');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/change-password', { token: resetToken, email, current, password });
      onSaved(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = resetToken ? 'Set a New Password' : 'Password Change for ' + (initialEmail || '…');

  return (
    <Popup title={title} onClose={onCancel}>
      <form className="login-form" onSubmit={save}>
        {!resetToken && !initialEmail && (
          <label>
            Email
            <input ref={emailRef} type="email" name="email" autoComplete="username" autoFocus />
          </label>
        )}
        {!resetToken && (
          <label>
            Current Password
            <input
              ref={currentRef}
              type="password"
              name="current-password"
              autoComplete="current-password"
              autoFocus={!!initialEmail}
            />
          </label>
        )}
        <label>
          New Password
          <input
            ref={passwordRef}
            type="password"
            name="new-password"
            autoComplete="new-password"
            autoFocus={!!resetToken}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="button-row">
          <button type="submit" disabled={busy}>
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
