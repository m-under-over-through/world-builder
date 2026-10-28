/**
 * The keyed hash of the anonymous code (ADR 0002, docs/learn/02-codes-hashes-and-peppers.md):
 * HMAC-SHA256 with the pepper as the key over "<slug>:<code>", as hex. Deterministic, so the
 * server can look a code up; useless without the pepper, so a copied database cannot.
 * Web Crypto only: the same code runs in Node, in a Netlify Function and in tests.
 */
export async function codeHash(pepper: string, slug: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${slug}:${code}`),
  );
  return toHex(new Uint8Array(signature));
}

/** Invite tokens are compared as strings (never decoded), so the stored form is the SHA-256 of the string. */
export async function tokenHash(token: string): Promise<string> {
  return toHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
  );
}

/** 16 random bytes as base64url, 22 characters, which is what inviteTokenSchema expects. */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** The pepper is 32 random bytes in base64, generated once per deployment by tools/ops/pepper.ts. */
export function validatePepper(pepper: string | undefined): string {
  if (!pepper || fromBase64(pepper).length !== 32) {
    throw new Error('WB_PEPPER must be 32 bytes in base64; generate one with tools/ops/pepper.ts');
  }
  return pepper;
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length); // backed by a plain ArrayBuffer, which Web Crypto requires
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
