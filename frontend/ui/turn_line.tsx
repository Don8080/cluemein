import * as React from 'react';

// One turn as shown in Session History and the board's guess lists:
//   1) Sorcerer{2} TAPESTRY DRESSING GARDEN
// The turn number and clue are in the team's color; the clue shows "******"
// when none was posted. Each guess is a chip in the color the word turned out
// to be (a neutral word looks like a revealed one on the board: black on
// beige); the other team's word is outlined in the guessing team's color.

export const GuessChip = ({ word, color, team }) => {
  const kind = color === 'neutral' ? 'neutral' : color === 'black' ? 'assassin' : color;
  const wrongTeam = (color === 'red' || color === 'blue') && color !== team;
  return <span className={`history-guess ${kind}${wrongTeam ? ` other-team by-${team}` : ''}`}>{word}</span>;
};

// With `onAdd`, a missing clue's ****** is a button that opens a dialog to
// enter it.
export const ClueChip = ({ clue, onAdd = null }) =>
  clue ? (
    <span className={`clue-chip ${clue.team}`}>
      {clue.word}
      {`{${clue.number}}`}
    </span>
  ) : onAdd ? (
    <button type="button" className="clue-chip missing add" title="Enter the clue for this turn" onClick={onAdd}>
      ******
    </button>
  ) : (
    <span className="clue-chip missing">******</span>
  );

// turn: { team, number, clue, guesses: [{ word, color }] }
export const TurnLine = ({ turn, onAddClue = null }) => (
  <div className="history-turn">
    {turn.number && <span className={`turn-number ${turn.team}`}>{turn.number})</span>}
    <ClueChip clue={turn.clue} onAdd={onAddClue && turn.round !== undefined && turn.guesses.length ? () => onAddClue(turn) : null} />
    {turn.guesses.map((g, j) => (
      <GuessChip key={j} word={g.word} color={g.color} team={turn.team} />
    ))}
  </div>
);

// Turns for one team from a board's guesses and posted clues (by round).
export function teamTurns(guesses, clues, team) {
  const byRound = new Map();
  guesses
    .filter((g) => g.team === team)
    .forEach((g, i) => {
      const key = g.round ?? `x${i}`; // older records have no round
      if (!byRound.has(key)) byRound.set(key, { team, round: g.round, number: g.round !== undefined ? g.round + 1 : null, guesses: [] });
      byRound.get(key).guesses.push(g);
    });
  for (const [round, c] of Object.entries(clues || {})) {
    if (c.team === team && !byRound.has(Number(round))) {
      byRound.set(Number(round), { team, round: Number(round), number: Number(round) + 1, guesses: [] });
    }
  }
  return [...byRound.values()]
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
    .map((t) => ({ ...t, clue: t.round !== undefined ? (clues || {})[t.round] || null : null }));
}

// The team's unguessed words when a turn began: those left now plus the
// team's words revealed in that turn or later. guesses: [{ color, round }].
export function remainingAtTurnStart(remainingNow, guesses, team, round) {
  return remainingNow + guesses.filter((g) => g.color === team && (g.round ?? -1) >= round).length;
}
