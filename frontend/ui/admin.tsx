import * as React from 'react';
import axios from 'axios';

// Admin page (admins only; anyone else is sent to Start). Four tabs; only
// Database is built so far.
const TABS = [
  ['database', 'Database'],
  ['rulesets', 'Ruleset Stats'],
  ['accounts', 'Account Stats'],
  ['vocabulary', 'Vocabulary Stats'],
];

const errorText = (err) => err.response?.data?.error || 'Something went wrong. Please try again.';

const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export const Admin = () => {
  const [tab, setTab] = React.useState('database');
  return (
    <div id="admin-screen">
      <h2 className="screen-heading">Admin</h2>
      <div className="admin-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={'admin-tab' + (tab === id ? ' active' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="admin-panel">
        {tab === 'database' ? <DatabaseTab /> : <p className="hint">Coming soon.</p>}
      </div>
      <p>
        <a href="/">Back to Start</a>
      </p>
    </div>
  );
};

const DatabaseTab = () => {
  const [info, setInfo] = React.useState(null);
  const [busy, setBusy] = React.useState(null); // which action is running
  const [message, setMessage] = React.useState(null);
  const [error, setError] = React.useState(null);
  const fileInput = React.useRef(null);

  React.useEffect(() => {
    axios.get('/api/admin/db-info').then(({ data }) => setInfo(data)).catch((err) => setError(errorText(err)));
  }, []);

  const start = (what) => {
    setBusy(what);
    setMessage(null);
    setError(null);
  };

  const condense = async () => {
    start('vacuum');
    try {
      const { data } = await axios.post('/api/admin/vacuum');
      setInfo(data.info);
      setMessage(`Condensed: ${kb(data.before)} → ${kb(data.after)}.`);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  };

  // The browser downloads the file itself (keeps large files out of memory).
  const backup = () => {
    setMessage('Your backup is downloading. Keep it somewhere safe.');
    setError(null);
    window.location.href = '/api/admin/backup';
  };

  const restore = async (file) => {
    if (!file) return;
    const ok = window.confirm(
      `Restore the database from "${file.name}"?\n\n` +
        'This replaces ALL accounts, games and history with the backup. Running sessions are reloaded from it. ' +
        'The current database is saved first as a safety copy.'
    );
    if (!ok) return;
    start('restore');
    try {
      const { data } = await axios.post('/api/admin/restore', file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
      });
      setInfo(data.info);
      setMessage(`Restored from "${file.name}". The previous database was saved as ${data.safety_copy}.`);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  };

  return (
    <div className="admin-database">
      {info && (
        <table className="admin-info">
          <tbody>
            <tr>
              <th>Size</th>
              <td>
                {kb(info.bytes)} ({kb(info.unused_bytes)} unused)
              </td>
            </tr>
            <tr>
              <th>Accounts</th>
              <td>{info.counts.accounts}</td>
            </tr>
            <tr>
              <th>Games</th>
              <td>{info.counts.games}</td>
            </tr>
            <tr>
              <th>Player history rows</th>
              <td>{info.counts.player_history}</td>
            </tr>
            <tr>
              <th>Word pairs</th>
              <td>{info.counts.word_pairs}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="admin-actions">
        <div>
          <button type="button" disabled={!!busy} onClick={condense}>
            {busy === 'vacuum' ? 'Condensing…' : 'Condense (Vacuum)'}
          </button>
          <span className="hint">Reclaims unused space in the database file.</span>
        </div>
        <div>
          <button type="button" disabled={!!busy} onClick={backup}>
            Backup
          </button>
          <span className="hint">Downloads a complete copy of the database.</span>
        </div>
        <div>
          <button type="button" className="danger" disabled={!!busy} onClick={() => fileInput.current.click()}>
            {busy === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
          <span className="hint">Replaces the whole database with a backup file.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".db,application/octet-stream"
            hidden
            onChange={(e) => {
              restore(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {message && <div className="form-message">{message}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
};
