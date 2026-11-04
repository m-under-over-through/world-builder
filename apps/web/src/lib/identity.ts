import { CODE_DIGITS } from '@wb/contracts';

/**
 * Identity by the link (ADR 0018). The newsletter puts a value of its own in each recipient's
 * link, after the `#`: `/<slug>/join/<wave>#p=<value>`. What follows `#` stays in the browser: it
 * is not sent to Netlify or to the API, not written in a log, not passed on as a referrer. The
 * client turns the value into the 16-digit code with a one-way hash, and from there on the code
 * is the code as before (ADR 0002): a header, a keyed hash on the server. The value itself never
 * enters a request, a stored row or an address the app writes.
 */

/** A value is any run of letters, digits, `-` and `_`, 4 to 80 characters. Its shape means nothing else to the client. */
const VALUE = /^[A-Za-z0-9_-]{4,80}$/;

/**
 * The value in a fragment such as `#p=abc123`, or null. Only the fragment is read: a value in the
 * path or the query would reach the server's logs, which is the one thing this design avoids.
 * The fragment may carry other parameters next to `p`; only `p` is read.
 */
export function valueFromHash(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return null;
  for (const part of fragment.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq) !== 'p') continue;
    const value = part.slice(eq + 1);
    return VALUE.test(value) ? value : null;
  }
  return null;
}

/**
 * The 16-digit code a value makes: SHA-256 of the value's UTF-8 bytes, the digest read as one big
 * decimal number, and its first sixteen digits. The same value makes the same code on every
 * device, which is what lets a second phone continue (ADR 0018). The rule is fixed: changing it
 * would make every link a new participant. A test pins it with one vector.
 */
export async function codeFromValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  // A digest below 10^15 would read as fewer than sixteen digits; padding keeps the length.
  return BigInt(`0x${hex}`).toString(10).padStart(CODE_DIGITS, '0').slice(0, CODE_DIGITS);
}
