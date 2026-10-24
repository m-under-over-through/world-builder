# Screen map

Every screen and state of the client, with the error codes it can show. The UI builder builds this; it does not invent screens. Copy comes from `workshops/<slug>/copy.md`.

All routes live under `/<slug>/`. Storage on the device is namespaced by slug.

## Entry

| Route                    | Screen         | Notes                                                                                                                                                                                                   |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/<slug>/join/<wave>`    | Wave landing   | Posts `waveOpened` on load. If a code is already stored: go to Next card. Else: Welcome with the wave remembered. Errors: `JOIN_WAVE_UNKNOWN`, `JOIN_WAVE_CLOSED`, `JOIN_WAVE_FULL`, `WORKSHOP_CLOSED`. |
| `/<slug>/join/i/<token>` | Invite landing | Same, with the invite remembered. Errors: `JOIN_INVITE_INVALID`, `JOIN_INVITE_USED`.                                                                                                                    |
| `/<slug>/`               | Welcome        | Two choices: "New here" (needs a remembered wave or invite; otherwise explains it needs a link) and "I have a code".                                                                                    |
| `/<slug>/continue`       | Enter code     | 16-digit field, groups of four, numeric keypad. `GET /me` with the code. Error: `AUTH_CODE_UNKNOWN` ("that code is not ours; check the digits"). On success: Next card.                                 |

## First session

| Screen                         | What happens                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro 1, Intro 2               | Copy screens. Back and Next.                                                                                                                                                                                                                    |
| Intro 3, consent               | Copy plus the "I understand" button. Tapping it generates the code, calls `join`, stores the code. Errors: `JOIN_CODE_TAKEN` (retry once silently), `RATE_LIMITED`, `SERVER_ERROR`, offline (the join is queued and the session starts anyway). |
| Demo card                      | A card that explains tap-to-answer and swipe-to-set-aside, not recorded.                                                                                                                                                                        |
| First card with dictation hint | The platform-specific hint, dismissible.                                                                                                                                                                                                        |

## Core loop

| Screen         | States                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card           | `fresh` (question, answer field, "Set aside"), `answering` (keyboard up, nudge "please do not name real people", counter near 4,000; the limit is counted and enforced by code points so an emoji is never cut in half), `saving` (sealing, writing the outbox), `saved` ("Saved on this device"), `synced` ("Synced"). Swipe or "Set aside" writes `dismissed`; a second dismissal of the same card writes `deferred`. |
| Session end    | "That is a session." Session 1 only: Code reveal, then Install prompt. All sessions: "Come back another day."                                                                                                                                                                                                                                                                                                           |
| Code reveal    | The code in groups of four, masked by default, reveal and copy.                                                                                                                                                                                                                                                                                                                                                         |
| Install prompt | Per-platform steps; dismissible; never shown again once dismissed twice.                                                                                                                                                                                                                                                                                                                                                |

## Always reachable

| Screen                         | Content                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privacy panel                  | The code (masked, reveal, copy); cookies set by this app: 0; hosts contacted since open (from the browser's resource timing); microphone, camera, location: blocked by policy; what we store about you (`GET /me`, rows shown plainly, sealed bodies shown as sealed); last sync and outbox size; version and commit; informal data management plan; "Delete everything about me" (two-step confirm, `DELETE /me`, then local wipe). |
| Diagnostics (inside the panel) | Last sync result, outbox size, last error code with its one-line meaning. Client codes: `CLIENT_STORAGE_UNAVAILABLE`, `CLIENT_SEAL_FAILED`, `CLIENT_SYNC_FAILED`.                                                                                                                                                                                                                                                                    |
| Trust page                     | The seven sections from the architecture plan, section 13, with the key fingerprint and links to the source and the scanners.                                                                                                                                                                                                                                                                                                        |
| Terms and privacy policy       | Static text from `copy.md`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Prefer to talk?                | The dictation hint for this platform, from any card.                                                                                                                                                                                                                                                                                                                                                                                 |

## Offline and failure behaviour

- No network: everything works; events wait in the outbox; the card shows "Saved on this device". The join itself can be queued.
- After a server restore: the device keeps accepted events for fourteen days; on open it compares them with `GET /me` and re-sends any the server lacks, silently.
- `AUTH_CODE_UNKNOWN` on a stored code (the participant was deleted, or the workshop was reset): clear the stored code and show Welcome with an explanation.
- `WORKSHOP_CLOSED`: a closing screen with the trust page link; no new events are created.
- `CLIENT_STORAGE_UNAVAILABLE`: the app still runs for one session, warns that the code cannot be kept, and shows it at the end.
