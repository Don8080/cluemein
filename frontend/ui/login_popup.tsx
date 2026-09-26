import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

const errorText = (err) => err.response?.data?.error || 'Something went wrong. Please try again.';

// (P0) Login. One screen for logging in and creating an account.
export const LoginPopup = ({ onClose, onLoggedIn, onPending, onChangePassword, notice }) => {
  const [keep, setKeep] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [message, setMessage] = React.useState(notice || null);
  const [busy, setBusy] = React.useState(false);

  const run = (fn) => async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
      if (err.response?.data?.pending) onPending(err.response.data.pending);
    } finally {
      setBusy(false);
    }
  };

  const login = run(async () => {
    const { data } = await axios.post('/api/login', { email, password, keep });
    onLoggedIn(data.user);
  });

  const createAccount = run(async () => {
    const { data } = await axios.post('/api/register', { email, password, keep });
    onPending(data.pending);
  });

  const forgotPassword = run(async () => {
    const { data } = await axios.post('/api/forgot-password', { email });
    setMessage(data.message);
  });

  return (
    <Popup title="Login" onClose={onClose}>
      <form className="login-form" onSubmit={login}>
        <label className="check">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          Keep me signed in
        </label>
        <label>
          Email
          <input
            type="email"
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <span className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="link-button"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>

        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-message">{message}</div>}

        <div className="button-row">
          <button type="submit" disabled={busy || !email || !password}>
            Login
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="button-row secondary">
          <button type="button" disabled={busy || !email || !password} onClick={createAccount}>
            Create Account
          </button>
          <button type="button" disabled={busy || !email} onClick={forgotPassword}>
            Forgot Password
          </button>
          <button type="button" disabled={busy} onClick={() => onChangePassword(email)}>
            Change Password
          </button>
        </div>
      </form>
    </Popup>
  );
};
