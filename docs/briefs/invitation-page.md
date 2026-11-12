# Brief: the invitation page

For one builder. Read first, in this order: `CLAUDE.md`, `docs/adr/0021-the-invitation-page.md` (the decision; it is the specification), `docs/adr/0018-identity-by-the-link.md`, the glossary entries **link value**, **invitation page** and **link set**, and `docs/learn/12-unique-without-a-list.md`. Read the files named below, not the repository.

## What to build

A page at `/<slug>/join/<wave>/invitations` where a person at Mechanism presses "New set", sees the text of one invitation with three links in it, presses "Copy the text", and pastes it into an email. ADR 0021 says what the page does and never does. In short:

1. **The route.** `parseRoute` reads `/<slug>/join/<wave>/invitations` as the wave plus a flag. `/<slug>/join/<wave>` stays what it is.
2. **No participant machinery.** In `AppState.open`, the invitation page is decided right after the workshop is found and before anything else: no store is opened, no code is read or made, no sync, no `POST .../opened`, no `rememberWorkshop`, no write to `history` beyond what `open` already does to a fragment. The screen is a new one, `invitations`. An unknown slug still gives the `no-workshop` screen.
3. **`apps/web/src/lib/invitations.ts`**, pure and small:
   - `SPARE_LINKS = 2`.
   - the alphabet of ADR 0021 (32 characters: lowercase letters and digits without `i`, `l`, `o`, `u`) and the length 20;
   - `newValue(random)`: 20 characters, each `byte % 32` of a random byte. `random` is a function that fills a `Uint8Array`, defaulting to `crypto.getRandomValues`, so a test can hand in fixed bytes. Never `Math.random`.
   - `newLinkSet(origin, slug, wave, random?)`: `{ own, spares }`, each link `<origin>/<slug>/join/<wave>#p=<value>`, three different values (draw again on the practically impossible equal pair).
   - `invitationText(copy, set)`: the block "Invitation: text" with its slots filled, as plain text: the block's paragraphs joined by one empty line.
4. **`apps/web/src/components/Invitations.svelte`**, shown for the `invitations` screen. Title, the intro line, the three rules, the button "New set". After the first press: the text in a read-only field that can be selected, and the button "Copy the text". After a good copy: the text is gone from the page and from memory, and one line says it was copied; that line is announced to screen readers. "New set" always replaces what was there. If `navigator.clipboard.writeText` is missing or rejects: the line for `Error: CLIENT_COPY_FAILED` with its code, the text stays, and the field's content is selected so Cmd or Ctrl and C works.
5. **The words.** In `workshops/rural-manufacturing/copy.md`, a new screen heading `# Invitation page` (before `# Everywhere`) with the blocks below, and their names in the key lists of `apps/web/src/lib/copy.ts` so that `missingHeadings` covers them. The block `Error: CLIENT_COPY_FAILED` is already in the file.
6. **The frame.** In `App.svelte` the page counts as a page, not as the loop: no participant foot ("About this app", the world pill), the header as on the about page. Use the existing tokens and classes; this is a plain working page on the dotted desk, not a design pass. Every control is at least 44 pixels to a finger.

## The words, as drafts

Marco edits them later. Blocks marked draft carry the `[placeholder]` line.

```
# Invitation page

## Invitation page: title

Invitation links

## Invitation page: intro (under 60 words)

[placeholder]
This page makes the links for one invitation. Press "New set", copy the text, and paste it into the email for one person. Then press "New set" again for the next person.

## Invitation page: rules

[placeholder]
One set for one person. Never send the same set twice.

Keep no list of who got which link. Nothing here is saved: a set is gone once you copy it or make a new one.

Never send or copy an invitation to Under Over Through.

## Invitation page: buttons

- new: New set
- copy: Copy the text

## Invitation page: copied (one line)

[placeholder]
Copied. Paste it into the email, then press "New set" for the next person.

## Invitation: text

[placeholder]
This link is yours. It opens your cards on any phone or computer. It is the key to what you write, so keep it to yourself:

[your link]

To bring someone in, give them one of these two links instead. Each one starts cards of its own:

[spare link 1]

[spare link 2]
```

Follow the file's own conventions for comments above a block (who sees it, where), and for how a list block such as the buttons is declared in `copy.ts`.

## Files you own

- `apps/web/src/lib/route.ts`, `apps/web/src/lib/invitations.ts` (new), `apps/web/src/lib/state.svelte.ts` (only what the new screen needs), `apps/web/src/lib/copy.ts` (key lists only)
- `apps/web/src/components/Invitations.svelte` (new), `apps/web/src/App.svelte`, `apps/web/src/app.css` if a class is missing
- `apps/web/test/route.test.ts`, `apps/web/test/invitations.test.ts` (new), and the app or screens test file that fits
- `workshops/rural-manufacturing/copy.md` (the new section only)
- `docs/screen-map.md` (one entry for the page), `docs/build-log.md` (your entry)

Not yours: `packages/contracts` (the code `CLIENT_COPY_FAILED` is already there), `docs/adr`, `docs/glossary.md`, `docs/runbook.md`, `docs/services.md`, `docs/learn`. If you need a change in one of them, say so in your report.

## Tests, named as behaviours

- "the invitation address is read as its wave and the invitations page; the join address is unchanged"
- "a value is 20 characters of the alphabet, one for each random byte, and passes the link value's own check" (`valueFromHash` on a built link gives the value back)
- "a link set is one own link and two spare links, all different, on the origin, the workshop and the wave of the page"
- "the invitation's text carries the three links, each on a line of its own, and no slot is left unfilled"; and the reverse: the copy file's block has a slot for the own link and for every spare `SPARE_LINKS` asks for, so changing one without the other fails
- "opening the invitation page asks the server nothing and opens no store" (prove it with the fetch stub and the store, not by reading the code)
- "New set shows the text; a second New set shows three other links"
- "Copy the text puts the text on the clipboard, takes it off the page and says it was copied"
- "when the clipboard refuses, the page shows CLIENT_COPY_FAILED and keeps the text"
- the accessibility test's 44-pixel rule covers the page's two buttons

Two traps from earlier weeks. A client test that syncs without `stubRoutes` hangs the whole Vitest run: stub the routes in every test that opens the app, even though this page must call none. And hold only the timer you mean when you use fake timers.

## Done

- `npm run check` passes (typecheck, tests, formatting). Run it once, before the pull request.
- One look in a browser at the end, at phone width and at laptop width: `npm run dev --workspace=apps/web`, then `/rural-manufacturing/join/wave-1/invitations`. Press both buttons. Paste the text somewhere and open the own link in a private window: the welcome says the link is theirs.
- One pull request from the branch `invitation-page` into `main`, opened with `gh pr create`. Open it before you write its number in the build log. The description has: what changed and why; how to verify by hand; error codes added (`CLIENT_COPY_FAILED`, added by the integrator in the first commit); the decision record it follows (ADR 0021). It ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A build-log entry: date, what, why, how to verify, decisions made on the way, open questions. It links learning note 12.
- Commit messages: imperative first line under 72 characters, the why and the how-to-verify, and the trailer `CLAUDE.md` gives.
- No new dependency. No third-party anything. Relative imports carry `.ts`.
- Do not merge. Report what you built, what you decided on the way, anything you would change in the files that are not yours, and the result of the check.
