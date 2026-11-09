# Lucky Exchange

A minimal, mobile-first gift swap (Secret Santa) for a group in one room. One phone gets passed around, and each person privately opens their own gift to see who their gift is from. English interface with Thai hints, and Thai names work too.

**Live site:** https://lucky-draw-kub.netlify.app

## How it works

1. **Add friends.** Type names one at a time, or paste a whole list (one per line, or separated by commas). At least 3 people are needed.
2. **Link couples (optional).** Linked couples are never matched with each other.
3. **Start the game.** Pick who goes first, or tap "Surprise me".
4. **Pass the phone.** Each person sees a private "pass the phone to ..." screen, taps "I am ...", and opens their gift to see who it is from.
5. **Share the result.** At the end, the full "who gives to whom" list can be shared or copied as text.

Everyone is placed in one shuffled loop (each person gives to the next, and the last gives to the first), so the phone naturally follows the loop and nobody gets themselves.

## Good to know

- Everything runs in the browser. There is no server and no account, and names are never sent anywhere.
- Progress is saved on the device (`localStorage`), so a refresh does not lose the game.
- React and the fonts load from a CDN, so the first load needs an internet connection.
- Light and dark mode follow the phone's setting.

## Project layout

| Folder | What it is |
|---|---|
| `src/` | The source: React (`app.jsx`), styles (`styles.css`), the page shell and the build script. See [`src/README.md`](src/README.md) for how to rebuild. |
| `dist/` | The built site, ready to deploy: `index.html`, the home-screen icon and Netlify `_headers`. |

To try it locally, open `dist/index.html` in a browser.

## Deploying

The site is static. On Netlify, connect this repository, set the publish directory to `dist`, and leave the build command empty (`dist/` is already built).
