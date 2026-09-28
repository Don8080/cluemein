import * as React from 'react';
import axios from 'axios';
import * as ReactDOM from 'react-dom';
import { Start } from '~/ui/start';
import { CreateGame } from '~/ui/create_game';
import { ModifyGame } from '~/ui/modify_game';
import { PlayScreen } from '~/ui/play';
import { getLastRuleset, setLastRuleset } from '~/ui/prefs';

export const App = () => {
  // { user } when logged in, { pending } while waiting for email
  // verification, {} when logged out; null until the server answers.
  const [account, setAccount] = React.useState(null);

  React.useEffect(() => {
    axios
      .get('/api/me')
      .then(({ data }) => setAccount(data))
      .catch(() => setAccount({}));
  }, []);

  // The game (RuleSet) id isn't in the address: /play and /modify use the
  // "last game" cookie. An old address with a number sets the cookie and
  // is tidied up.
  let path = window.location.pathname;
  const old = path.match(/^\/(play|modify)\/(\d+)$/);
  if (old) {
    setLastRuleset(Number(old[2]));
    path = '/' + old[1];
    window.history.replaceState(null, '', path + window.location.search);
  }
  const gameID = getLastRuleset();

  let pane;
  if (account === null) {
    pane = <p className="loading">Loading&hellip;</p>;
  } else if (!account.user) {
    // Login is required for everything; a deep link lands on Start first.
    pane = <Start account={account} setAccount={setAccount} openLogin={path !== '/'} />;
  } else if (path === '/play' && gameID) {
    pane = <PlayScreen rulesetID={gameID} />;
  } else if (path === '/create') {
    pane = <CreateGame user={account.user} />;
  } else if (path === '/modify' && gameID) {
    pane = <ModifyGame rulesetID={gameID} />;
  } else {
    pane = <Start account={account} setAccount={setAccount} openLogin={false} />;
  }

  return (
    <div id="application">
      <div id="topbar">
        <h1>
          <a href="/">Clue Me In</a>
        </h1>
      </div>
      {pane}
    </div>
  );
};

document.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(<App />, document.getElementById('app'));
});
