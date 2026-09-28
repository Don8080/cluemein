import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

const errorText = (err) => err.response?.data?.error || 'Something went wrong. Please try again.';

// (P0) Login. One screen for logging in and creating an account.
//
// The email and password are read from the fields when a button is clicked,
// not from React state: browsers' password autofill (notably Firefox) can
// fill the fields without telling the page.
export const LoginPopup = ({ onClose, onLoggedIn, onPending, onChangePassword, notice }) => {
  const [keep, setKeep] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [message, setMessage] = React.useState(notice || null);
  const [busy, setBusy] = React.useState(false);
  const emailRef = React.useRef(null);
  const passwordRef = React.useRef(null);

  const values = () => ({
    email: emailRef.current.value.trim(),
    password: passwordRef.current.value,
  });

  // Runs `fn` with the current field values after checking the ones it needs.
  const run = (needs, fn) => async (e) => {
    e?.preventDefault();
    setError(null);
    setMessage(null);
    const v = values();
    if (needs.includes('email') && !v.email) return setError('Enter your email address.');
    if (needs.includes('password') && !v.password) return setError('Enter your password.');
    setBusy(true);
    try {
      await fn(v);
    } catch (err) {
      setError(errorText(err));
      if (err.response?.data?.pending) onPending(err.response.data.pending);
    } finally {
      setBusy(false);
    }
  };

  const login = run(['email', 'password'], async ({ email, password }) => {
    const { data } = await axios.post('/api/login', { email, password, keep });
    onLoggedIn(data.user);
  });

  const createAccount = run(['email', 'password'], async ({ email, password }) => {
    const { data } = await axios.post('/api/register', { email, password, keep });
    onPending(data.pending);
  });

  const forgotPassword = run(['email'], async ({ email }) => {
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
          <input ref={emailRef} type="email" name="email" autoFocus autoComplete="username" />
        </label>
        <label>
          Password
          <span className="password-field">
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
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

        <div className="button-row login-row">
          <button type="submit" className="login-button" disabled={busy}>
            Login
          </button>
        </div>
        <div className="button-row secondary">
          <button type="button" disabled={busy} onClick={createAccount}>
            Create Account
          </button>
          <button type="button" disabled={busy} onClick={forgotPassword}>
            Forgot Password
          </button>
          <button type="button" disabled={busy} onClick={() => onChangePassword(values().email)}>
            Change Password
          </button>
        </div>
        <div className="button-row close-row">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Popup>
  );
};
