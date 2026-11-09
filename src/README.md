# Lucky Exchange: source

A pass-the-phone gift swap. The site you deploy lives in `../dist/` and is built from the files here.

| File | What it is |
|---|---|
| `app.jsx` | The whole app (React). The comment at the top explains the game model and screens. |
| `styles.css` | All styling, driven by design tokens at the top. Dark mode is automatic. |
| `template.html` | The page shell. `build.js` fills in the CSS and the compiled JS. |
| `build.js` | Compiles `app.jsx` and writes the single `index.html`. |

## Change something and rebuild

1. Edit `app.jsx` or `styles.css`. Do not edit `../dist/index.html` by hand, because the next build overwrites it.
2. Install Babel once, anywhere outside this folder: `npm i @babel/core @babel/preset-react`.
3. Build, pointing at that install:

   ```
   BABEL_DIR=/path/to/node_modules/@babel/core \
   PRESET_DIR=/path/to/node_modules/@babel/preset-react \
   node build.js
   ```

## What to deploy

Upload the contents of `../dist/`, which holds exactly the three files the site needs: `index.html`, `apple-touch-icon-v2.png` (the home-screen icon) and `_headers` (Netlify cache and security headers). `src/` is for editing and is never published.

The icon is cached for a year. To change it, save the new image under a new name (for example `apple-touch-icon-v3.png`) and update the link in `template.html` and the rule in `dist/_headers`.

## Good to know

- Progress is saved in the browser (`localStorage`, key `luckyExchange.v1`), so a refresh keeps the game.
- React is loaded from a CDN, so the first load needs internet.
- The gift opening takes about 1.8s. Its timings are in `RevealView` in `app.jsx`.
