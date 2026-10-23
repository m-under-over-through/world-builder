import nacl from 'tweetnacl';
import { blake2b } from '@noble/hashes/blake2b';
import { sha256 } from '@noble/hashes/sha2';

/**
 * @wb/crypto: answers are sealed on the device to the workshop's public key and opened only on a
 * machine that holds the private key. The API never imports this package; it only stores what it
 * is given. The ideas are explained in docs/learn/01-sealed-boxes.md.
 *
 * Construction: libsodium's "sealed box", built here from NaCl's box so every step is visible:
 *
 *   ephemeral  = fresh X25519 key pair, used for this one message and then wiped
 *   nonce      = BLAKE2b-24(ephemeral.publicKey || recipient.publicKey)
 *   boxed      = box(message, nonce, recipient.publicKey, ephemeral.secretKey)
 *                (X25519 agreement, then XSalsa20 encryption with a Poly1305 tag)
 *   sealed     = ephemeral.publicKey (32 bytes) || boxed (16-byte tag + message)
 *   envelope   = "v1." + base64(sealed)
 *
 * The output is byte-for-byte what libsodium's crypto_box_seal produces, so an envelope can be
 * opened with libsodium in any language if that is ever needed.
 */
export const ENVELOPE_VERSION = 'v1';
const PREFIX = `${ENVELOPE_VERSION}.`;

const KEY_BYTES = 32; // nacl.box.publicKeyLength and secretKeyLength
const TAG_BYTES = nacl.box.overheadLength; // 16
const NONCE_BYTES = nacl.box.nonceLength; // 24

export interface KeyPair {
  /** 32 bytes, standard base64. Goes into workshop.json and onto the trust page. */
  publicKey: string;
  /** 32 bytes, standard base64. Goes into the vault and onto paper. Never into the repository. */
  privateKey: string;
}

export type CryptoErrorCode =
  'CRYPTO_BAD_PUBLIC_KEY' | 'CRYPTO_BAD_PRIVATE_KEY' | 'CRYPTO_BAD_ENVELOPE' | 'CRYPTO_OPEN_FAILED';

export class CryptoError extends Error {
  // Declared as a plain field, not a constructor "parameter property": Node runs this file with
  // type stripping only, and parameter properties are syntax it cannot strip (ADR 0009).
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

// ---- small helpers: bytes <-> base64 and UTF-8, the same in Node and browsers ----

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const utf8 = { encode: new TextEncoder(), decode: new TextDecoder('utf-8', { fatal: true }) };

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function decodeKey(
  b64: string,
  which: 'CRYPTO_BAD_PUBLIC_KEY' | 'CRYPTO_BAD_PRIVATE_KEY',
): Uint8Array {
  const bytes = fromBase64(b64);
  if (!bytes) throw new CryptoError(which, 'key is not valid base64');
  if (bytes.length !== KEY_BYTES) {
    throw new CryptoError(which, `key must be ${KEY_BYTES} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** The nonce is derived from the two public keys, as libsodium does, so it never has to be stored. */
function sealNonce(ephemeralPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  return blake2b(concat(ephemeralPublicKey, recipientPublicKey), { dkLen: NONCE_BYTES });
}

// ---- the four public functions ----

/** Generate a workshop key pair. Run by the `workshop keygen` tool, on the operator's own machine. */
export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: toBase64(kp.publicKey), privateKey: toBase64(kp.secretKey) };
}

/** A short, human-checkable name for a public key: first 8 bytes of its SHA-256, as "ab12-cd34-ef56-7890". */
export function fingerprint(publicKey: string): string {
  const pk = decodeKey(publicKey, 'CRYPTO_BAD_PUBLIC_KEY');
  const hex = Array.from(sha256(pk).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{4}/g)!.join('-');
}

/** Seal an answer to the workshop's public key. Anyone can seal; only the private key can open. */
export function sealAnswer(publicKey: string, text: string): string {
  const pk = decodeKey(publicKey, 'CRYPTO_BAD_PUBLIC_KEY');
  const ephemeral = nacl.box.keyPair();
  const nonce = sealNonce(ephemeral.publicKey, pk);
  const boxed = nacl.box(utf8.encode.encode(text), nonce, pk, ephemeral.secretKey);
  ephemeral.secretKey.fill(0); // nothing can open this envelope from the sender's side ever again
  return PREFIX + toBase64(concat(ephemeral.publicKey, boxed));
}

/** Open a sealed answer with the private key. Fails loudly if the envelope was altered or sealed to another key. */
export function openAnswer(privateKey: string, envelope: string): string {
  if (!envelope.startsWith(PREFIX)) {
    throw new CryptoError('CRYPTO_BAD_ENVELOPE', `envelope does not start with "${PREFIX}"`);
  }
  const sk = decodeKey(privateKey, 'CRYPTO_BAD_PRIVATE_KEY');
  const sealed = fromBase64(envelope.slice(PREFIX.length));
  if (!sealed) throw new CryptoError('CRYPTO_BAD_ENVELOPE', 'envelope body is not valid base64');
  if (sealed.length < KEY_BYTES + TAG_BYTES) {
    throw new CryptoError('CRYPTO_BAD_ENVELOPE', 'envelope is too short to be a sealed box');
  }
  // The public key is derived from the private key, so nobody has to store both.
  const pk = nacl.box.keyPair.fromSecretKey(sk).publicKey;
  const ephemeralPublicKey = sealed.slice(0, KEY_BYTES);
  const boxed = sealed.slice(KEY_BYTES);
  const opened = nacl.box.open(boxed, sealNonce(ephemeralPublicKey, pk), ephemeralPublicKey, sk);
  if (!opened) throw new CryptoError('CRYPTO_OPEN_FAILED', 'wrong key or altered envelope');
  try {
    return utf8.decode.decode(opened);
  } catch {
    throw new CryptoError('CRYPTO_OPEN_FAILED', 'opened bytes are not valid UTF-8');
  }
}
