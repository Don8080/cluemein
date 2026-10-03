import * as React from 'react';
import axios from 'axios';
import { Popup } from '~/ui/popup';

// Opened by clicking your email on the Start page: add or change your phone
// number (shown to your fellow players in the Waiting Room), or open
// Change Password.
export const AccountPopup = ({ email, onChangePassword, onClose }) => {
  const [phone, setPhone] = React.useState('');
  const [saved, setSaved] = React.useState(null); // the number as last loaded/saved
  const [error, setError] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    axios.get('/api/me').then(({ data }) => {
      setPhone(data.user?.phone || '');
      setSaved(data.user?.phone || '');
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await axios.post('/api/account/phone', { phone });
      setPhone(data.phone);
      setSaved(data.phone);
      setMessage(data.phone ? 'Phone number saved.' : 'Phone number removed.');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  return (
    <Popup title={email} onClose={onClose}>
      <form className="login-form" onSubmit={save}>
        <label>
          Phone Number
          <input type="text" inputMode="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <p className="hint phone-note">Your Phone number will appear in the Waiting Room.</p>
        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-message">{message}</div>}
        <div className="button-row">
          <button type="submit" disabled={busy || saved === null || phone.trim() === saved}>
            Save Phone Number
          </button>
          <button type="button" onClick={onChangePassword}>
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
