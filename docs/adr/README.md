# Decision records

One file per decision, numbered, never edited after the fact except to mark it superseded. Each has: context (what forced a choice), decision (what we chose), consequences (what it costs and what it gives), and the alternatives we did not take. When you wonder "why is it like this", the answer is here.

| Number | Decision                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------- |
| 0001   | Keep decision records                                                                             |
| 0002   | Identity is a 16-digit anonymous code, stored as a keyed hash                                     |
| 0003   | Answers are sealed on the device to a per-workshop key                                            |
| 0004   | One deployment serves many workshops; a workshop is a folder                                      |
| 0005   | Events are append-only with client-generated ids                                                  |
| 0006   | Wave links with a window and a cap, plus three invites; no per-recipient tokens                   |
| 0007   | No readable answer is kept on the device after sync                                               |
| 0008   | The client and the API share one origin: `/<slug>/` and `/api/<slug>/`                            |
| 0009   | TypeScript throughout, npm workspaces, Zod contracts, Vitest, no build step for tools             |
| 0010   | A subdomain of under-over-through.co, DNS at Netlify, the existing UOT GitHub account             |
| 0011   | Zero-cost hosting: Netlify for client and API, Neon free, Backblaze plus GitHub artifacts         |
| 0012   | Libraries for the walking skeleton, and rate limiting without addresses                           |
| 0013   | Privacy in one place, and the way back: the one page, the plain session end, the reminder         |
| 0014   | Answers stay readable on the device, for the participant; the server holds sealed envelopes only  |
| 0015   | The card screen in the new design: the stack, the world, the laptop page, the fonts               |
| 0016   | Not used                                                                                          |
| 0017   | Rounds instead of sessions: no end screen, no install offer                                       |
| 0018   | Identity by the link: the newsletter link's value makes the code; no code typed or shown          |
| 0019   | One page before the cards: the welcome is the intro and the consent; no numbers, no toasts        |
| 0020   | The deck rules of 5 November: set-aside cards return later, never first; the deck ends            |
| 0021   | The invitation page: a link set per invitation, made in the browser, kept nowhere                 |
| 0022   | The blank card: a card the participant writes, an answer like any other                           |
| 0023   | The header and the open card on a phone: "?" for the about page; the card fits above the keyboard |
| 0024   | Tiles open: a card set aside can be answered from its tile, and an answer can be changed          |
| 0025   | While a card is open on a phone, only the card scrolls; the page behind is held                   |
| 0026   | After "Delete everything", the same tab starts over: the welcome with "I understand" again        |
| 0027   | One open card: every card opens, closes and leaves the same way, on a phone and on a laptop       |
