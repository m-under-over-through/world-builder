# Design and development plan

Draft 0.2, 23 October 2026. Companion to the architecture and risk plan and the services list. Launch date: the newsletter goes out on Monday 16 November 2026; build and test finish by Sunday 15 November.

The goal of this plan is not speed. It is a system you understand end to end, built so that when something fails, the failure has a name and a page in the runbook.

## 1. Working principles

- **You can explain every hop.** The exit test for the first build phase is that you can answer, without looking, "where does an answer go after I tap save?" for every component it passes through. Nothing is added later until you can explain the thing it is added to.
- **Contracts before code.** The data model, the API, the event vocabulary and the deck format are written down and agreed before any parallel work starts. They are the thing that keeps parallel work coherent.
- **One thin end-to-end path first.** A walking skeleton that touches every component, built before any component is finished. Every later change is an increment to something that already works.
- **Every failure has a name.** Stable error codes on the server and in the client, each with a runbook entry: meaning, likely cause, what to check, how to fix, how to confirm.
- **Small changes, read by you.** Every change is a pull request with tests and a "how to verify by hand" section written in plain language. You read every one. If a description cannot be understood, the change is not ready.
- **Drills are part of the build.** Each failure scenario in the architecture plan becomes a scripted drill with expected observations, run before launch and on a schedule after.

## 2. Sequencing: neither backend first nor UI first

The question is which to start with. The answer is contracts, then a vertical slice, then both in parallel.

1. **Contracts.** Shared types, the API, the event vocabulary, the deck JSON schema, the screen and state map for the UI including the intro, the trust page outline. One day. Written with you, not for you.
2. **Walking skeleton.** The thinnest possible path: open the app, see one card, type an answer, it is encrypted and synced, a row appears in the database, the export tool decrypts it on your machine. Deployed to the real domain on a staging subdomain, with the backup job running and the monitor watching. Three days. One builder, so that it is coherent, and you walk through every piece of it at the end.
3. **Parallel streams against the contracts.** UI, API, deck, operations. With three weeks, the API, deck and ops streams start the day after the contracts, on files the skeleton does not touch, and the UI stream starts the moment the skeleton stands. The API is small and reaches "done" first, because the hardest UI problems (storage, install, sync status, the intro) can only be tested against a real backend. The UI is the long pole.
4. **Integrate, harden, pilot, launch.**

If forced to name one side to finish first: the backend, because it is small, its correctness is testable without taste, and everything else tests against it.

## 3. Roles

- **You.** Owner of decisions, content and the partner relationship. Reader of every pull request. Tester on real phones. The person who must be able to explain the system.
- **Integrator (my main session, with you).** Holds the whole picture. Writes the contracts, builds the skeleton, writes the briefs for parallel work, reviews and merges, keeps the glossary and the decision records, and walks you through each component when it lands.
- **Builders (separate agent sessions, one per stream, each in its own working copy).** Bounded packages with a written brief: goal, contract to satisfy, files owned, tests that define done, what not to touch, and a plain-language report back. They do not change contracts; they ask.
- **Reviewer (an independent agent per pull request).** Reads the change without the builder's reasoning, looking for security and correctness problems. Not anchored on the builder's claims.
- **Tester (an agent plus you).** Turns the drill list into scripts, runs browser automation across the device matrix, and reports. Real-device testing on iPhone and Android is yours.
- **Partner.** Card content, copy review, policy review, and the decisions listed in the architecture plan.

## 4. Cohesion rules for parallel work

Parallel agents are good for well-bounded work with a contract and a test that defines done. They are bad for anything where taste and consistency across the whole matters: the UX flow, the copy, the naming. So:

- Contracts live in one shared package and change only through the integrator.
- One builder per set of files at a time. Two builders never touch the same files.
- The glossary is law: participant, code, wave, invite, session, event, card, deck, outbox. A builder who needs a new word proposes it.
- The UI builder receives the screen map, the copy and the design tokens. It builds what is specified; it does not invent flows.
- One lint and format configuration, one test runner, one way to run things locally, written in the repository's own instructions file so every agent follows the same rules.
- Any decision not already in the architecture plan gets a one-page decision record before the code lands.
- The integrator merges in small batches and runs the skeleton end to end after each.

## 5. Schedule to 15 November

Today is Friday 23 October. Build and test finish by Sunday 15 November and the newsletter goes out on Monday 16 November, which leaves 16 working days and three weekends. The weekends are buffer, not plan.

The schedule works because the app keeps evolving after launch. Participants return over several weeks and the installed app updates itself, so the first session has to be right on 15 November and the rest can follow in the week after. What cannot follow later is the data model, the privacy guarantees and the backups. Those are week one and not negotiable.

### Scope in three tiers

**Ships by 15 November.**

- Intro: three screens plus consent, a demo card, and the first-card dictation hint as short text per platform.
- Card flow: warm-ups then checkpoints, dismiss sends the card to the end of the queue, a second dismiss defers it to the next session automatically. No separate Later pile screen yet.
- Typed answers, local store, outbox, sync, visible sync status.
- Anonymous code shown at the end of session one, continue-with-code on the welcome screen, install prompt after the code.
- Encryption on the device to the research key. Export tool that decrypts to CSV on your machine.
- Wave link with window and cap, and the per-wave link-opened counter. No personal invites yet.
- Privacy panel: code, cookies, hosts contacted, what we store, delete me, last sync, version, last error code.
- Trust page, terms, privacy policy, consent text.
- Health endpoint with last-backup time, monitor, nightly backups to two buckets, one restore drill passed, one decrypt drill passed, key custody done.
- Strict headers, rate limits, authorization tests, headers scan, ZAP baseline.
- Runbook with every error code that exists, a glossary, a map README.
- The workshop entity from day one: every table and route scoped to a workshop, one key per workshop, per-workshop backups. One workshop configured at launch.

**Ships 17 to 23 November, while participants are on session one or two.**

- Personal invite links.
- Later pile screen. Platform illustrations for the dictation hint.
- "Continue elsewhere" link.
- Status command, deck simulator, decision records backfilled.
- The `workshop new` command and the spin-up recipe, first used for the worldbuilding class at the end of November.

**Not this round.**

- Rereading or revising answers (decided against, not deferred). Shamir split. Web Speech opt-in. Accessibility beyond semantic structure and a VoiceOver and TalkBack check.

### Decisions

Taken on 23 October and recorded in the architecture plan, section 16. Two items remain with the partner, the wave cap and whether they want a mid-project snapshot of answers. Neither blocks the build.

### Week 1, 26 to 30 October: foundations and skeleton together

- **Fri 23, today.** Decisions taken; send the partner the decision record for review. Pick the subdomain name and add its CNAME in Netlify DNS. Open the Cloudflare, Neon, Backblaze, monitor and vault accounts. Create both repositories under the UOT GitHub account and push.
- **Mon 26.** Contracts written with you: types, API, events, deck schema, the workshop folder format, screen map. The agent instructions file and the glossary. Key pair generated for the first workshop and the custody ritual done.
- **Tue 27 to Thu 29.** The integrator builds the skeleton end to end on staging. In parallel, on separate files: an API builder writes the schema, migrations and contract tests; a deck builder writes the deck engine with tests and loads the thirteen questions from your notebook sketch as the placeholder deck; an ops builder sets up the backup job, the health endpoint and the monitor.
- **Fri 30.** First restore drill. Skeleton walkthrough with you. You try it on your own iPhone and on a laptop, including the clear-storage and continue-with-code path. Content request to the partner: final card wording by Thursday 5 November.
- **Exit.** A real answer from your phone sits encrypted in the production database, decrypts on your machine, and last night's backup restored into a scratch database.

### Week 2, 2 to 6 November: parallel build

- **UI builder.** Intro, card flow, privacy panel, trust page, welcome screen with continue-with-code, install prompt, dictation hints. Against the real staging API from day one.
- **API builder.** Waves, delete, rate limits, all error codes, authorization tests. Done by Tuesday 3 November so the UI tests against the final thing.
- **Ops builder.** Export and decrypt tool, drill scripts, runbook entries for every error code, the laptop-is-gone drill.
- **You and the partner.** Cards final by Thursday 5 November. Copy for the intro and the trust page. Terms, policy, consent and the informal data management plan drafted; the partner reviews.
- **Wed 4.** Hands-on deck tuning on staging with the partner: warm-ups and checkpoints per session, starting from 3 and 1. The numbers change in the deck file, not in code.
- **Fri 6.** Integration, full end to end on staging, walkthrough of every new component. Content freeze.

### Week 3, 9 to 13 November: hardening and pilot

- **Mon 9 to Tue 10.** Security pass, device matrix on real hardware, every failure drill, VoiceOver and TalkBack pass, low-end Android check.
- **Wed 11 to Fri 13.** Pilot with five to eight friendly people from a real newsletter test send, asked to do two sessions in three days. Fixes land on staging during the day and go to production each evening after a smoke test.
- **Fri 13.** Pilot review. Fix list closed, or deferred to the week after launch.
- **Sat 14.** Go or no-go checklist. Production smoke test from your phone. Alerts tested on both channels.
- **Sun 15.** Buffer. Nothing ships unless the go or no-go found something.
- **Mon 16.** Newsletter goes out. You watch the health endpoint and the synced-answers count that evening.

### Week 4, 17 to 23 November: operate and ship the deferred items

- Daily status check for the first week, then weekly.
- Invites, the Later pile and the illustrations ship as updates. Participants pick them up on their next session.
- Spin up the worldbuilding class workshop: new folder, new deck, new key, its own wave link. The first real test of the recipe, a week before the class needs it.

### Close-out

- Collection closes Sunday 6 December. Export and scrub in the week of 7 December; the spreadsheet goes to the partner's restricted Drive folder.
- Deletion on 5 February 2027, backups included. Bucket retention is set at setup so nothing outlives that date.

### What this schedule does not cut

Backups and the restore drill, key custody and the decrypt drill, the encryption, the strict headers, the authorization tests, the pilot, and your walkthroughs. If the schedule slips, the week-after items slip and the pilot shrinks to two days. Never these.

### Where it is most likely to break

- Cards arrive late. The placeholder deck keeps the build moving; late cards change a JSON file, not code.
- iOS surprises in storage or install. You test the skeleton on an iPhone in week one, not week three.
- The pilot finds a flow problem in the intro. The intro is copy and screens, cheap to change; the data model underneath does not move.
- Multi-workshop scoping costs about half a day in week one. Retrofitting it after launch would be a data migration under live traffic, so it goes in now and nothing else moves to make room.
- You cannot absorb walkthroughs at this pace. Three walkthroughs in total, each under an hour, and the map README as the thing you reread.

## 6. Legibility and failure visibility

These are the concrete practices that make "I know what is failing" true.

- **Error codes.** Every failure path on the server and in the client has a short stable code, such as SYNC_UNKNOWN_CODE or BACKUP_STALE. The code appears in the server log line, in the client diagnostics view, and as a heading in the runbook.
- **An informative health endpoint.** Version, database reachable, last backup completed at, events received today. The monitor alerts when any of these is wrong, not only when the server is down. A backup that silently stopped running shows up here the next morning.
- **A status command.** One command on your machine prints the state of the whole system in plain words. It is the first thing you run when something feels off and the thing you read every week.
- **A diagnostics view in the app.** Inside the privacy panel: last sync result, outbox size, last error code. A participant can tell you "it says SYNC_E3" and you can look it up.
- **The runbook.** One page per error code and per service. Written incrementally: every drill and every incident adds or corrects an entry. If the runbook has no entry for what you are seeing, that is itself a finding to fix.
- **Decision records.** Short, numbered, one per decision: context, decision, consequences. When you wonder "why is it like this", the answer is a file.
- **A map README.** The repository's front page is a map: what each folder is, how to run it, how to test it, how it fails. Each folder has its own short one.
- **Staging that matches production.** Separate database, separate subdomain, same code. Every change lands there first and you try it on your phone before it goes live.
- **Tests named as behaviours.** "A request with an unknown code gets a 401 and no data" reads as documentation.
- **Walkthroughs.** When a component lands, the integrator walks you through it in the code and in the running system. You should leave able to explain it to the partner.

## 7. Definition of done

For a pull request:

- Tests pass in CI, including the contract tests for anything touching the API.
- A plain-language description of what changed and why, linking to the decision record where one exists.
- A "how to verify by hand" section you can follow on staging.
- Any new error code has a runbook entry.
- Any new service or dependency has a line in the services list with a reason.
- Reviewed by the independent reviewer and read by you.

For a phase:

- The deliverables listed above exist and you have seen them run.
- The skeleton still runs end to end on staging.
- The runbook and the glossary are current.

## 8. Risks in the process itself

- **Parallel drift.** Streams interpret the contract differently. Mitigation: contract tests, small merges, the skeleton run after each merge.
- **Agent overreach.** A builder changes something outside its brief to make its own work easier. Mitigation: file ownership in the brief, the reviewer checks the diff against the brief, the integrator rejects out-of-scope changes.
- **Understanding debt.** Things land faster than you can absorb them. Mitigation: walkthroughs are a gate, not a courtesy; if you cannot explain a component, the next stream waits.
- **Content lag.** The deck and the copy are the partner's slowest deliverable. Mitigation: the simulator and the placeholder deck let the build proceed; content freeze is a dated milestone in Phase 3.
- **Drills skipped under time pressure.** Mitigation: the drills are in the go or no-go checklist and the launch waits for them.
