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
- [ ] Usage warnings need no setting: Netlify emails the team owner automatically at 50, 75 and 100 percent of the build-minute allowance. Make sure the team owner's address is one you read. There is no alert for bandwidth on the free plan, so the usage page (Billing, Account usage insights) is part of the weekly check.
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

## 5. Netlify, the staging secrets, ten minutes (28 October)

What it is for: the staging deploy needs two values that must never enter the repository. They are environment variables on the Netlify project, read by the build (migration, workshop sync) and by the function (database, keyed hash of codes). A deploy context is Netlify's word for "which kind of deploy": Production is the `main` branch, Branch deploys is the `staging` branch, Deploy Previews are pull requests. Each context can hold its own value of the same variable, so staging and production never share a database or a pepper.

Make the pepper first, on this laptop:

```
node tools/ops/pepper.ts staging        # writes .secrets/staging.pepper, shows nothing
pbcopy < .secrets/staging.pepper        # now on the clipboard
```

- [ ] In Netlify: **Projects**, `worldbuilder-uot`, left column **Project configuration**, then **Environment variables**. Press **Add a variable**, then **Add a single variable**.
- [ ] **Key:** `WB_PEPPER`.
- [ ] Tick **Contains secret values**. Netlify then hides the value after saving, redacts it from build logs, and fails any build whose output contains it. All three are wanted.
- [ ] **Scopes:** nothing to do. With the secret flag on, the free plan locks the scopes to Builds, Functions and Runtime and leaves out Post processing; Builds and Functions are the two the code needs. The "Upgrade to unlock" button is for narrowing them further, which is not needed.
- [ ] **Values:** choose **Different value for each deploy context**. Add the value for **Deploy Previews** and again for **Branch deploys** (paste both times). Leave **Production** without a value; it gets its own pepper in hardening week. Leave Local development empty.
- [ ] **Create variable**.
- [ ] Paste the same value into Bitwarden as a secure note "World Builder: staging pepper", then `rm .secrets/staging.pepper` and copy any harmless text so the clipboard no longer holds it.

Then the connection string:

- [ ] In Neon: project `world-builder`, pick the branch `staging` in the branch selector at the top, press **Connect**. In "Connect to your branch" keep database `neondb` and role `neondb_owner`; the **Connection pooling** toggle can stay as it is, both forms work with the HTTP driver. Copy the full string; it starts with `postgresql://` and contains the password.
- [ ] In Netlify, the same form again: key `DATABASE_URL`, same scopes, **Contains secret values** ticked, different value per context, the string under **Deploy Previews** and **Branch deploys**, nothing under Production.
- [ ] Into Bitwarden as "World Builder: Neon staging connection string".
- [ ] Say so in the session. The `staging` branch is then created from the skeleton, and its first build log shows the migration and the workshop sync running against Neon, then `https://staging--worldbuilder-uot.netlify.app/api/health` reports the database.

Two things worth knowing. A new or changed variable reaches only deploys made after the change, so set both before the branch exists. And because the repository is public, Netlify's default policy keeps secret variables away from deploy previews of pull requests that come from forks; the build is written to do nothing with the database when the values are missing, so such a preview still builds, it only has no API.

## After the three

Send the non-secret identifiers (Neon project id and region, bucket name and endpoint, team name) for the ops repository's runbook pages. Send nothing that opens anything. Then the partner's name for the workshop file, and the domain's auto-renew and holding account for the runbook.
