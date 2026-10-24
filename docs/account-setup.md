# Account setup, revised 24 October 2026 for the zero-cost setup

Three free accounts to open: Neon, Backblaze, Better Stack. Cloudflare is no longer used (ADR 0011). Netlify, GitHub, Google Workspace and Bitwarden you already have. Menu names are as of October 2026 and may have moved a little; the intent of each step is what matters. Tick as you go.

## Before any of them

- [ ] **One identity for all of them.** A role address on your Google Workspace, for example `ops@under-over-through.co`, forwarded to you.
- [ ] **Email and password where the vendor allows it**, not "continue with GitHub" or "with Google", so one compromise cannot cascade. Bitwarden generates each password.
- [ ] **Two-factor with an authenticator app**, never SMS. Print each account's backup codes and store them with the key envelopes.
- [ ] **A Bitwarden item per account** in the World Builder folder, with the account id and the plan in the notes.
- [ ] **Create nothing with a secret in it today** (application keys, connection strings, tokens). Each is created when the job that needs it is built, scoped to that job, and stored in the vault then.

## 1. Netlify, five minutes, already yours

- [ ] Confirm two-factor is on for the account that holds the DNS; print its backup codes if you never have.
- [ ] Team settings, Notifications: turn on usage alerts for bandwidth, build minutes and function calls. These are the early warning for the free plan's pause.
- [ ] **Leave for Tuesday:** the site itself, created from the `world-builder` GitHub repository when there is something to deploy, and the CNAME for `worldbuilder` once the site has a name.

## 2. Neon, ten minutes

What it is for: the only stateful thing you run.

- [ ] Sign up at `neon.tech` with email if offered; otherwise with the Google Workspace identity, which has two-factor.
- [ ] Two-factor if the account settings offer it; backup codes printed.
- [ ] Stay on the **Free** plan. Note its limits in the runbook: 100 compute hours and 0.5 GB of storage a month, a six-hour restore window.
- [ ] Create a project named `world-builder`, region **US East (Ohio)**, which is where Netlify's functions run, newest Postgres offered.
- [ ] Branches: the default branch is production. Create a branch named `staging` from it; it becomes staging's database on Tuesday.
- [ ] **Leave for Tuesday:** roles and connection strings.
- [ ] Record: project id, region, the two branch names.

## 3. Backblaze B2, ten minutes

What it is for: the backup copy at a different company from everything else.

- [ ] Sign up at `backblaze.com`, B2 Cloud Storage, with the role address.
- [ ] Account, Security: two-factor with an authenticator app; backup codes printed.
- [ ] Caps & Alerts: set a low daily cap (a few dollars). The first 10 GB are free and the dumps are a few megabytes a night, so the cap is only a guard. A card is asked for only if you raise the cap above the free allowance.
- [ ] Buckets, Create: name `world-builder-backups`, private. Turn **on** Object Lock at creation; it cannot be added later. Default encryption on.
- [ ] **Leave for Thursday:** application keys, scoped to this bucket, write and list, no delete.
- [ ] Record: bucket name, S3 endpoint and region from the bucket page.

## 4. Better Stack, ten minutes

What it is for: knowing before participants do, and knowing when the backup stops.

- [ ] Sign up at `betterstack.com`, Uptime, with the role address. Two-factor on; backup codes printed.
- [ ] Install the mobile app and sign in; push notifications are free and are the second channel after email.
- [ ] Create the team `World Builder`; on-call is you, always.
- [ ] **Leave for Tuesday and Thursday:** the monitors (client URL, health endpoint checking for `"ok":true`) and the backup heartbeat.
- [ ] Record: the login and the team name.

## After the three

Send the non-secret identifiers (Neon project id and region, bucket name and endpoint, team name) for the ops repository's runbook pages. Send nothing that opens anything. Then the partner's name for the workshop file, and the domain's auto-renew and holding account for the runbook.
