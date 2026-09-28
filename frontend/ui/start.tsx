import * as React from 'react';
import axios from 'axios';
import { LoginPopup } from '~/ui/login_popup';
import { ChangePassword } from '~/ui/change_password';
import { getLastRuleset, setLastRuleset } from '~/ui/prefs';
import { gameLabel } from '~/ui/ruleset_form';

const MESSAGES = {
  verified: 'Your email is verified and you are logged in.',
  'link-expired': 'That link has expired or was already used.',
};

// "Previous session ended mm/dd/yy hh:mm" from ?ended=<epoch ms>.
function endedNotice(ms) {
  const d = ms && new Date(Number(ms));
  if (!d || isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `Previous session ended ${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// (A1) Start. Shows who is logged in, the game (RuleSet) picker and the
// main buttons.
export const Start = ({ account, setAccount, openLogin }) => {
  const [games, setGames] = React.useState(null); // [{ id, name, video_url }]
  const [gameID, setGameID] = React.useState(null);
  const params = new URLSearchParams(window.location.search);
  const [notice, setNotice] = React.useState(
    MESSAGES[params.get('message')] || endedNotice(params.get('ended')) || null
  );
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

  // Load this player's games once logged in; default to the last one used.
  React.useEffect(() => {
    if (!user) {
      setGames(null);
      return;
    }
    axios.get('/api/rulesets').then(({ data }) => {
      setGames(data);
      const last = getLastRuleset();
      setGameID(data.some((g) => g.id === last) ? last : data[0]?.id ?? null);
    });
  }, [user?.id]);

  const chosen = games?.find((g) => g.id === gameID);
  const chooseGame = (id) => {
    setGameID(id);
    setLastRuleset(id);
  };

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
            Login
          </button>
        </span>
        {pendingNote && <span className="account-note">{pendingNote}</span>}
      </div>
    );
  } else {
    accountArea = (
      <div className="account">
        <button onClick={() => setPopup({ kind: 'login' })}>Login</button>
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
      <h2 className="screen-heading">Start</h2>
      {accountArea}
      {notice && <div className="form-message">{notice}</div>}

      <div className="start-row">
        <label>
          Choose Game:{' '}
          {games && games.length ? (
            <select value={gameID ?? ''} onChange={(e) => chooseGame(Number(e.target.value))}>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {gameLabel(g)}
                </option>
              ))}
            </select>
          ) : (
            <select disabled>
              <option>No Games Available Yet</option>
            </select>
          )}
        </label>
      </div>
      <div className="start-row">
        <button disabled={!chosen} onClick={() => {
            setLastRuleset(chosen.id);
            window.location.href = '/play';
          }}>
          Join Session
        </button>
        <button
          disabled={!chosen?.video_url}
          title={chosen && !chosen.video_url ? 'This game has no Video Chat URL' : undefined}
          onClick={() => window.open(chosen.video_url, '_blank', 'noopener')}
        >
          Join Video Session
        </button>
      </div>
      <div className="start-row">
        <button disabled={!user} onClick={() => (window.location.href = '/create')}>
          Create Game
        </button>
        <button disabled={!chosen} onClick={() => {
            setLastRuleset(chosen.id);
            window.location.href = '/modify';
          }}>
          Modify Game
        </button>
      </div>

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
