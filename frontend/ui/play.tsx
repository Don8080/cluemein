import * as React from 'react';
import axios from 'axios';
import { WaitingRoom } from '~/ui/waiting_room';
import { Board } from '~/ui/board';

// A game's live session: the Waiting Room (A2) until play begins, then the
// board (C1). Keeps a long-poll open, which also tells the server this
// player is still here.
export const PlayScreen = ({ rulesetID }) => {
  const [view, setView] = React.useState(null);
  const [error, setError] = React.useState(null);
  const version = React.useRef(null);
  const tab = React.useMemo(() => Math.random().toString(36).slice(2), []);
  const base = `/api/play/${rulesetID}`;

  const apply = (data) => {
    // An older long-poll answer can arrive after a newer action result.
    if (data.version !== undefined && version.current !== null && data.version < version.current) return;
    if (data.version !== undefined) version.current = data.version;
    setView(data);
  };

  React.useEffect(() => {
    let stopped = false;
    const poll = async () => {
      while (!stopped) {
        try {
          const { data } = await axios.post(`${base}/state`, { tab, version: version.current });
          if (stopped) return;
          apply(data);
          if (data.ended || data.logged_off) return;
        } catch (err) {
          if (stopped) return;
          if (err.response?.status === 404 || err.response?.status === 401) {
            setError(err.response.data?.error || 'Not available.');
            return;
          }
          await new Promise((r) => setTimeout(r, 3000)); // network blip: retry
        }
      }
    };
    axios
      .post(`${base}/join`, { tab })
      .then(({ data }) => {
        apply(data);
        poll();
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not join the game.'));

    const bye = () => navigator.sendBeacon(`${base}/bye`, tab);
    window.addEventListener('pagehide', bye);
    return () => {
      stopped = true;
      window.removeEventListener('pagehide', bye);
    };
  }, []);

  // Runs a player action and shows its result right away.
  const act = (path, body = {}) =>
    axios
      .post(`${base}/${path}`, body)
      .then(({ data }) => {
        apply(data);
        return true;
      })
      .catch((err) => {
        alert(err.response?.data?.error || 'Something went wrong.');
        return false;
      });

  // A finished session goes straight back to Start, which shows when it ended.
  React.useEffect(() => {
    if (view?.ended) window.location.href = view.ended_at ? `/?ended=${view.ended_at}` : '/';
  }, [view?.ended]);

  if (view?.ended) return <p className="loading">Session ended&hellip;</p>;

  if (view?.logged_off) {
    return (
      <div id="start">
        <p className="form-error">You have left this session.</p>
        <p>
          <a href="/">Back to Start</a> (click Join Session there to rejoin)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div id="start">
        <p className="form-error">{error}</p>
        <p>
          <a href="/">Back to Start</a>
        </p>
      </div>
    );
  }
  if (!view) return <p className="loading">Joining&hellip;</p>;
  if (view.status === 'waiting' || !view.board) return <WaitingRoom view={view} act={act} />;
  return <Board view={view} act={act} />;
};
