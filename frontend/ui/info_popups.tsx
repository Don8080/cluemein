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
      <p>
        Assuming you find the game listed, click <u>Join Session</u>. Then:
      </p>
      <ul>
        <li>
          If there is a session in progress, you will be added as a floater, someone who helps both teams decide what
          words to guess in response to a clue.
        </li>
        <li>
          If there is no session in progress, or there are not enough players who have joined the session, you will be
          shown the Waiting Room, where you can see all the game’s players, and you can see who has joined the session
          and who has not joined yet. When a quorum is reached, anyone can click <u>Begin Game</u> to produce the first
          board.
        </li>
      </ul>
      <p>
        If you have NOT been invited to join an existing group of players, click <u>Create Game</u> to define a game,
        add players’ names and email addresses, and make choices about the vocabulary to use, and the default mode of
        play.
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
          they like. Clicking <u>Next Game</u> will not change team members, but the Cluer roles are selected randomly
          taking care to keep roles fairly distributed (see below).
        </li>
        <li>
          <b>Fixed Roles:</b> In the first game, teams and roles are randomly assigned. Players can make any changes
          they like. Clicking <u>Next Game</u> will not change team members or roles. The assigned Cluers remain Cluers
          until manually changed.
        </li>
        <li>
          <b>Random:</b> Roles and team membership are assigned randomly at every game, taking care to keep roles fairly
          distributed.
        </li>
      </ol>
      <p>
        By clicking a player's name on the game board, players can make manual changes to player roles at any time. In all cases, changing a Cluer forces a new board.
      </p>

      <h3>Role Assignments</h3>
      <p>
        Roles are chosen to best meet these goals, in priority order; chance only decides between equally good choices.
        The computer also looks a few games ahead, so that a choice that is fair now does not make the next games
        unfair.
      </p>
      <p>
        <b>Primary Goal (highest priority):</b> The main goal is to distribute the Cluer role and the Floater role (if
        it exists) as evenly as possible, with equal priority. So, assuming the same players throughout a session,
        Player A may perform the Cluer role one more time than Player B, but not 2 more times, and the same holds for
        the Floater role. A player who joins late is compared with the others only on the games played since they
        joined, and starts with as many Floater turns as whoever has floated least.
      </p>
      <p>
        <b>Secondary Goal:</b> Pairs of Cluers (eg Player A vs Player D) are repeated as evenly as the Primary Goal
        allows: usually no more than one time more than other pairs, occasionally two.
      </p>
      <p>
        <b>Tertiary Goal (lowest priority):</b> Cluer A should not be paired with Guesser B more than 2 times in excess
        of any other Cluer-Guesser pair.
      </p>
      <p>
        With <b>Fixed Teams</b>, only the Cluers change: one is chosen from each team by the Primary and Secondary
        Goals, as far as the teams allow.
      </p>
      <p>
        <b>Floaters:</b> There is a Floater when the players can not be split into two equal teams, and there may be
        more when the game's Minimum Team Size requires them (Floaters count toward both teams' size).
      </p>
      <p>
        <b>Changes during a game:</b> If a Cluer leaves the session, one of their team's guessers takes over, chosen by
        the same goals, and a new board is dealt. If the team is then too small, everyone is reassigned. A guesser who
        takes over as Cluer by choice counts as a Cluer turn.
      </p>

      <h3>Small Groups</h3>
      <p>
        With 2 players, one player is the Single Cluer, giving clues for both teams, and the other is a Floater who
        guesses for both teams.
      </p>
      <p>
        With 3 players, there are normally two Cluers and one Floater. Any player can choose <u>Single Cluer</u> in a
        player's popup: that player then gives clues for both teams, and the other two guess, one for each team (or both
        can float). Clicking <u>Two Cluers</u> switches back.
      </p>

      <h3>Next Board vs Next Game</h3>
      <p>
        If Cluers agree, for any reason, to reject a particular set of 25 words, they can click <u>Next Board</u> to
        retrieve another random set of words without changing any team assignments or roles. Clicking <u>Next Game</u>{' '}
        will produce both a new board and new assignments (depending on the Team Assignment mode). With Fixed Roles,
        Next Game keeps everyone's roles, so there is no separate <u>Next Board</u> button.
      </p>
    </div>
    <CloseRow onClose={onClose} />
  </Popup>
);
