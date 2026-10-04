// Clue Me In server. The game rules come from HorsePaste (ported to game.js);
// accounts, games (RuleSets) and live sessions are ours.
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '.env') });
const path = require('path');
const fs = require('fs');
const express = require('express');
const { initDb, deleteExpired } = require('./db');
const { setupAuth } = require('./auth');
const { setupRulesets } = require('./rulesets');
const { setupSessions } = require('./session');

const PORT = process.env.PORT || 3003;

const db = initDb();

// Retention rules (db.js): at startup and then daily.
deleteExpired(db);
setInterval(() => deleteExpired(db), 24 * 60 * 60 * 1000).unref();

// A fingerprint of the built front end, added to each file's address so
// browsers (and Railway's edge cache) fetch new copies after every deploy.
const DIST = path.join(__dirname, 'frontend', 'dist');
const VERSION = require('crypto')
  .createHash('sha1')
  .update(['app.js', 'game.css', 'lobby.css', 'start.css', 'play.css'].map((f) => fs.readFileSync(path.join(DIST, f))).join(''))
  .digest('hex')
  .slice(0, 10);

const INDEX_HTML = `<!DOCTYPE html>
<html>
  <head>
    <title>Clue Me In</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="/static/app.js?v=${VERSION}" type="text/javascript"></script>
    <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet">
    <link rel="stylesheet" type="text/css" href="/static/game.css?v=${VERSION}" />
    <link rel="stylesheet" type="text/css" href="/static/lobby.css?v=${VERSION}" />
    <link rel="stylesheet" type="text/css" href="/static/start.css?v=${VERSION}" />
    <link rel="stylesheet" type="text/css" href="/static/play.css?v=${VERSION}" />
    <link rel="shortcut icon" type="image/png" id="favicon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAA8SURBVHgB7dHBDQAgCAPA1oVkBWdzPR84kW4AD0LCg36bXJqUcLL2eVY/EEwDFQBeEfPnqUpkLmigAvABK38Grs5TfaMAAAAASUVORK5CYII="/>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/static', express.static(path.join(__dirname, 'frontend', 'dist')));
app.set('trust proxy', 1); // Railway terminates HTTPS in front of the app

const { requireAuth } = setupAuth(app, db);
setupRulesets(app, db, requireAuth);
setupSessions(app, db, requireAuth);

// Standard word lists, in picker order, with word counts.
app.get('/api/wordlists', requireAuth, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT l.id, l.name, l.language, l.picker_row, COUNT(w.id) AS count
           FROM wordlists l LEFT JOIN standard_words w ON w.wordlist_id = l.id
          GROUP BY l.id ORDER BY l.picker_row, l.sort_order`
      )
      .all()
  );
});

// One standard list's words (Examine Word Lists in B1/B2).
app.get('/api/wordlists/:id/words', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT word FROM standard_words WHERE wordlist_id = ? ORDER BY word').all(Number(req.params.id));
  res.json(rows.map((r) => r.word));
});

// The single page; the front end picks the screen from the path
// ("/", "/create", "/modify/:id", "/play/:id").
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.set('Cache-Control', 'no-cache').type('html').send(INDEX_HTML);
});

// An upload far over its size limit (e.g. a huge sound file) gets a short
// message instead of a stack trace.
app.use((err, req, res, next) => {
  if (err.type !== 'entity.too.large') return next(err);
  res.status(413).json({ error: req.path.includes('/sounds/') ? 'That file is larger than 1 MB.' : 'That is too large to send.' });
});

app.listen(PORT, () => console.log(`Clue Me In listening on http://localhost:${PORT}`));
