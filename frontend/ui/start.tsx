import * as React from 'react';
import axios from 'axios';
import { LoginPopup } from '~/ui/login_popup';
import { ChangePassword } from '~/ui/change_password';

const MESSAGES = {
  verified: 'Your email is verified and you are logged in.',
  'link-expired': 'That link has expired or was already used.',
};

// (A1) Start. Shows who is logged in, the game (RuleSet) picker and the
// main buttons. RuleSets arrive in the next phase, so the picker is empty.
export const Start = ({ account, setAccount, openLogin }) => {
  const params = new URLSearchParams(window.location.search);
  const [notice, setNotice] = React.useState(MESSAGES[params.get('message')] || null);
  // null | { kind: 'login', notice? } | { kind: 'change', email } | { kind: 'reset', token }
  const [popup, setPopup] = React.useState(
    params.get('reset')
      ? { kind: 'reset', token: params.get('reset') }
      : openLogin
      ? { kind: 'login' }
      : null
  );
  const [pendingNote, setPendingNote] = React.useState(null);

  React.useEffect(() => {
    // Drop ?message= / ?reset= so a refresh doesn't repeat them.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const user = account.user;

  const refreshAfterVerification = async () => {
    const { data } = await axios.get('/api/me');
    setAccount(data);
    setPendingNote(data.user ? null : 'Not verified yet. Open the link in the email we sent.');
  };

  const resend = async () => {
    try {
      await axios.post('/api/resend-verification');
      setPendingNote('Sent again. Check your inbox and Spam folder.');
    } catch (err) {
      setPendingNote(err.response?.data?.error || 'Could not send the email.');
    }
  };

  const logout = async () => {
    await axios.post('/api/logout');
    setAccount({});
  };

  let accountArea;
  if (user) {
    accountArea = (
      <div className="account">
        <span className="account-email">{user.email}</span>
        <button className="link-button" onClick={logout}>
          Log out
        </button>
      </div>
    );
  } else if (account.pending) {
    accountArea = (
      <div className="account">
        <button className="link-button strong" onClick={refreshAfterVerification}>
          Refresh after Verification
        </button>
        <span className="account-note">
          We emailed a link to {account.pending.email}.{' '}
          <button className="link-button" onClick={resend}>
            Resend email
          </button>
          {' · '}
          <button className="link-button" onClick={() => setPopup({ kind: 'login' })}>
            Logon
          </button>
        </span>
        {pendingNote && <span className="account-note">{pendingNote}</span>}
      </div>
    );
  } else {
    accountArea = (
      <div className="account">
        <button onClick={() => setPopup({ kind: 'login' })}>Logon</button>
      </div>
    );
  }

  const loggedInUser = (u) => {
    setAccount({ user: u });
    setPopup(null);
    setNotice(null);
  };

  return (
    <div id="start">
      <h2>Start</h2>
      {accountArea}
      {notice && <div className="form-message">{notice}</div>}

      <div className="start-row">
        <label>
          Choose Game:{' '}
          <select disabled>
            <option>No Games Available Yet</option>
          </select>
        </label>
      </div>
      <div className="start-row">
        <button disabled title="Available once games (RuleSets) exist">
          Play
        </button>
        <button disabled title="Uses the chosen game's video link">
          Join Video Session
        </button>
      </div>
      <div className="start-row">
        <button disabled title="Coming in the next phase">
          Create Game
        </button>
        <button disabled title="Available once a game is chosen">
          Modify Game
        </button>
      </div>

      {user && (
        <p className="temporary">
          Until games and sessions are built, you can still try a board in the{' '}
          <a href="/quick">quick game lobby</a>.
        </p>
      )}

      {popup?.kind === 'login' && (
        <LoginPopup
          notice={popup.notice}
          onClose={() => setPopup(null)}
          onLoggedIn={loggedInUser}
          onPending={(pending) => {
            setAccount({ pending });
            setPopup(null);
          }}
          onChangePassword={(email) => setPopup({ kind: 'change', email })}
        />
      )}
      {popup?.kind === 'change' && (
        <ChangePassword
          email={popup.email}
          onSaved={() => setPopup({ kind: 'login', notice: 'Password changed. You can log in now.' })}
          onCancel={() => setPopup({ kind: 'login' })}
        />
      )}
      {popup?.kind === 'reset' && (
        <ChangePassword
          resetToken={popup.token}
          onSaved={loggedInUser}
          onCancel={() => {
            // Opened from the email: shut the tab if the browser allows it.
            window.close();
            setPopup(null);
          }}
        />
      )}
    </div>
  );
};
