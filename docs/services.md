# Services

Draft 0.3, 24 October 2026. Companion to the architecture and risk plan. Revised for the zero-cost setup (ADR 0011): this is an experiment, and an experiment must cost nothing to keep alive. The earlier drafts bought operational margin with about 10 to 20 USD a month; none of the privacy or security properties lived there.

**The rule, revised.** Free tiers everywhere, with the three things that free tiers take away covered in code and procedure: a short database restore window (covered by nightly dumps and by the device keeping its synced envelopes for two weeks), a usage allowance that can pause the site (covered by alerts and an emergency upgrade), and thinner logs (covered by the health endpoint, the diagnostics view and the error codes). Every account has one owner (you), two-factor authentication on, printed recovery codes with the key envelopes, and an entry in the runbook saying what breaks if it goes away.

## 1. What you already have, and how it is used

**under-over-through.co and Netlify.** The app lives at `worldbuilder.under-over-through.co`, with the workshop in the path. Netlify already hosts the domain's DNS and the main site; it now also hosts the app: static files for the client, Netlify Functions for the API on the same hostname, and the subdomain is one record in the same dashboard. The free plan's limits (100 GB of bandwidth, 300 build minutes, 125,000 function calls a month) are far above this load; its one real risk is that a site over its allowance is paused until the next month or an upgrade, so Netlify's usage alerts are turned on and the upgrade path is rehearsed once. The main site sets no cookies and loads no third-party scripts, so the subdomain inherits nothing that contradicts the trust page.

**Google Workspace.** The `privacy@under-over-through.co` contact address is an alias or group there.

**GitHub, the UOT account.** The public app repository and the private ops repository, as before. GitHub Actions in the ops repository also runs the nightly backup and keeps each encrypted dump as a workflow artifact, which makes GitHub the second backup vendor at no cost.

**Bitwarden Premium.** The vault, with Emergency Access as the "if I am unreachable" plan. Ten dollars a year, already paid.

## 2. The set

| Role                  | Service                                                        | Tier          | Monthly cost | Why this one                                                                                                                                                                                                                    | If it vanished tomorrow                                                      |
| --------------------- | -------------------------------------------------------------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Hostname and DNS      | `worldbuilder.under-over-through.co` at Netlify DNS            | Existing      | 0            | One record in the dashboard you already use. Registrar Tucows, expiry 29 July 2027, in the runbook.                                                                                                                             | Any DNS host; the record is one line.                                        |
| Static client and API | Netlify site with Netlify Functions                            | Free          | 0            | Already yours. Deploys from the GitHub repository with previews per branch; the API is a function on the same hostname so client and API share one origin. Pause risk covered by alerts.                                        | Static files and one small Hono app redeploy on Cloudflare Pages in an hour. |
| Database              | Neon Postgres                                                  | Free          | 0            | Managed Postgres in US East, the same region as Netlify's functions. 100 compute hours and 0.5 GB a month, far above this load; compute sleeps when idle. Six-hour restore window, covered by the dumps and the device re-sync. | Restore last night's dump into any Postgres.                                 |
| Backup copy A         | Backblaze B2 bucket                                            | Free, 10 GB   | 0            | A different company from everything else; Object Lock so a stolen backup key can write but not destroy.                                                                                                                         | Copy B.                                                                      |
| Backup copy B         | GitHub Actions artifact in the ops repository                  | Free          | 0            | The job that makes the dump keeps it, 30 days, inside the private repository's storage.                                                                                                                                         | Copy A.                                                                      |
| Uptime and alerts     | Better Stack                                                   | Free          | 0            | Ten monitors and heartbeats, three-minute checks, email alerts plus the mobile app's push. A heartbeat from the backup job turns a silently stopped backup into a morning alert. Phone calls would be a paid seat.              | UptimeRobot in ten minutes.                                                  |
| Password vault        | Bitwarden Premium                                              | Paid, already | under 1      | Credentials, the private keys, Emergency Access.                                                                                                                                                                                | The paper copies.                                                            |
| Contact mailbox       | Google Workspace alias                                         | Existing      | 0            | `privacy@under-over-through.co`.                                                                                                                                                                                                | Any alias.                                                                   |
| Final delivery        | The partner's Google Drive                                     | Theirs        | 0            | A Sheet and the CSV files in a folder shared with named accounts only, after the scrub.                                                                                                                                         | Any restricted file share.                                                   |
| Newsletter            | The partner's existing tool                                    | Theirs        | 0            | Click tracking off for the project link; the URL printed in plain text.                                                                                                                                                         | Not your system.                                                             |
| Independent scanners  | Mozilla Observatory, securityheaders.com, Webbkoll, Blacklight | Free          | 0            | Third-party reports to link from the trust page.                                                                                                                                                                                | Any of the others.                                                           |

Running cost: zero a month beyond the vault's ten dollars a year. New accounts to open: Neon, Backblaze, Better Stack, all free.

## 3. Deliberately not used

- **Cloudflare.** The earlier choice for the client, the API and the first bucket. Netlify does the same on a plan you already have, with the domain's DNS in the same place. Cloudflare's free Pages would avoid the pause risk, at the price of a fourth vendor; the pause risk is small at this scale and has an emergency lever.
- **Paid database tiers.** Neon's Launch plan would bring a seven-day restore window. The nightly dumps and the device re-sync cover a six-hour window well enough for an experiment.
- **A new domain, moving DNS to Cloudflare, analytics, error reporting, Google Fonts, CAPTCHA, an email-sending service, a self-administered server.** As in the earlier drafts: each adds a vendor, a cost, or a third host the app would talk to.

## 4. The emergency levers, so they are decided now and not during an incident

- **Netlify pauses the site.** Upgrade the site's team to the paid plan for one month; it unpauses within minutes. About 19 USD, once.
- **Neon's free limits are reached.** Switch the project to the Launch plan; it is usage-based with no minimum, so a month of real traffic costs a few dollars.
- **Backblaze's free 10 GB fill up.** Impossible at a few megabytes a night; the spending cap set at signup is the guard.

## 5. Account hygiene, once at setup

- Every account under the UOT identity or a role address, never a personal login.
- Two-factor on everywhere, with an authenticator app, not SMS. Recovery codes printed and stored with the key envelopes.
- Netlify's usage notifications on; Backblaze's spending cap set; Neon's usage page checked weekly for the first month.
- The domain's auto-renew and holding account confirmed in the runbook.
- A page in the runbook per service: what it does, where the login is, what breaks without it, how to move off it.
