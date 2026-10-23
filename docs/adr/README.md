# Decision records

One file per decision, numbered, never edited after the fact except to mark it superseded. Each has: context (what forced a choice), decision (what we chose), consequences (what it costs and what it gives), and the alternatives we did not take. When you wonder "why is it like this", the answer is here.

| Number | Decision                                                                              |
| ------ | ------------------------------------------------------------------------------------- |
| 0001   | Keep decision records                                                                 |
| 0002   | Identity is a 16-digit anonymous code, stored as a keyed hash                         |
| 0003   | Answers are sealed on the device to a per-workshop key                                |
| 0004   | One deployment serves many workshops; a workshop is a folder                          |
| 0005   | Events are append-only with client-generated ids                                      |
| 0006   | Wave links with a window and a cap, plus three invites; no per-recipient tokens       |
| 0007   | No readable answer is kept on the device after sync                                   |
| 0008   | The client and the API share one origin: `/<slug>/` and `/api/<slug>/`                |
| 0009   | TypeScript throughout, npm workspaces, Zod contracts, Vitest, no build step for tools |
