// Bundles the React front end into frontend/dist. Run with `npm run build`,
// or `npm run watch` to rebuild on every change.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const src = path.join(__dirname, 'frontend');
const dist = path.join(src, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(dist, { recursive: true });
for (const css of ['game.css', 'lobby.css', 'start.css', 'play.css']) {
  fs.copyFileSync(path.join(src, css), path.join(dist, css));
}
fs.cpSync(path.join(src, 'sounds'), path.join(dist, 'sounds'), { recursive: true });

const options = {
  entryPoints: [path.join(src, 'app.tsx')],
  bundle: true,
  outfile: path.join(dist, 'app.js'),
  minify: !watch,
  sourcemap: watch,
  target: 'es2019',
  alias: { '~': src },
  loader: { '.tsx': 'tsx' },
  jsx: 'transform',
  logLevel: 'info',
};

if (watch) {
  esbuild.context(options).then((ctx) => ctx.watch());
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
