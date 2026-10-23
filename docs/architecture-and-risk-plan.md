# World Builder: architecture and risk plan

Draft 0.4, 23 October 2026. Written during the planning sprint, revised after review, and updated with the decisions taken the same day. Section 16 records them.

## 1. Summary of recommendations

1. Build a static, installable web app (a PWA). The server is the record; the device is a buffer and an offline fallback. Answers are written to the device first and synced to the server as soon as there is a connection, and the app pulls the participant's state from the server on every open. The app keeps working when the server is down.
2. No accounts, no email, no cookies. Identity is a random anonymous code generated on first use, shown to the participant and kept on the device. The server stores only a hash of it. Typing the code on another device continues the same participation.
3. Keep typing as the input. Let the phone keyboard's dictation handle voice. The app never records audio.
4. Encrypt each answer on the device with the research team's public key. The server, the hosting vendors and the backups only ever hold ciphertext, so a stolen database is worthless. The cost is that the private key becomes the one thing you must never lose. This plan treats key custody as a launch gate.
5. Sharing: one "wave" link per newsletter send, open for a limited window with a cap, plus a small number of personal invite links per participant. This gives control without ever recording who invited whom.
6. Redundancy at this scale means: the client works without the server; the data exists in four places (device, primary database with point-in-time recovery, two backup buckets at two vendors); no single person, laptop or account can take the project down.
7. Make the privacy claims verifiable rather than stated: public source code, a strict Content Security Policy that physically prevents the page from talking to anything but your own domain, a live privacy panel that shows the participant their anonymous code, zero cookies and the one host the app talks to, a "see my data / delete my data" button, and a trust page with the exact data inventory.
8. You operate alone. The infrastructure sits under your own organization account with printed recovery codes and an emergency contact in the password vault. The partner holds nothing and receives a spreadsheet at the end. Hand-off is a planned export and deletion, not an account transfer.
9. Scale is not a concern: around five thousand short texts in total. All the effort goes into reliability and trust.
10. One deployment, many workshops. A workshop is a folder in the repository: its deck, its copy, its dates and its own key. Spinning up the next one, such as the worldbuilding class at the end of November, is copying the folder, generating a key and deploying.

## 2. Requirements and constraints

**Functional**

- Card deck with two sets, warm-up and checkpoint. Random order within a set. A session goes through some warm-ups and lands on the checkpoints.
- Dismiss a card and revisit it later, in the same session or a later one.
- Typed free-text answers.
- Repeatable sessions. The hope is three or four per participant over several weeks.
- Share with collaborators under some control.
- Participants can see what is stored about them and delete it.
- Reusable: the same deployment hosts other workshops, each with its own deck, copy, dates and key, and a new one can be spun up in under an hour without code changes.

**Non-functional**

- Mobile first, but people open the link on whatever device the newsletter lands on: phone, tablet or laptop, sometimes several. Works in iOS Safari and Android Chrome, installable to the home screen, and in desktop browsers.
- English only. Accessibility through the operating system's own features: the app's job is clean semantic structure, labels, focus order and contrast, checked with VoiceOver and TalkBack.
- Anonymous by construction. No personal data collected, ever.
- Privacy and security claims verifiable by a participant or a third party.
- No data loss. A server outage must not block participation.
- The newsletter URL must work for the whole project and never change.
- Data belongs to the partner. Clean hand-off and deletion at the end.

**Constraints**

- Two-person team, no on-call rota. Everything must be boring to operate.
- No native app this round. Web only.
- Managed services over self-hosted. Modest budget.

**Scale estimate**

80 participants, 4 sessions each, about 15 cards per session: roughly 5,000 answer events plus dismissals. A few megabytes of data. Peak concurrency in the tens, right after a newsletter send. Hosting should cost well under 50 USD a month. Nothing here needs to scale; everything needs to be reliable.

## 3. The failures you named, and what the design does about each

| Failure                                | Design response                                                                                                                                                                                                                            | How you prove it before launch                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| We lose data                           | Device-first storage with an outbox. Idempotent sync. Managed Postgres with point-in-time recovery. Nightly encrypted dumps to two buckets at two vendors.                                                                                 | Restore a bucket dump into a scratch database and compare row counts. Kill the API during a test session, answer a few cards, bring it back, confirm everything synced. |
| The URL does not work                  | Your own domain, registered for five years, auto-renew on, registrar lock on, two admins. Static client on a global CDN. Service worker serves the app even when the CDN is unreachable. Newsletter click-tracking disabled for this link. | Uptime monitor on the client URL and the API health endpoint from day one. Test send of the newsletter to both of you. Open the installed app in airplane mode.         |
| Someone injects and steals the answers | Answers encrypted on the device to the research key; the server holds ciphertext only. Anonymous codes stored as salted hashes. Parameterized queries. Strict CSP. No admin UI on the public app. Rate limits and invite gating.           | Headers scan (Mozilla Observatory), OWASP ZAP baseline scan, manual check that code A cannot read or delete participant B's data, invite replay and over-use tests.     |
| An email address or a name leaks       | No emails anywhere in the system. No per-recipient tokens in the newsletter. No IP addresses or user agents written to any store you control. Vendor logs off or minimal. Pre-handoff scrub of names typed into answers.                   | Read the schema. Read the hosting log settings. Read a sample export. Confirm the newsletter uses the generic wave link.                                                |
| A server stops working                 | Client works offline and syncs later. Stateless API that redeploys in minutes. Previous client builds kept for one-click rollback. Alerts to both phones.                                                                                  | Pause the API for an hour during the pilot and watch the sync metric recover. Trigger a real alert and confirm both of you get it.                                      |
| My machine breaks                      | Nothing lives only on a laptop: code in a GitHub organization, secrets in a password vault, backups in buckets, private key and account recovery codes on paper in two places.                                                             | The "laptop is gone" drill: from a borrowed machine, using only the vault and the paper copies, deploy a change and restore a backup.                                   |
| Everything is up but no data arrives   | Daily "answers synced in the last 24 hours" metric with an alert during active weeks. The app shows "Saved on this device" and "Synced" so participants can also see it.                                                                   | Break the sync endpoint deliberately in staging and confirm the alert fires.                                                                                            |
| The free tier pauses the database      | Smallest paid tier for the database. Billing alerts. A card that does not expire mid-project.                                                                                                                                              | Check the vendor's inactivity policy once and write the renewal dates into the runbook.                                                                                 |

The last two rows are the ones that actually bite small projects. Keep them.

## 4. Design principles

- Server is the record, device is the buffer. Writes land on the device first so nothing is ever blocked on the network; the server is where the research data lives and where any device picks up from.
- Store nothing you would be embarrassed to show a participant. Then show it to them.
- Make the server ignorant: hashes, ciphertext, card ids, counts.
- Two of everything that matters: owners, backups, vendors.
- Append-only events. No edits in place. Sync becomes trivial and nothing conflicts.
- Fewer moving parts beats more features.

## 5. High-level architecture

```
   Newsletter (wave link)          Forwarded invite link
             |                               |
             v                               v
  +-----------------------------------------------------------+
  |  Participant's phone or browser                           |
  |  Static PWA, served from the CDN, cached by the           |
  |  service worker after first load                          |
  |                                                           |
  |  +-------------+   +-------------+   +---------------+    |
  |  | Deck engine |   | Local store |   | Outbox        |    |
  |  | random,     |   | progress,   |   | events to     |    |
  |  | dismiss,    |   | queue, no   |   | sync, with    |    |
  |  | revisit     |   | answer text |   | encrypted body|    |
  |  +-------------+   +-------------+   +-------+-------+    |
  |            research public key (pinned)      |            |
  +----------------------------------------------|------------+
                                                 | HTTPS, to your
                                                 | domain only
                                                 v
  +-----------------------------------------------------------+
  |  API, small and stateless                                 |
  |  join . sync . me . invites . delete . health             |
  |  sees: hash of anonymous code, card ids, ciphertext       |
  +------------------------------+----------------------------+
                                 v
  +-----------------------------------------------------------+
  |  Managed Postgres, US region, point-in-time recovery      |
  +-------------+-----------------------------+---------------+
                | nightly encrypted dump      |
                v                             v
        Bucket A, vendor 1            Bucket B, vendor 2

  At project end: export tool on your machine, holding
  the private key: decrypt, scrub, package, deliver, then delete.
```

**Data flow**

1. First visit. The client generates the anonymous code, then calls `join` with the wave id or the invite token. The server creates a participant and stores the hash of the code.
2. A session. The deck engine builds the queue for this session. Every action is an event stored locally: shown, answered, dismissed, deferred, revisited. Answer text is encrypted on the spot and queued in the outbox; once synced, no readable copy remains on the device. What is written is written.
3. Sync. On every open the app pulls the participant's state from the server (sessions, cards already answered, invites left) so a second device starts where the first left off. Whenever the app is open and online, the outbox posts events in small batches. Every event has a client-generated id, so the server upserts and a retry can never duplicate. The client marks events synced and shows the status.
4. Coming back. The code is found in storage and the participant continues. On another device, or after storage was cleared, they type their code. Without it they join again as a new participant.
5. The end. Joins are closed, a final backup is taken, and the export tool produces the dataset for the partner.

### 5.1 Many workshops, one deployment

The same experience will run for other groups, starting with a worldbuilding class at the end of November. The design is one deployment serving many workshops, not one deployment per workshop. A solo operator cannot run N monitors, N databases and N backup jobs, and in this design the marginal cost of a workshop is zero.

A workshop is a folder in the repository, for example `workshops/rural-manufacturing/`:

- `workshop.json`: slug, name, who runs it, a purpose line, warm-ups and checkpoints per session, invites per participant, wave cap, open, close and delete dates, and the workshop's public key.
- `deck.json`: its cards.
- `copy.md`: intro screens, consent text, trust page variables.

Spinning up the next one: copy the folder, edit the three files, run the `workshop new` command, which generates the key pair, prints the private key once for your vault and writes the public key into the folder, then commit. CI deploys it and the workshop is live at `/<slug>/`, with its wave link at `/<slug>/join/wave-1`. Under an hour, no code changes. Closing, exporting and deleting are the same command with a different verb.

What scoping means inside the system:

- Every table that holds participant data carries a workshop id and every query filters on it. A test asserts that a code from one workshop gets nothing from another.
- One key pair per workshop. A cross-workshop bug, should one ever exist, exposes ciphertext sealed to a different key. Each dataset is exported, handed over and deleted on its own.
- Per-workshop backups, so one workshop's deletion date never depends on another's (section 11).
- Each workshop has its own install manifest, so a participant in two workshops gets two icons, and storage on the device is namespaced by workshop.
- The domain is neutral and not tied to this partner, because the next workshop lives on the same one.

## 6. Identity, anonymity and sharing

This is the heart of the design and the place where the requirements pull against each other. Returning sessions need continuity, forward control needs to know something about sharing, and anonymity needs the server to know as little as possible.

### 6.1 Who is a participant

- A participant is one anonymous code. The code is generated on the device on first use: for example four random words and a number, around 50 bits of randomness. This is the model Mullvad VPN uses for its accounts, where a random number is the whole identity and nothing else is ever asked.
- The device keeps the code in IndexedDB, mirrored in localStorage. It is sent in a request header on every call. It never appears in a URL, because URLs end up in browser history, screenshots, referrers and newsletter click logs.
- The server stores a salted hash of the code, the way passwords are stored, and compares hashes on every request. A database dump contains nothing you can log in with. Requests carrying an unknown code are rate-limited hard, so guessing is not practical.
- The code is shown to the participant in the privacy panel, masked by default, with a copy button and a plain explanation: this is the only thing that identifies you to us, it is random, and it is yours to keep if you want to continue on another device.
- What the server knows about a participant: the hashed code, the day they joined, which wave they came through or that they came through an invite (not whose), how many invites they have left, and counts. Nothing else.

### 6.2 Many devices, coming back

People will open the link wherever the newsletter lands: phone, tablet, laptop, and sometimes more than one. No storage strategy solves that, because the question is not where the data lives but how a second device proves it is the same person. Only something the participant carries can do that, and the code is that thing.

- Same device, same browser: the code is in storage and the participant resumes silently.
- Another device, or storage cleared: the welcome screen asks "new here, or continuing?" and the participant types their code. The app pulls their state from the server and continues: no repeated cards, the session count carries on, invites remaining are correct.
- No code: they continue as a new participant. The research loses the link between the two halves but no answers. That is acceptable.

What threatens device storage: Safari, on iPhone and Mac, may purge site storage for a site not used for about a week of browsing, and treats installed home-screen apps more leniently; people clear their data; and on iOS the home-screen app has its own storage separate from Safari, so someone who answers in Safari and installs later lands on the welcome screen and types their code once. Chrome and Firefox, on desktop and Android, keep storage until the person clears it.

Decided 23 October: no rereading and no revising, on any device. This is a meditative exercise; what is written is written, and a better answer can be given the next time the card comes round. So the device keeps no readable copy of answers at all, which is simpler and stronger: an answer leaves the phone encrypted and nothing readable stays behind.

A convenience worth adding: a "continue elsewhere" button that produces a link with the code in the URL fragment (the part after `#`), which browsers never send to any server. Pasting it into a messaging app still exposes the code to that app, so the button says so.

### 6.3 Newsletter link and forwarding

Controlling forwards precisely requires knowing who shared with whom. Anonymity requires not knowing. The recommended compromise:

- **Wave link.** One generic URL per newsletter send, for example `/join/wave-1`. Not per recipient. Decided: it accepts new participants from the send on 16 November until collection closes on 6 December, up to a cap of 150. The cap is a safety valve against a link travelling further than intended; raise it if the partner's list is bigger. After that it closes. This is the only control possible on a link anyone can forward from their inbox, and it costs nothing in privacy.
- **Invite links.** From inside the app a participant can create up to 3 invite links of the form `/join/i/<random token>`. Each works once. The server records that the issuer spent one invite and that the token is used. The new participant's record does not point back to the issuer. The issuer sees "2 of 3 invites used" and nothing more.
- **Newsletter settings.** Turn off click tracking for this link so the newsletter vendor does not log who clicked, and print the URL in plain text as well, so it survives any tracking redirect breaking.
- **Not recommended:** per-recipient tokens in the newsletter. They give precise control, but the newsletter vendor's export then maps each token to an email address. That mapping is a leak waiting to happen and it makes the anonymity claim untrue.

**Basic funnel numbers, without tracking.** The partner will want to know roughly: how many emails went out, how many people opened the link, how many started, how many answers exist. Sent comes from the newsletter tool. Opened comes from the wave route itself: `/join/wave-1` is served by the API, which adds one to a per-wave counter and serves the page, with no cookie and no address stored, so repeat opens by the same person count again and the number is approximate. Started is the count of participants created per wave, which is why the wave is recorded on the participant. Answers is the count of events. Four numbers, all from things you already hold, none of them about an individual.

### 6.4 What is never collected

Name, email, phone, IP address, user agent, precise timestamps, location, device fingerprint, cookies, analytics identifiers, referrer, audio.

Timestamps are stored as a day only. Order within a session comes from a sequence number set by the client. Coarse time is enough for the analysis and removes a correlation vector.

## 7. Voice input

The feature wanted is speech-to-text, or dictation. Recommendation: keep a plain text box and lean on the dictation the operating system already provides. The app receives text, never audio.

Where OS dictation exists:

| Platform                            | How the participant starts it                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone and iPad, any browser        | Microphone key on the keyboard. On by default on most devices.                                                                                |
| Android, Gboard or Samsung keyboard | Microphone key on the keyboard.                                                                                                               |
| Mac                                 | A shortcut set under System Settings > Keyboard > Dictation, by default pressing the microphone or fn key twice. Also Edit > Start Dictation. |
| Windows 10 and 11                   | Win + H opens voice typing in any text field.                                                                                                 |
| ChromeOS                            | Dictation under accessibility settings, toggled with Search + D.                                                                              |
| Linux desktop                       | Nothing built in.                                                                                                                             |

So it covers almost every phone, which is most of your audience, and every mainstream laptop, though on laptops it is not discoverable.

Can the app open the keyboard's dictation itself? No. There is no web API that reaches the keyboard's microphone key; the keyboard sits outside the page. What a page can do:

- Focus the text field, which raises the keyboard on phones, and show where the microphone key is. A "Prefer to talk?" control on the card can do exactly this, with a platform-specific illustration and the desktop shortcuts. This is the recommended first version. It should be worded as a tip, not as a record button, so nobody feels tricked.
- Use the browser's own speech recognition (the Web Speech API). This is the only way to put a real microphone button in the page. Chrome, Edge and Safari support it; Firefox does not. The audio is processed by the browser vendor's service, Apple for Safari and Google for Chrome, never by your server. On a phone that is usually the same vendor that runs the keyboard dictation, so the practical privacy difference is small, but three things change: the page has to ask for microphone permission; the Permissions-Policy that currently tells the browser "this app may never use the microphone" has to be relaxed; and the trust page sentence becomes "audio goes to your browser's vendor, not to us" instead of "this app cannot record audio". That is a real cost in trust for a modest gain in convenience. Keep it as a documented option behind an explicit opt-in if the pilot shows people want it.

Put the hint in the input placeholder: "Type, or tap the mic on your keyboard to dictate."

Typed text can still contain personal details ("my cousin at the Ford plant"). Two measures: a one-line nudge on the card asking people not to name individuals, and a scrub pass before hand-off (section 14).

## 8. The card engine

The deck is a versioned JSON file in the repository: card id, set (warm-up or checkpoint), text, deck version. Every event records the deck version, so rewording a card never silently corrupts the analysis.

Session mechanics, all computed on the device:

- Each session gets a random seed stored with the session, so resuming mid-session is deterministic.
- The queue is W warm-ups then C checkpoints, both chosen by seeded shuffle, preferring cards this participant has not yet answered and cycling back to answered ones once a set is exhausted. W and C live in the deck file, not in code, so they can be tuned by hand on staging. Starting values, from gut feel: W = 3, C = 1. A session is then four cards and a few minutes, which suits coming back three or four times.
- Dismiss moves the card to the end of this session's queue. A second dismiss defers it to a future session. A "Later" pile is reachable at any time for revisiting.
- A session ends after the checkpoints, with a "come back another day" screen. No timers, no streaks, no pressure.
- Dismissals are recorded as events. Which questions people avoid is research data in its own right. The trust page says so.

Decided 23 October: no revising earlier answers. Checkpoints rotate through the unseen ones first and then repeat, which is how a view moving over time becomes visible. The exact W and C are tuned hands-on in week two.

### 8.1 Intro experience

The first open has to do four jobs in under a minute, and the order matters because of the code and the install split described in section 6.2.

1. **What this is.** Three screens at most: who is running this and why, what you will be asked, that answers are anonymous and used for research. The third screen is the consent step. Plain words, no scrolling walls.
2. **How it works.** One screen with a live demo card: tap to answer, swipe to put it aside, the "Later" pile, no right answers, come back any time.
3. **The first card, with the dictation hint.** The hint is platform-specific. The app detects iPhone and iPad, Android, Mac, Windows and ChromeOS and shows the matching illustration of where the microphone key or shortcut is. It is dismissible and stays reachable from the "Prefer to talk?" control on every card. On Linux and unknown platforms it simply does not appear.
4. **End of the first session, in this order.** First the code: "this is you, save it to continue on another device", with copy and a masked reveal. Then the install prompt: "add to your home screen for next time", with per-platform steps. The order matters: someone who installs after seeing their code can type it into the installed app and carry on; someone who installs before seeing it would start over.

Returning opens skip all of this and land on the next card. The privacy panel, the trust page and the hints remain one tap away.

## 9. Data model

```
workshops      id, slug (unique), name, status, public_key, deck_version,
               warmups_per_session, checkpoints_per_session,
               invites_per_participant, cap, opens_day, closes_day, delete_day
participants   id, workshop_id, code_hash (unique per workshop), created_day,
               wave_id (nullable), invites_left
sessions       id (client uuid), participant_id, session_no,
               started_day, deck_version, seed
events         id (client uuid), session_id, card_id, seq,
               kind (shown | answered | dismissed | deferred | revisited),
               body (ciphertext, only for answered), created_day
invites        token_hash (pk), issuer_participant_id, used (bool)
waves          id, workshop_id, label, opened_count, joined_count
```

Notes:

- No column anywhere can hold a name, an email or an address. The schema is the first half of the privacy proof.
- Every table with participant data carries a workshop id, every query filters on it, and a test proves a code from one workshop gets nothing from another.
- `invites.used` is a boolean rather than a date, so that join dates cannot be lined up with redemption dates to reconstruct who invited whom on quiet days.
- `body` is bytes the server cannot read. Length is capped (for example 4,000 characters of plaintext) before encryption.

**API**, five endpoints and a health check, every route prefixed with the workshop slug, all authenticated by the code in a header except join. Continuing on a new device is just a `GET /me` with the typed code; an unknown code gets a 401 and the welcome screen.

```
POST /join      { wave | invite_token }         -> ok
POST /sync      { events[] }                    -> { synced_ids[] }
GET  /me                                        -> my rows, counts, invites_left
POST /invites                                   -> { tokens[] }
DELETE /me                                      -> everything about me gone
GET  /health
```

## 10. Encryption and key custody

**In plain words.** The partner's deliverable is a spreadsheet of anonymized answers, handed over at the end through a restricted shared folder. Nothing in this section changes that. What this section decides is what sits on the server between launch and that spreadsheet. Think of a locked drop box. Anyone can post a letter through the slot (the app). Nobody can read what is inside, not even the owner of the building (the hosting vendors) or someone who breaks in. One key opens it: yours, on your laptop, when you run the export. The partner never sees or touches the key. They get the spreadsheet.

Two options:

- **A. Server-side.** The vendor encrypts the disk, TLS protects the wire. Anyone with database access, including a successful attacker and the hosting vendor's staff, can read the answers. This is the industry default and the simplest.
- **B. Device-side, to the research key.** The client holds the research team's public key. Each answer is sealed to it (libsodium sealed boxes, a standard, boring construction) before it leaves the phone. The server, the vendors and the backups hold ciphertext. Only the holder of the private key can read.

**Recommendation: B.** It turns "someone steals the database" from a catastrophe into a non-event, and it is the single strongest sentence you can put on the trust page: "we cannot read your answers on our servers, only on a machine the research team controls."

Its costs, stated plainly:

- The private key becomes the thing you cannot lose. Lose it and every answer on the server is unreadable forever.
- Nobody reads answers mid-project without running the export command on your machine, which takes a minute. Counts, sessions and dismissals are visible at any time without the key, which is enough to know the project is alive.
- Nobody, the participant included, can reread an answer once it has left the phone. By the 23 October decision that is the intended experience.

**Key custody, a launch gate.** You are the only operator, so this is a plan for one person: about thirty minutes once, then five minutes a month.

- One key pair per workshop. Generate it on your laptop with the `workshop new` command. The public key goes into the workshop folder and its fingerprint onto that workshop's trust page; the private key goes into the vault under the workshop's name.
- Store the private key in three places on two kinds of media: your password vault; a printed copy in a sealed envelope at home; a second printed copy in a sealed envelope somewhere else you control, such as the office or a trusted relative's house.
- Name an emergency contact in the password vault. Bitwarden's Emergency Access lets a person you choose (the partner, a friend, a relative) request access and receive it after a waiting period you set, unless you refuse. They need no technical skill and hold nothing in advance. The vault contains the key and a link to the runbook, so the project can be exported and closed without you.
- Before launch and once a month: run the export command against the latest backup and check the row count. That is the whole ritual.
- Adding this later is messy, because earlier answers would sit readable and later ones not. Removing it later is a one-line change. So the default is on.
- If this ritual looks like more than you will reliably keep up, choose A. Everything else in this plan stays the same.

Honest limit: a web app cannot fully defend against a malicious client deploy that swaps the public key. Mitigations are deploy-from-CI only, two-person review on the main branch, the exact build version shown in the app footer, and a public repository so the deployed code can be matched to the source.

## 11. Hosting, redundancy, backups, accounts

**What redundancy means at this size.** Not multiple regions or clusters. It means: the client keeps working when the server is gone; the data exists in four places; nothing can lapse quietly; and two people can do everything.

**Client.** Static files on a global CDN (Cloudflare Pages or equivalent) under your own domain. HTTPS and HSTS. The service worker precaches the app shell and the deck, so a visited or installed app opens with no network and when the CDN is down.

**API.** One small stateless service (a Cloudflare Worker, or a tiny Node service on Fly.io or Render if you prefer a conventional server). Health endpoint. Redeploys from CI in minutes.

**Database.** Managed Postgres in a US region, smallest paid tier, point-in-time recovery enabled (Neon or Supabase both do this). Not reachable from the public internet except by the API's credential.

**Backups.** A nightly job (a GitHub Actions schedule is enough) produces two kinds of dump, encrypts each with `age` to a backup key, and uploads them to two buckets at two different vendors, for example Cloudflare R2 and Backblaze B2. One whole-database dump for disaster recovery, kept 14 days. One per-workshop export for each workshop, kept for the life of that workshop and deleted with it, so one workshop's deletion date never depends on another's. A monthly restore drill into a scratch database with an automated row-count comparison.

**Monitoring.** External uptime checks on the client URL and the health endpoint, alerting both of you by email and phone (Better Stack or UptimeRobot, free tiers are fine). A daily synced-answers count with an alert on zero during active weeks.

**Deploys.** Main branch deploys automatically after tests pass. Preview deploys for every change. Database migrations are additive only during the project: never rename or drop a column while data is live.

**Accounts and ownership.** Every account (domain registrar, DNS, CDN, database vendor, backup buckets, GitHub, monitoring, password vault) is an organization account under your own company with two-factor authentication, not a personal account. Printed recovery codes for each are stored with the key envelopes. You are the only owner for now; the printed recovery codes and the vault's emergency contact stand in for a second owner. Alerts reach you on two channels, email and phone. Secrets live in the vault and in the vendors' secret stores, never in the repository or on a laptop. Billing on a card that does not expire during the project, with billing alerts on. The domain is registered for five years with auto-renew and registrar lock.

**Vendors.** Four suppliers at most: registrar and DNS and CDN and API at Cloudflare, database at Neon or Supabase, second backup bucket at Backblaze, code and CI at GitHub. Each is replaceable in a day because the client is static files, the API is one small codebase and the data is a Postgres dump.

## 12. Security controls

- Transport: HTTPS only, HSTS with preload, modern TLS.
- Content Security Policy that allows scripts, styles, images and connections only from your own origin. No inline scripts. This is what makes "the app talks only to us" checkable in any browser's network inspector, and what stops an injected script from sending anything anywhere.
- Permissions-Policy that denies microphone, camera and geolocation to the page, so the browser itself enforces "we never record audio."
- Referrer-Policy no-referrer. No cookies at all, which also means no cookie banner.
- No third-party resources: fonts, scripts and icons are self-hosted. No analytics. Aggregate numbers come from the database you already hold.
- Authentication by the anonymous code in a header; the server compares salted hashes. Rate limits per code and per endpoint. Body size limits. Join, and any request carrying an unknown code, are rate-limited hard so codes cannot be guessed.
- Input handling: parameterized queries through an ORM, strict schema validation on every request, answer length caps, text never rendered as HTML anywhere.
- No admin UI in the public app. Exports and operations are command-line tools run with credentials from the vault.
- Dependencies: as few as possible, lock file committed, automated update alerts, audit in CI.
- Logging: no request bodies, no IP addresses persisted anywhere you control. Vendor request logs off or at minimum retention. Stated on the trust page.
- Pre-launch: Mozilla Observatory, OWASP ZAP baseline, a manual authorization test (code A cannot read, write or delete participant B), invite replay and over-use tests, dependency audit.

## 13. Provable privacy: the trust page and the privacy panel

"Provable" splits into three honest tiers, and the page should say which is which.

1. **Checkable.** Claims an outsider can verify with standard tools, without trusting you. The browser enforces the Content Security Policy and the Permissions-Policy, and anyone can read those headers with a scanner or a one-line command. A technical participant can open the browser's network tab and watch every request go to one domain. Independent scanners such as Webbkoll (dataskydd.net) and Blacklight (The Markup) produce a shareable report of cookies, third-party requests and trackers for a URL; link to your own results. The source code is public and the footer shows the exact deployed version.
2. **Structural.** Guarantees that hold because of how the system is built, even if someone on the server side misbehaves: answers are sealed on the device to a key the server never has; the schema has no column for a name or an email; identity is a random code.
3. **Promised.** Things only you can know: that vendor logs are off, that backups are deleted on the stated date. These go in the privacy policy as dated commitments.

**The privacy panel**, one tap from every screen, is the live version of the page. It shows real values read from the running app, not static text:

- Your anonymous code, masked, with reveal and copy. "This is the only thing that identifies you to us."
- Cookies set by this app: 0. Read from the browser at that moment.
- Hosts this app has contacted since it opened: a list read from the browser's own resource timing record. It will contain one entry, your domain.
- Microphone, camera, location: blocked by policy for this app.
- What we store about you: the rows from `/me`, in plain words, with sizes.
- Last synced, and how many answers are stored on this device and on the server.
- Version and commit, linking to the source.
- Delete everything about me.

One caveat the panel itself should state: these counters are produced by the same app that makes the claims. They are honest, but the independent checks above are what make them believable.

**The trust page** text, in both your names:

1. What we store, the table from section 9 in plain words, with one real example row.
2. What we never collect, the list from section 6.4.
3. How it is protected. Your answers are encrypted on your device with the research team's key. Our servers store scrambled text they cannot read. The key fingerprint is printed here.
4. Check it yourself. The checkable tier above, with links.
5. Your controls. See everything we hold about you. Delete it, any time until 6 December 2026.
6. Who, where, until when. The partner owns the answers. They are stored in the United States. Collection closes 6 December 2026, the spreadsheet is produced in the week after, everything on the server is deleted on 5 February 2027, and the last backup copies expire within two weeks after that. A contact address.
7. The honest limit. Nobody can prove a server does not log. That is why the system is built so the server holds nothing worth stealing.

**Terms, privacy policy and consent.** No ethics board or legal obligation applies; this is a small grassroots experiment and the rigour is a choice. The two of us draft, the partner reviews. Both documents say what the trust page says in slightly more formal words, plus an informal data management plan in one short section: what is collected, where it is kept, who can read it and when, when it is exported, when it is deleted. The same section appears in the privacy panel. A one-screen consent step on first open: "my answers are anonymous and will be used by ... to imagine the future of local manufacturing." Short enough to read, honest enough to mean it.

## 14. Hand-off and end of project

From day one:

- Data ownership is written into the project agreement along with the dates. The partner receives data, never accounts; nothing in the hand-off depends on their IT.
- Dates, decided 23 October: newsletter 16 November 2026; collection and deletion requests close 6 December 2026; export in the week after; everything on the server and in backups deleted on 5 February 2027. The backup buckets' retention is set at setup so that nothing outlives that date.

At the end:

1. Close all waves and invites. Take a final backup.
2. On your machine, decrypt the final dump with the private key.
3. Scrub: an automated pass flags emails, phone numbers, URLs and capitalized names in answer text; a person reads the flagged items and decides. Five thousand short texts is a day or two of reading. Keep a scrub log.
4. Package: `answers.csv`, `sessions.csv`, `events.csv`, `cards.json` with every deck version, a data dictionary, the scrub log and a README. Participant ids in the package are fresh random pseudonyms, not the server ids.
5. Deliver what the partner expects: a spreadsheet. A Google Sheet plus the CSV files in a Drive folder shared with named accounts only, never "anyone with the link". Nothing readable goes to any shared folder before the scrub. Mid-project the partner gets counts; if they want to read answers before the end, you run the export and put a snapshot in the same restricted folder, and the trust page says this can happen.
6. Delete: the workshop's rows and its per-workshop backups on 5 February 2027, its key destroyed, a short deletion record kept. Whole-database dumps age out within 14 days after, and the trust page says so. The code repository stays; it contains no data.

## 15. Testing and launch checklist

**Automated**

- Deck engine: warm-ups then checkpoints, seeded determinism, dismiss and defer behaviour, no repeats across sessions until the deck is exhausted.
- Sync: idempotent upserts, retry safety, partial batch failure.
- Crypto: encrypt on a simulated client, decrypt with the test key, byte-for-byte match.
- API: schema validation, authorization, rate limits.

**Devices, on real hardware**

- iOS Safari, current and previous major version. The same app installed to the home screen.
- Android Chrome, and installed.
- Desktop Chrome, Safari and Firefox.
- Keyboard dictation on both phones.

**Failure drills**

- API down, answer cards, API up, everything synced.
- Installed app opened in airplane mode.
- Site data cleared, code typed on another device, participant continues with no repeated cards.
- Restore from a bucket dump into a scratch database.
- Decrypt a backup using the paper copy of the key, not the vault copy.
- From a borrowed machine, with only the vault and the paper copies, deploy and restore.
- Fire a real alert and confirm both phones get it.

**Security**

- Headers scan, ZAP baseline, manual authorization test, invite abuse tests, dependency audit.

**Pilot**

- 5 to 10 friendly people, one week, two sessions each, from a real newsletter test send. Review the sync metric, the data, and what people said about coming back.

**Go or no-go**

- Everything above green, monitoring and alerts proven on both channels, the borrowed-machine drill passed, key custody done, trust page and policy live, domain and billing dates written in the runbook.

## 16. Decisions

Taken on 23 October 2026 by Marco; the partner reviews.

1. **Forward control.** Wave link plus 3 personal invites per participant. The wave is open from the send on 16 November to the close on 6 December, cap 150 as a safety valve.
2. **Encryption.** Device-side to a research key. Marco holds the key, custody as in section 10. The partner never handles it and receives a spreadsheet.
3. **Rereading and revising.** No, on any device. What is written is written. No readable answer stays on the device.
4. **Deck.** Start at 3 warm-ups and 1 checkpoint per session, configurable in the deck file, tuned hands-on in week two. Checkpoints rotate through unseen cards first, then repeat.
5. **Visibility.** Personal only. Curated results reach participants later, outside the app.
6. **Waves and funnel numbers.** Wave recorded. Funnel: sent (newsletter tool), link opened (per-wave counter), started (participants), answers (events). To confirm with the partner.
7. **Dates.** Newsletter 16 November 2026. Collection and deletion requests close 6 December 2026. Export the week after. Delete everything 5 February 2027.
8. **Ownership.** Marco alone for now. Printed recovery codes and the vault's emergency contact stand in for a second owner.
9. **Ethics review.** None required. An informal data management plan goes into the terms and the privacy panel.
10. **Language and accessibility.** English only. Rely on the operating system's accessibility features; the app provides clean semantic structure and is checked with VoiceOver and TalkBack in hardening.
11. **Terms, privacy policy, consent.** Drafted by Marco with the integrator; the partner reviews.

Still open with the partner: the wave cap if their list is larger than 150, and whether they want a mid-project snapshot of answers. Neither blocks the build.

## 17. Suggested stack

One TypeScript repository:

- `apps/web`: Vite with Svelte or React (whichever you are faster in), `vite-plugin-pwa` for the service worker, Dexie for IndexedDB.
- `apps/api`: Hono on Cloudflare Workers, Drizzle ORM with migrations. The same code runs on Node if you ever move.
- `packages/deck`: the cards JSON and the deck engine, shared by the app and the tests.
- `packages/crypto`: thin wrapper over `libsodium-wrappers` for sealed boxes, shared by the app and the export tool.
- `tools/export`: the command-line export, decrypt, scrub and package tool.
- `tools/backup`: the nightly dump job, run by GitHub Actions.
- Database: Neon or Supabase Postgres, smallest paid plan, US region.
- CDN, DNS, Workers, first backup bucket: Cloudflare. Second bucket: Backblaze B2.
- Monitoring: Better Stack or UptimeRobot.

If you would rather have a single backend vendor, Supabase (Postgres plus Edge Functions) also fits, with the client still on Pages.

## 18. What to revisit if it grows

- Workshops run by other people: a web form that creates a workshop instead of a folder in the repository, with its own key handling.
- An admin web UI with passkeys instead of command-line tools.
- A native wrapper (Capacitor) around the same web app for store distribution.
- Participants seeing curated excerpts of others' answers, after a scrub.
- A formal vendor and security review if a larger institution becomes the data owner.
