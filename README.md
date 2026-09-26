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

## Layout

- `server.js`: Express server and the game API (`/game-state`, `/guess`, `/end-turn`, `/next-game`)
- `game.js`: game rules (board generation, turns, winning), ported from HorsePaste's `game.go`
- `build.js`: bundles `frontend/` into `frontend/dist` with esbuild
- `frontend/`: React UI
- `assets/`: word lists
