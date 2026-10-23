# 0006. Wave links with a window and a cap, plus three invites; no per-recipient tokens

Date: 2026-10-23. Status: accepted.

## Context

The link goes out in a newsletter anyone can forward. The partner wants some control over spread but anonymity forbids knowing who shared with whom.

## Decision

- One generic wave link per newsletter send, `/<slug>/join/<wave>`, accepting joins between the workshop's open and close days up to a cap (150 for the first workshop).
- Each participant can create up to three single-use invite links. The server records that an invite was spent and that a token was used; the new participant's row does not point back to the issuer. `invites.used` is a boolean, not a date, so quiet-day correlation is not possible.
- The wave page increments a per-wave "opened" counter with no cookie and no address, giving the partner a rough funnel: sent, opened, started, answered.
- Newsletter click tracking is turned off for this link.

## Consequences

- The only control on a forwardable link is time and a cap; that is accepted.
- The funnel numbers are approximate (repeat opens count again) and about nobody in particular.

## Alternatives not taken

- Per-recipient tokens in the newsletter: exact control, but the newsletter vendor's export would map tokens to emails.
