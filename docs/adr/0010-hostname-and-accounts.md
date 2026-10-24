# 0010. A subdomain of under-over-through.co, DNS at Netlify, the existing UOT GitHub account

Date: 2026-10-23. Status: accepted. Name chosen on 24 October 2026: `worldbuilder`. Amended the same day by ADR 0011: the client and the API are on Netlify, not Cloudflare, and the CNAME points at the Netlify site; the hostname and account decisions below stand.

## Context

The plan assumed a new, neutral domain and a new GitHub organization. Marco asked whether a subdomain of his own domain, under-over-through.co, and his existing UOT GitHub account would do. Checked the same day: the domain's DNS is hosted at Netlify (NS1), mail is Google Workspace, the main site is on Netlify, sets no cookies and loads no third-party scripts, and its HSTS header does not cover subdomains.

## Decision

- The app lives at `worldbuilder.under-over-through.co`, with the workshop in the path as before. The name has no underscore, because certificate authorities refuse to issue for such names.
- DNS stays at Netlify. One CNAME record points the subdomain at the Cloudflare Pages project. Nothing else in the zone changes.
- The client is served by Cloudflare Pages and the API by Pages Functions, which are Workers under the Pages project, on the same hostname. The Workers paid plan is kept for logs and limits.
- The `privacy@` contact is a Google Workspace alias.
- Both repositories live under the existing UOT GitHub account. No organization while there is a single owner.
- The domain's registrar, expiry date and auto-renew setting are recorded in the runbook.

## Consequences

- Participants see the organizer's own domain, which is a better trust signal than an unfamiliar new name.
- One registration fewer to keep alive, and the one that remains is the one the business already watches.
- The app's availability now shares fate with the domain's DNS and registration. Both are already business-critical and the runbook names them.
- The main site sets no domain-wide cookies today, so "cookies set by this app: 0" stays true. If that ever changes on the main site, the subdomain would see those cookies too; the trust page wording "set by this app" is exact for that reason.
- Moving to an organization later is a repository transfer with redirects; nothing in the code refers to the account name.

## Alternatives not taken

- A new neutral domain: one more registration, no recognition.
- Moving the whole zone to Cloudflare DNS: one dashboard, but recreating mail and site records by hand on the business domain.
- Hosting the app on Netlify: one vendor, but the free plan pauses sites over their allowance and the API would need a second vendor regardless.
