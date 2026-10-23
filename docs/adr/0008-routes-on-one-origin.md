# 0008. The client and the API share one origin: `/<slug>/` and `/api/<slug>/`

Date: 2026-10-23. Status: accepted.

## Context

The trust page claims the app talks to one host, enforced by a Content Security Policy of `self` only. The client is static files on a CDN; the API is a Worker.

## Decision

Both are served from the same domain. Paths starting with `/api/` go to the Worker; everything else is static. The wave and invite landing pages are client routes under `/<slug>/join/...`; the client calls the API to count the open and to join.

## Consequences

- `connect-src 'self'` is enough; no CORS at all.
- A technical participant sees one host in the network tab.
- Moving the API elsewhere later would require a second host in the policy; avoid.
