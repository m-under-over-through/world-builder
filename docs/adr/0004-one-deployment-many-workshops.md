# 0004. One deployment serves many workshops; a workshop is a folder

Date: 2026-10-23. Status: accepted.

## Context

The same experience will run for other groups, starting with a worldbuilding class at the end of November 2026. A solo operator cannot run a monitor, a database and a backup job per workshop.

## Decision

- A workshop is `workshops/<slug>/` with `workshop.json` (settings and public key), `deck.json` (cards) and `copy.md` (text). Deploying the repository deploys every workshop.
- Every table with participant data carries a workshop id; every query filters on it; a test proves a code from one workshop gets nothing from another.
- One key pair per workshop, so each dataset is exported, handed over and deleted on its own, and a cross-workshop bug would expose text sealed to a different key.
- Backups are a short-lived whole-database dump plus a per-workshop export deleted with the workshop.
- Routes are prefixed by slug: the client at `/<slug>/`, the API at `/api/<slug>/`. Device storage is namespaced by slug. Each workshop has its own install manifest.
- The hostname is the organizer's own, not a partner's, so the next workshop lives on the same one (ADR 0010).

## Consequences

- Spinning up a workshop: copy a folder, edit three files, run `workshop keygen`, commit. Under an hour, no code changes.
- Scoping costs about half a day in week one. Retrofitting after launch would be a migration under live traffic.
- Deleting one workshop on its date does not depend on another's; whole-database dumps age out within 14 days and the trust page says so.

## Alternatives not taken

- One deployment per workshop (strongest isolation, N times the operations and the cost).
- Subdomain per workshop (cleaner URLs, needs wildcard DNS and routing; can be added later without changing the data model).
