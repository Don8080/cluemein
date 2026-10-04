import * as React from 'react';
import { Popup } from '~/ui/popup';

// The Start page's Information buttons: Getting Started and How to Play.

const CloseRow = ({ onClose }) => (
  <div className="button-row centered">
    <button type="button" onClick={onClose}>
      Close
    </button>
  </div>
);

export const GettingStarted = ({ onClose }) => (
  <Popup title="Getting Started" onClose={onClose} wide>
    <div className="info-text">
      <p>
        If you have been invited to join an existing group of players, once the host has added your email address you
        will see your game listed in the dropdown list of games to choose from. As a newcomer, there will most likely be
        only one entry. If the dropdown list is empty, contact the person who invited you.
      </p>
      <p>Assuming you find the game listed, click Join Session. Then:</p>
      <ul>
        <li>
          If there is a session in progress, you will be added as a floater, someone who helps both teams decide what
          words to guess in response to a clue.
        </li>
        <li>
          If there is no session in progress, or there are not enough players who have joined the session, you will be
          shown the Waiting Room, where you can see all the game’s players, and you can see who has joined the session
          and who has not joined yet. When a quorum is reached, anyone can click Begin Game to produce the first board.
        </li>
      </ul>
      <p>
        If you have NOT been invited to join an existing group of players, click Create Game to start a game, add
        players’ names and email addresses, and make choices about the vocabulary to use, and the default mode of play.
      </p>
    </div>
    <CloseRow onClose={onClose} />
  </Popup>
);

export const HowToPlay = ({ onClose }) => (
  <Popup title="How to Play" onClose={onClose} wide>
    <div className="info-text">
      <p>
        You can use the rules of Codenames to compete Red team vs Blue team in guessing all the team’s words first. The
        computer picks 25 random words and assigns roles using the Team Assignment Mode chosen for your game.
      </p>

      <h3>Team Assignment Mode Options</h3>
      <ol>
        <li>
          <b>Fixed Teams:</b> In the first game, teams and roles are randomly assigned. Players can make any changes
          they like. Next Game will not change team members, but the Cluer roles are selected randomly taking care to
          keep roles fairly distributed (see below).
        </li>
        <li>
          <b>Fixed Roles:</b> In the first game, teams and roles are randomly assigned. Players can make any changes
          they like. Next Game will not change team members or roles. The assigned Cluers remain Cluers until manually
          changed.
        </li>
        <li>
          <b>Random:</b> Roles and team membership are assigned randomly at every game, taking care to keep roles fairly
          distributed.
        </li>
      </ol>
      <p>
        Players can make manual changes to player roles at any time. In all cases, changing a Cluer forces a new board.
      </p>

      <h3>Role Assignments</h3>
      <p>Roles are assigned randomly, under these constraints:</p>
      <p>
        <b>Primary Goal (highest priority):</b> The main goal is to distribute the Cluer role as evenly as possible. So,
        assuming the same players throughout a session, Player A may perform the Cluer role one more time than Player B,
        but not 2 more times. A similar rule is applied to players joining the session late.
      </p>
      <p>
        <b>Secondary Goal:</b> Pairs of Cluers (eg Player A vs Player D) can be repeated one more time than other pairs
        but not two more times.
      </p>
      <p>
        <b>Tertiary Goal (lowest priority):</b> Cluer A should not be paired with Guesser B more than 2 times in excess
        of any other Cluer-Guesser pair.
      </p>

      <h3>Next Board vs Next Game</h3>
      <p>
        If Cluers agree, for any reason, to reject a particular set of 25 words, they can click Next Board to retrieve
        another random set of words without changing any team assignments or roles. Clicking Next Game will produce both
        a new board and new assignments (depending on the Team Assignment mode).
      </p>
    </div>
    <CloseRow onClose={onClose} />
  </Popup>
);
