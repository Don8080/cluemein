# Clue Me In

A Codenames-style word game for our group, based on [HorsePaste](https://github.com/jbowens/horsepaste) by jbowens.
The Go server was replaced with Node; the React front end comes from HorsePaste.

## Running locally

Requires Node 22.5 or later.

```
npm install
npm run build
npm start
```

Then open http://localhost:3003. Use `npm run watch` in a second terminal to rebuild the front end on every change.

Settings come from a `.env` file in this folder (not committed):

| Variable | Purpose |
|---|---|
| `BASE_URL` | Address used in emailed links, e.g. `http://localhost:3003` |
| `SESSION_SECRET` | Signs login cookies |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Amazon SES credentials |
| `FROM_EMAIL` | Sender address; its domain must be verified in SES |
| `DB_PATH` | Optional database location (default `cluemein.db`) |
| `PORT` | Optional; default 3003 |
| `PRESENCE_GRACE_MS` | Optional; how long a silent player still counts as present (default 2 minutes; lower it for testing) |

## Layout

- `server.js`: Express server; serves the single-page front end
- `game.js`: board rules (word dealing, turns, winning), ported from HorsePaste's `game.go`
- `session.js`: live play sessions: Waiting Room, presence (2-minute grace), quorum, boards, turn-locked clicking
- `roles.js`: automatic Cluer/guesser/Floater assignment with the fairness rules
- `auth.js`: accounts: login sessions, sign-up with email verification, forgot/change password
- `mailer.js`: sends email through Amazon SES
- `rulesets.js`: games (RuleSets): create, copy, modify, vocabulary edits and export
- `db.js`: SQLite schema (Node's built-in `node:sqlite`); seeds the standard word lists on first run
- `build.js`: bundles `frontend/` into `frontend/dist` with esbuild
- `frontend/`: React UI
- `assets/`: seed data for the word lists (`words.json`, `roebuck.txt`)

The database file defaults to `cluemein.db` in the project folder; set `DB_PATH` to put it elsewhere (on Railway, a volume).
Once a list has been seeded, the database is its source of truth; the seed files are only read for lists that don't exist yet.
