# Account setup, 24 October 2026

The order to open the remaining accounts, what to set in each, what to record, and what to leave for later. Menu names are as of October 2026 and may have moved a little; the intent of each step is what matters. Tick as you go.

## Before any of them

- [ ] **One identity for all of them.** Use a role address on your Google Workspace, for example `ops@under-over-through.co`, forwarded to you, rather than a personal mailbox. Vendor mail then arrives labelled, and the accounts do not depend on one person's inbox.
- [ ] **Sign up with email and password where the vendor allows it**, not "continue with GitHub" or "with Google". Linking vendors to one login means one compromise cascades. Bitwarden generates each password.
- [ ] **Two-factor with an authenticator app on every account**, never SMS. Print each account's backup codes and store them with the key envelopes.
- [ ] **A Bitwarden item per account** in the World Builder folder: login, password, the URL, and in the notes the account id and the plan.
- [ ] **Create nothing with a secret in it today** (API tokens, application keys, connection strings). Each is created when the job that needs it is built, scoped to that job, and stored in the vault then.

## 1. Cloudflare, about twenty minutes

What it is for: the static client and the API (Pages with Functions) and the first backup bucket (R2).

- [ ] Sign up at `dash.cloudflare.com`. Verify the email.
- [ ] Profile, Authentication: two-factor with an authenticator app; print the backup codes.
- [ ] Billing: add the card. Then Workers & Pages, Plans: the Workers Paid plan (about 5 USD a month). It removes the daily request cap and turns on request logs, which you need to see what is failing.
- [ ] R2: enable it (the card is required even for the free tier), then create a bucket named `world-builder-backups`, location hint North America, no public access. Leave it empty.
- [ ] **Do not** add `under-over-through.co` as a zone. The dashboard will offer to; that path moves your nameservers. The app's hostname is attached to the Pages project later, through the CNAME at Netlify.
- [ ] **Leave for Tuesday:** the Pages project. It connects to the GitHub repository through Cloudflare's GitHub app, which you will install on the `m-under-over-through` account scoped to the `world-builder` repository only.
- [ ] Record in the vault notes: the account id (Overview page, right-hand side), the plan, the bucket name.

## 2. Neon, about fifteen minutes

What it is for: the only stateful thing you run. Managed Postgres with point-in-time restore. Neon has branches, so staging gets its own database inside the same project.

- [ ] Sign up at `neon.tech` with email if offered; otherwise with the Google Workspace identity, which has two-factor.
- [ ] Two-factor if the account settings offer it; backup codes printed.
- [ ] Plan: the smallest paid plan, called Launch at last check (about 19 USD a month). Not the free tier: free projects can be suspended for inactivity, and the paid plan includes the restore window.
- [ ] Create a project named `world-builder`, region US East, the newest Postgres offered (17 or 18).
- [ ] Project settings: set the restore window (history retention) to the maximum the plan allows, seven days at last check.
- [ ] Branches: the default branch is production. Create a branch named `staging` from it. It is empty now; it becomes staging's database on Tuesday.
- [ ] **Leave for Tuesday:** roles and connection strings. The API builder gets them from the vault.
- [ ] Record: project id, region, the two branch names.

## 3. Backblaze B2, about ten minutes

What it is for: the second backup bucket, at a different company from the first.

- [ ] Sign up at `backblaze.com`, B2 Cloud Storage, with the role address.
- [ ] Account, Security: two-factor with an authenticator app; backup codes printed.
- [ ] Billing: add the card, then Caps & Alerts: set a low daily cap (a few dollars) so a runaway job cannot run up a bill.
- [ ] Buckets, Create: name `world-builder-backups-b`, private. Turn **on** Object Lock at creation; it cannot be added to a bucket later. It lets the backup job later mark each dump as undeletable for a set number of days, so a stolen backup credential can write but not destroy the last month of backups. Default encryption on.
- [ ] **Leave for Thursday:** application keys. The backup job gets a key scoped to this one bucket, with write and list capabilities and no delete.
- [ ] Record: bucket name, the bucket's S3 endpoint and region shown on the bucket page.

## 4. Better Stack, about ten minutes

What it is for: knowing before participants do. Uptime checks on the client URL and the health endpoint, alerts to your phone, and later a heartbeat that the backup job pings after each run, so a silently stopped backup is an alert the next morning.

- [ ] Sign up at `betterstack.com`, Uptime, with the role address. Two-factor on; backup codes printed.
- [ ] Install the Better Stack mobile app and sign in; push notifications are free and are the second channel after email. Phone-call alerts are a paid tier; decide for launch week.
- [ ] Create the team or workspace `World Builder`. Set the on-call schedule to you, always.
- [ ] **Leave for Tuesday:** the monitors. There is no URL yet. On Tuesday: the client URL, the health endpoint with a check that the body contains `"ok":true`, and a heartbeat for the backup job on Thursday.
- [ ] Record: the login and the team name.

## After the four

Send the non-secret identifiers (account ids, project id, region, bucket names and endpoints, team name) and they go into the ops repository's runbook pages. Send nothing that opens anything.

Then the two leftovers from the list: the partner's name for the workshop file, and the domain's auto-renew and the account that holds it, for the runbook.
