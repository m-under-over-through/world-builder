import sodium from 'libsodium-wrappers';
import nacl from 'tweetnacl';
import { blake2b } from '@noble/hashes/blake2b';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, openAnswer, sealAnswer } from '../src/index.ts';

/**
 * Cross-check against the reference implementation.
 *
 * @wb/crypto composes libsodium's "sealed box" from NaCl's box and BLAKE2b (see src/index.ts).
 * The other tests prove the composition is self-consistent; this file proves it is the same
 * construction libsodium ships, in both directions. libsodium-wrappers is a development
 * dependency only: the app and the export tool never load it.
 */

const b64 = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
  decode: (text: string) => new Uint8Array(Buffer.from(text, 'base64')),
};
const envelopeOf = (sealed: Uint8Array) => 'v1.' + b64.encode(sealed);
const sealedBytes = (envelope: string) => b64.decode(envelope.slice(3));

beforeAll(async () => {
  await sodium.ready; // libsodium is WebAssembly and loads asynchronously
});

describe('interoperability with libsodium', () => {
  it('libsodium opens what we seal', () => {
    const kp = generateKeyPair();
    const text = 'sealed by @wb/crypto, opened by libsodium';
    const sealed = sealedBytes(sealAnswer(kp.publicKey, text));
    const opened = sodium.crypto_box_seal_open(
      sealed,
      b64.decode(kp.publicKey),
      b64.decode(kp.privateKey),
    );
    expect(sodium.to_string(opened)).toBe(text);
  });

  it('we open what libsodium seals', () => {
    const kp = generateKeyPair();
    const text = 'sealed by libsodium, opened by @wb/crypto';
    const sealed = sodium.crypto_box_seal(sodium.from_string(text), b64.decode(kp.publicKey));
    expect(openAnswer(kp.privateKey, envelopeOf(sealed))).toBe(text);
  });

  it('a key pair made by libsodium works with our functions in both directions', () => {
    const kp = sodium.crypto_box_keypair();
    const publicKey = b64.encode(kp.publicKey);
    const privateKey = b64.encode(kp.privateKey);
    expect(openAnswer(privateKey, sealAnswer(publicKey, 'theirs, ours'))).toBe('theirs, ours');
    const sealed = sodium.crypto_box_seal(sodium.from_string('theirs, theirs'), kp.publicKey);
    expect(openAnswer(privateKey, envelopeOf(sealed))).toBe('theirs, theirs');
  });

  it('derives the same nonce libsodium does (BLAKE2b-24 over ephemeral key then recipient key)', () => {
    // libsodium's crypto_generichash is BLAKE2b; the sealed-box nonce is generichash(24, epk || pk).
    const kp = generateKeyPair();
    const bytes = sealedBytes(sealAnswer(kp.publicKey, 'nonce check'));
    const input = new Uint8Array([...bytes.subarray(0, 32), ...b64.decode(kp.publicKey)]);
    const theirs = sodium.crypto_generichash(24, input, null); // null: unkeyed BLAKE2b
    const ours = blake2b(input, { dkLen: 24 });
    expect(Buffer.from(ours).toString('hex')).toBe(Buffer.from(theirs).toString('hex'));
  });

  it('both sides refuse the forged envelope with a degenerate ephemeral key', () => {
    // The same forgery as in seal.test.ts: an all-zero ephemeral key gives everyone the same
    // shared secret. libsodium rejects it in crypto_scalarmult; we check for it explicitly.
    const zeroKey = new Uint8Array(32);
    const victim = generateKeyPair();
    const sharedKey = nacl.box.before(zeroKey, nacl.box.keyPair().secretKey);
    const nonce = blake2b(new Uint8Array([...zeroKey, ...b64.decode(victim.publicKey)]), {
      dkLen: 24,
    });
    const boxed = nacl.box.after(new TextEncoder().encode('forged'), nonce, sharedKey);
    const forged = new Uint8Array([...zeroKey, ...boxed]);

    expect(() =>
      sodium.crypto_box_seal_open(
        forged,
        b64.decode(victim.publicKey),
        b64.decode(victim.privateKey),
      ),
    ).toThrow();
    expect(() => openAnswer(victim.privateKey, envelopeOf(forged))).toThrow(
      expect.objectContaining({ code: 'CRYPTO_OPEN_FAILED' }),
    );
  });

  it('the envelope layout is byte-identical in size: 32 + 16 + message', () => {
    const kp = generateKeyPair();
    const text = 'twelve bytes';
    const ours = sealedBytes(sealAnswer(kp.publicKey, text));
    const theirs = sodium.crypto_box_seal(sodium.from_string(text), b64.decode(kp.publicKey));
    expect(ours.length).toBe(theirs.length);
    expect(theirs.length).toBe(32 + 16 + 12);
  });
});
