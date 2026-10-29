# 08. Backups: dumps, sealing with age, Object Lock, a heartbeat

## The idea

A database vendor's own recovery is short on a free tier: Neon can roll back six hours. A backup is a copy you hold yourself, made by a tool you understand, kept at companies that have nothing to do with the database, encrypted so the copy itself is harmless, and watched so that a backup that silently stops is noticed before it is needed. Four pieces do that here.

- **A logical dump.** `pg_dump` writes the whole database as SQL text: the statements that create each table, then the rows. Any Postgres loads it back with `psql`. It is the most boring and portable form a database can take, and it is readable with `less`.
- **Sealing with `age`.** `age` is a small file-encryption tool with the shape of the sealed boxes in note 01, for whole files: a public key (`age1...`) encrypts, only the matching private key decrypts. The job holds the public key and nothing else, so a stolen runner, bucket or artifact yields a file nobody can open. The private key lives in the vault and on paper, like the workshop keys.
- **Object Lock.** A bucket setting: for a number of days after upload a file cannot be deleted or replaced, not even by the key that wrote it. So the job's key can add backups and cannot destroy recent ones. A lifecycle rule removes files once the lock has expired, so copies do not pile up past the two weeks the trust page promises.
- **A heartbeat.** Monitoring turned around. Instead of a monitor asking "are you up?", the job tells a URL "I finished" once a day. When the message does not come, Better Stack alerts. A job that stopped, a workflow someone disabled, a secret that expired: each becomes a morning alert instead of a discovery on the day a restore is needed.

## Why it is here

Section 11 of the architecture plan, ADR 0011, and a promise on the trust page: everything on the server is deleted on 5 February 2027 and the last backup copies expire within two weeks after that. Two copies at two vendors, Backblaze and GitHub, so that losing one account loses nothing. The device re-sync (note 06) covers the hours between last night's dump and an outage: the phones re-send what the server lacks.

## The procedure in this repository

The job lives in the private ops repository, `world-builder-ops`, so that a mistake there can never print a connection string into a public log. The app's part is the `backup_runs` table and the `lastBackupAt` field of `/api/health`, which reports the newest good run.

`.github/workflows/backup.yml` runs at 07:17 UTC and on demand, one job per database. A job whose connection string is not set is skipped with a notice. Each job installs `pg_dump` 18 (Neon runs Postgres 18, and `pg_dump` refuses a server newer than itself) and `age`, then runs `scripts/backup.sh`, which does five things in order:

1. `pg_dump`, plain SQL, through `gzip`, then `age -r <public key>`: one file, `<target>-database-<stamp>.sql.gz.age`.
2. For each workshop in the database: that workshop's rows from every table, as one CSV per table, in one tar, sealed the same way: `<target>-workshop-<slug>-<stamp>.tar.gz.age`. A slug is checked against the shape the contracts give it before it appears in a query or a file name.
3. Upload to the Backblaze bucket with the AWS command line (Backblaze speaks the S3 protocol), under `<target>/database/<day>/` and `<target>/workshops/<slug>/<day>/`. The workflow then keeps the same files as the run's artifact.
4. A `backup_runs` row per file in the database the file came from, and `delete from rate_buckets where window_start < now() - interval '1 hour'`, the housekeeping the schema assigns to the nightly job.
5. `curl` to the heartbeat. A failed run calls the heartbeat's `/fail` address instead.

Nothing in the script prints a value from the environment: log lines name a step, a file or a count. `scripts/test-backup.sh` runs the script with stand-ins for `pg_dump`, `psql`, `age`, `aws` and `curl` and checks the file names, the bucket keys, the rows, the heartbeat, the refusal of a malformed slug, and that none of the stand-in secrets reached a log or a file. It runs on a laptop with nothing installed and in the ops repository's CI.

Retention is 14 days in three places and for one reason: the bucket's default Object Lock (governance mode, 14 days), the bucket's lifecycle rule (hide after 14 days, delete a day later), and the artifact's retention. The trust page's "within two weeks" is what sets the number.

## How to check it yourself

```
git clone git@github.com:m-under-over-through/world-builder-ops.git && cd world-builder-ops
bash scripts/test-backup.sh                 # ok: 13 checks passed, nothing installed
gh workflow run backup.yml -f target=staging && gh run watch
curl -s https://staging--worldbuilder-uot.netlify.app/api/health   # "lastBackupAt" is today
```

Then open the run under Actions: the log of "Back up" reads `dumping the database`, `sealed ...`, `uploading to world-builder-backups`, `recording the run`, `heartbeat sent`, `done: N sealed files`. Backblaze, Browse Files, shows today's folder. Better Stack shows the heartbeat up.

The decrypt check, with the key from the vault in a file you delete afterwards (`chmod 600`; the script refuses a key file that others can read, and the key is never an argument):

```
AGE_IDENTITY_FILE=backup.age.key scripts/unseal.sh staging-database-<stamp>.sql.gz.age
opened staging-database-<stamp>.sql.gz, <n> bytes
a database dump: 9 tables, <n> sealed answers
```

Nine tables: our eight and Drizzle's migrations table. A sealed answer is a row whose body is `v1.` followed by base64, which is all the backup ever holds of an answer. Only the workshop's private key opens it (note 01), and that key is not in this picture at all.

## Restoring: the drill

A backup nobody has restored is a hope. The ops repository's `scripts/restore.sh` is the restore drill: it opens a dump (through `unseal.sh`), checks that the target holds no tables, loads the plain SQL with `psql`, and prints one count per table, next to the same counts on the source when `SOURCE_URL` is given. The procedure, with the expected observations and the click path for a scratch branch and database in Neon, is `runbook/restore-drill.md` there; the first run is Friday 30 October.

Three refusals carry the safety. The target variable is `RESTORE_URL`, never `DATABASE_URL`, so a line copied from the job cannot point a restore at a live database. A database that already holds tables is refused unless `REPLACE=yes`, which the drill page allows only for a database made for the drill. A pooled connection string and a dump without our tables are refused before anything is loaded. The last line of a run, `events with a sealed body: n; with any other body: 0`, is the privacy check: a restore puts back envelopes, never answers.

`scripts/test-restore.sh` runs both scripts with stand-ins for `age` and `psql` (gzip and tar are real) and checks the opened files, the report lines, the order of the statements, the counts and every refusal: 12 checks, on a laptop with nothing installed and in the ops repository's CI.

## What can go wrong

- **`pg_dump: error: server version mismatch`.** The runner's default client is older than Neon's server. The install step takes the client from the PostgreSQL project's own package repository; when Neon moves to a newer major, raise the number there.
- **The upload fails with a checksum error.** Newer AWS command lines add integrity checksums Backblaze does not accept; two environment variables in the workflow turn them off.
- **The lock and the lifecycle rule disagree.** A lifecycle rule cannot delete a locked file; it waits. Keep the lock at or below the lifecycle's hiding day, or files linger.
- **The private key is lost.** Every backup becomes unreadable at once. Vault plus two printed copies; the Friday decrypt drill proves the copy in the vault works.
- **The heartbeat alerts while runs are green.** The heartbeat URL is empty for that target (the log says `skipped`), or its period is shorter than a day.
- **A run is skipped with "No connection string".** Expected until that target's secret exists; production's comes in hardening week.
- **A Neon branch disappears, and the build says `password authentication failed`.** Neon's Create branch dialog defaults to deleting a new branch after one day. A branch left on that default goes a day later, compute and all, and a connection to the vanished compute is refused with the password message, not with an unknown host. The default branch cannot expire. Set Auto-delete to never for any branch that must stay (`staging`); leave the day on the drill branch, which is meant to go. This is what took staging down on 29 October 2026.

## What it does not do

The job does not test a restore; the drill above does, by hand, into a scratch database, with the counts compared against the source. It does not back up the Netlify configuration or the secrets; the vault is their backup. It does not make answers readable: a backup holds ciphertext, and only the workshop's private key opens an answer, on the operator's machine. It does not run on a laptop against a real database; the stand-in test runs there, the real run only ever in Actions, which is where the connection string is.
