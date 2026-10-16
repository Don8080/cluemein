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
        {tab === 'database' ? <DatabaseTab /> : tab === 'rulesets' ? <RulesetStatsTab /> : <p className="hint">Coming soon.</p>}
      </div>
      <p>
        <a href="/">Back to Start</a>
      </p>
    </div>
  );
};

// Ruleset Stats: counts of games (Rulesets) and their sessions.
const RulesetStatsTab = () => {
  const [s, setS] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    axios.get('/api/admin/ruleset-stats').then(({ data }) => setS(data)).catch((err) => setError(errorText(err)));
  }, []);
  if (error) return <div className="form-error">{error}</div>;
  if (!s) return <p className="hint">Loading…</p>;

  const none = <span className="hint">no sessions logged yet</span>;
  const rows = [
    ['Total number of Rulesets', <>{s.total}{s.deleted ? <span className="hint"> (plus {s.deleted} deleted)</span> : null}</>],
    ['Timer', `Off ${s.timer.off} · On and enforced ${s.timer.enforced} · On and not enforced ${s.timer.not_enforced}`],
    ['Played in the last 7 days / 30 days / year', `${s.played.days7} / ${s.played.days30} / ${s.played.year}`],
    ['Average number of accounts listed', s.avg_accounts ?? '—'],
    ['Average number of players per session', s.avg_players ?? none],
    ['Largest number of players in a session', s.max_players ? `${s.max_players.players} (${s.max_players.name})` : none],
    ['Average number of sessions per week (Rulesets played in the last 7 days)', s.avg_sessions_week ?? <span className="hint">none in the last 7 days</span>],
    ['Largest number of sessions this week', s.max_sessions_week ? `${s.max_sessions_week.sessions} (${s.max_sessions_week.name})` : <span className="hint">none in the last 7 days</span>],
    ['Average Vocabulary size', s.avg_vocab ?? '—'],
    ['Largest Vocabulary size', s.max_vocab ? `${s.max_vocab.words} (${s.max_vocab.name})` : '—'],
  ];
  return (
    <div>
      <table className="admin-stats">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td className="stat-number">{i + 1}.</td>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Session figures (5–8) come from the session log, which began on 10/16/26; {s.sessions_logged} session
        {s.sessions_logged === 1 ? '' : 's'} logged so far. "Played" counts each Ruleset's most recent session.
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

  // Fetch the backup here, so the page knows when it is done, then hand it
  // to the browser to save under the server's file name.
  const backup = async () => {
    start('backup');
    try {
      const res = await axios.get('/api/admin/backup', { responseType: 'blob' });
      const name =
        /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || 'cluemein-backup.db';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(`Backup downloaded: ${name} (${kb(res.data.size)}). Keep it somewhere safe.`);
    } catch (err) {
      // An error arrives as a blob too; read its message.
      let text = 'The backup failed.';
      try {
        text = JSON.parse(await err.response.data.text()).error || text;
      } catch {
        // keep the general message
      }
      setError(text);
    }
    setBusy(null);
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
            {busy === 'backup' ? 'Downloading…' : 'Backup'}
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
