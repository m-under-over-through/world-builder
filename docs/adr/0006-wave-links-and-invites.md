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
- The funnel numbers are approximate (see the amendment below on what "opened" counts) and about nobody in particular.

## Alternatives not taken

- Per-recipient tokens in the newsletter: exact control, but the newsletter vendor's export would map tokens to emails.

## Amendment, 29 October 2026: an open is counted once per device, and the wave stays in the address bar

The first phone test of staging showed that a page which cleaned its own address lost the wave: the client replaced `/<slug>/join/<wave>` with `/<slug>/` after counting the open, and that cleaned address is what Safari's tabs from other devices, the share sheet and a copied address carried. Two things differ from the text above:

- **The wave stays in the address bar.** A wave is not a secret; the link is in a newsletter. Only an invite link is still replaced by `/<slug>/`, because its token works once and must not linger or travel.
- **"Opened" counts devices, not page loads.** The device remembers the wave it arrived with and asks the API to count the open only the first time it arrives through that wave. A reload or a later visit does not count again; a cleared browser or a second device does. Still no cookie and no address, still approximate, still about nobody in particular.
