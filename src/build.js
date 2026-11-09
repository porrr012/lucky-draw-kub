// Build: compiles app.jsx (JSX -> plain JS) and inlines it with styles.css into one index file.
// Usage: node build.js [output.html]   (default: ../dist/index.html)
//
// Babel is not stored in this folder. Install it anywhere (npm i @babel/core @babel/preset-react), then point
// BABEL_DIR and PRESET_DIR at those installed packages, for example:
//   BABEL_DIR=~/tools/node_modules/@babel/core PRESET_DIR=~/tools/node_modules/@babel/preset-react node build.js
// If the packages are resolvable from this folder, the variables can be left out.
const fs = require('fs'), path = require('path');
const babel = require(process.env.BABEL_DIR || '@babel/core');
const here = __dirname;
const out = process.argv[2] || path.join(here, '..', 'dist', 'index.html');
const css = fs.readFileSync(path.join(here, 'styles.css'), 'utf8');
const src = fs.readFileSync(path.join(here, 'app.jsx'), 'utf8');
const js = babel.transformSync(src, { presets: [[process.env.PRESET_DIR || '@babel/preset-react', { runtime: 'classic' }]], compact: true, comments: false }).code;
const html = fs.readFileSync(path.join(here, 'template.html'), 'utf8')
  .replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes');
