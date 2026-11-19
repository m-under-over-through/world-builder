# 14. What a tab remembers

After "Delete everything", the app goes back to the welcome with "I understand" in the same tab (ADR 0026). To do that it has to carry two small things across a page load that is meant to forget everything. This note says where a web page can keep things, how long each place lasts, and which one the app uses for what.

## Four places, four lifetimes

A page in a browser has four places to keep something.

- **Memory.** The variables of the running page. It lasts until the page is reloaded or closed. A reload starts with none of it.
- **Session storage.** A small drawer that belongs to one tab. It survives a reload of that tab. It goes when the tab is closed. Another tab on the same site has a drawer of its own and cannot see this one.
- **Local storage.** A small drawer that belongs to the site, on this device. Every tab of the site sees it, and it stays until someone clears it.
- **IndexedDB.** A database that belongs to the site, on this device. Like local storage it stays; unlike it, it holds real tables.

None of the four ever travels to a server by itself. A page has to read a value and send it.

## What the app keeps where

- **IndexedDB** is the device's store (`apps/web/src/lib/store.ts`): the code, the answers waiting to be sent, the readable copies of what this phone wrote, the link's arrival. "Delete everything" wipes all of it.
- **Local storage** holds one word: the name of the workshop this device last opened, so the installed app knows where to go (learning note 10). "Delete everything" removes it, and the page that loads next, being that workshop's home, writes it again. It is the workshop's name, not the person's.
- **Session storage** was not used until ADR 0026. It now holds one note, for the length of one page load.
- **Memory** holds everything on the screen.

## Why the delete needs a note at all

"Delete everything" ends with a fresh load of the page. That is on purpose: a reload is the one way to be sure that nothing of the old participant, no draft, no answer, no row, is left in the page's memory.

But a fresh load with an empty store knows nothing. It does not know which link this phone came through, so it cannot offer to start again. The page before the reload knew. So it leaves a note for the page after: the code and the wave.

The note cannot be in memory, since the reload empties it. It should not be in the device's store, since the store was just wiped and is meant to stay empty. Session storage is the place that fits: it gets across a reload, and it belongs to this tab alone.

## The procedure

1. The server deletes the participant. If it refuses, nothing more happens and no note is written.
2. The device's store is wiped.
3. The page writes the note into session storage: the workshop, the code, and the wave the server recorded for the participant.
4. The page loads the workshop's home afresh.
5. The first thing the new page does with the note is take it and erase it. From here on session storage is empty again.
6. The new page checks the note: is it for this workshop, is the code 16 digits, is the wave a name? If not, there is no note.
7. If the device holds no code, and the address names no wave and no invite, the page keeps the code and the wave in memory and shows the welcome with "I understand". A link opened in that tab instead is a new arrival, and the note is not used.
8. "I understand" joins with that code. The server has never seen it, since the participant was deleted, so this is a new participant under the same link: what opening the email's link again would have done (ADR 0018).

The code is in `apps/web/src/lib/start-over.ts` and in `open` and `deleteMe` in `apps/web/src/lib/state.svelte.ts`.

## What follows from the lifetimes

- **Reload the welcome**, and "I understand" is gone: the note was erased at step 5, and memory does not survive a reload. The welcome says to open the link you were sent.
- **Open another tab**, and it knows nothing: session storage is per tab.
- **Close the tab** once the welcome has loaded, and nothing of the participant is left on the device: the note was erased at step 5. In the instant between steps 3 and 5 the note exists; a tab closed just then takes it along, and a browser that brings a closed tab back can bring its session storage back with it. That is why the note is erased as soon as it is read, and not when the join succeeds.
- **Tap "I understand"**, and the code is the device's again, in the store, as after any join.

## What to check by hand

In the browser's developer tools, under Application, then Session storage: the entry `wb:startOver` is not there before a delete and not there after the welcome has loaded. Under IndexedDB, the workshop's database has no `code` row on that welcome.
