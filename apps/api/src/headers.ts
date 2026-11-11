/**
 * The security headers on every API response (architecture plan, sections 12 and 13).
 *
 * Why the API sets them itself: Netlify applies apps/web/public/_headers to the static files it
 * serves and not to what a function returns. The security pass of 11 November 2026 scanned
 * staging and found `/api/health` without the policy, the referrer rule, the framing rule and the
 * three cross-origin rules (docs/build-log.md). A JSON response cannot run a script, but a browser
 * still applies these to it: no-referrer for anything it links, no framing, no sniffing it into
 * HTML, no reading it from another origin.
 *
 * The values are the `/*` block of _headers, word for word, so one rule holds for the whole
 * origin; apps/api/test/headers.test.ts reads that file and fails when the two drift apart.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * One more, for the API only: no cache may keep a response. `/me` carries a participant's sealed
 * rows and their invite count, and a phone is sometimes shared; nothing an API route answers is
 * worth keeping.
 */
export const API_ONLY_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
};

/** Sets both sets on a response's headers, replacing any value already there. */
export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  for (const [name, value] of Object.entries(API_ONLY_HEADERS)) headers.set(name, value);
}
