# 16. What a page shows before its script

On 19 November 2026 the first open of a production link on Marco's phone gave a page with nothing on it, until he reloaded. Once the app's script runs, the page always shows the header and "Loading". So the script did not run. This note says what a browser does between getting a page and running its script, and what the page can do on its own in that time (ADR 0028).

## From the page to the first picture

1. **The page arrives.** One HTML file, `index.html`. The browser reads it from the top.
2. **The head asks for more files.** The stylesheet and the app's script, both under `/assets/`. The browser starts fetching them at once, side by side.
3. **The browser builds the page's tree.** Every tag in the body becomes an element, in order.
4. **The first picture.** The browser draws the tree on the screen. It waits for the stylesheet first, see below.
5. **The app's script runs.** It is a module, so it runs once the whole tree is built. It draws the app into `#app`.
6. **`load`.** When every file the page asked for has arrived or failed, the window says `load`.

Until step 5, what is on the screen is only what `index.html` holds. Before ADR 0028 that was an empty `<div id="app">`. Now it is the same picture as the app's own loading screen: the app's name where the header draws it, and "Loading" under it. A second line waits fifteen seconds before it shows.

## Why a stylesheet holds up the first picture and a module script does not

A browser draws nothing until the stylesheets in the head have arrived or failed. Drawing a page unstyled and then redrawing it would make it jump, so it waits. That is why a stalled stylesheet can still leave the page empty: the page's own first screen is styled by that same stylesheet, and the Content Security Policy forbids styles written inside the page.

A module script does not hold up the picture. The browser fetches it while it builds the tree and draws, and runs it only at the end. So when the script is slow or missing, the page is drawn anyway, with what `index.html` holds.

## What `async` means for a script

A plain `<script src>` stops the browser where it stands: fetch, run, then go on reading the page. `async` says: fetch it on the side, run it whenever it has arrived, and do not wait for it. The page's second script, `/boot.js`, is `async`, so it never holds up anything. It does not need to run early: it only sets itself to look at `load`.

## What `load` is, and why it comes even when a file failed

`load` means "every file this page asked for is settled". A file that failed is settled too. So `load` comes when the app's script arrived and ran, and also when it was refused or answered with an error. It does not come while a file is still on its way: a script that stalls holds `load` back.

`boot.js` uses that. At `load` it looks inside `#app`:

- the page's own first screen is gone: the app started and took its place. Nothing to do.
- it is still there: the app's script failed. Load the page once more, and leave a mark in the tab's session storage (learning note 14) so it happens once only. The app removes the mark when it starts.

A reload keeps the whole address, what follows `#` included, so a link's value is not lost (ADR 0018).

## Why a page that answers 200 for a missing script still breaks

Every address of the site that is not a file answers with `index.html` and a 200 (`apps/web/public/_redirects`). That is what lets any link open the app. It also applies under `/assets/`: when the page asks for a script that is not there, for instance a file of an older deploy, it gets the page itself, as HTML, with a 200.

A browser checks what kind of file it got before it runs a module script. HTML is not a script, so it refuses it. Chrome's console says so ("Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html""); the page does not. Nothing else happens. To the person it is a blank page.

## How to check it yourself

On a laptop, in Chrome, open a staging link in a new tab with the developer tools open. In Network, find the request for `/assets/index-....js`, right-click it and choose "Block request URL". Reload. You see "World Builder" at the top and "Loading" under it, the page loads once more by itself (two requests for the page in Network), and after fifteen seconds the line from `copy.md` shows under "Loading". Unblock the request when done, and close the tab, so its mark goes with it.

## What it does not do

- A stylesheet that stalls: nothing is drawn until it arrives.
- A script that stalls without failing: no `load`, so no reload. The line after fifteen seconds says what to do. Fifteen and not less, and words that say "if it stays like this": the app's script is about 400 kB before compression, and on a weak line it can take that long to arrive while nothing is wrong. A reload after a fixed time was refused, since on a slow line it would throw away a download that was about to finish.
- A browser that draws nothing at all: nothing in the page can help.
