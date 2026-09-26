# ClueMeIn

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

## Layout

- `server.js`: Express server and the game API (`/game-state`, `/guess`, `/end-turn`, `/next-game`)
- `game.js`: game rules (board generation, turns, winning), ported from HorsePaste's `game.go`
- `auth.js`: accounts: login sessions, sign-up with email verification, forgot/change password
- `mailer.js`: sends email through Amazon SES
- `rulesets.js`: games (RuleSets): create, copy, modify, vocabulary edits and export
- `db.js`: SQLite schema (Node's built-in `node:sqlite`); seeds the standard word lists on first run
- `build.js`: bundles `frontend/` into `frontend/dist` with esbuild
- `frontend/`: React UI
- `assets/`: seed data for the word lists (`words.json`, `roebuck.txt`) and game-ID words

The database file defaults to `cluemein.db` in the project folder; set `DB_PATH` to put it elsewhere (on Railway, a volume).
Once a list has been seeded, the database is its source of truth; the seed files are only read for lists that don't exist yet.
