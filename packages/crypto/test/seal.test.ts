import nacl from 'tweetnacl';
import { blake2b } from '@noble/hashes/blake2b';
import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_CHARS, publicKeySchema, sealedEnvelopeSchema } from '@wb/contracts';
import { CryptoError, fingerprint, generateKeyPair, openAnswer, sealAnswer } from '../src/index.ts';

const failsWith = (code: string) => expect.objectContaining({ code });
const sealedBytes = (envelope: string) => Buffer.from(envelope.slice(3), 'base64');
const envelopeOf = (bytes: Uint8Array) => 'v1.' + Buffer.from(bytes).toString('base64');

describe('sealed answers', () => {
  it('a sealed answer opens with the matching private key and reads back the same text', () => {
    const kp = generateKeyPair();
    const text = 'A typical Tuesday night: the shop is open late and the kids are there.';
    const envelope = sealAnswer(kp.publicKey, text);
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(envelope).not.toContain('Tuesday');
    expect(openAnswer(kp.privateKey, envelope)).toBe(text);
  });

  it('the envelope satisfies the contract, the public key satisfies its schema, both keys are 32 bytes', () => {
    const kp = generateKeyPair();
    expect(publicKeySchema.safeParse(kp.publicKey).success).toBe(true);
    expect(Buffer.from(kp.publicKey, 'base64').length).toBe(32);
    expect(Buffer.from(kp.privateKey, 'base64').length).toBe(32);
    expect(sealedEnvelopeSchema.safeParse(sealAnswer(kp.publicKey, 'hello')).success).toBe(true);
  });

  it('has the sealed-box layout: 32 bytes of ephemeral key, 16 bytes of tag, then the message', () => {
    const kp = generateKeyPair();
    expect(sealedBytes(sealAnswer(kp.publicKey, 'hello')).length).toBe(32 + 16 + 5);
    expect(sealedBytes(sealAnswer(kp.publicKey, '')).length).toBe(32 + 16);
  });

  it('derives the nonce exactly as libsodium does (BLAKE2b, 24-byte digest, ephemeral key then recipient key)', () => {
    // Known answer computed independently with Python: hashlib.blake2b(bytes(range(64)), digest_size=24)
    const input = Uint8Array.from({ length: 64 }, (_, i) => i);
    expect(Buffer.from(blake2b(input, { dkLen: 24 })).toString('hex')).toBe(
      'aa054507b4916837a6d2b35b1ce7c525facdb7868ed55a8a',
    );
    // And the box itself must open with that nonce computed by hand from the envelope's front.
    const kp = generateKeyPair();
    const bytes = sealedBytes(sealAnswer(kp.publicKey, 'by hand'));
    const epk = bytes.subarray(0, 32);
    const pk = Buffer.from(kp.publicKey, 'base64');
    const nonce = blake2b(Buffer.concat([epk, pk]), { dkLen: 24 });
    const opened = nacl.box.open(
      bytes.subarray(32),
      nonce,
      epk,
      Buffer.from(kp.privateKey, 'base64'),
    );
    expect(Buffer.from(opened!).toString('utf8')).toBe('by hand');
  });

  it('sealing the same text twice gives different envelopes (fresh ephemeral key each time)', () => {
    const kp = generateKeyPair();
    const a = sealAnswer(kp.publicKey, 'same');
    const b = sealAnswer(kp.publicKey, 'same');
    expect(a).not.toBe(b);
    expect(openAnswer(kp.privateKey, a)).toBe('same');
    expect(openAnswer(kp.privateKey, b)).toBe('same');
  });

  it('a different private key cannot open it', () => {
    const right = generateKeyPair();
    const wrong = generateKeyPair();
    const envelope = sealAnswer(right.publicKey, 'secret');
    expect(() => openAnswer(wrong.privateKey, envelope)).toThrow(failsWith('CRYPTO_OPEN_FAILED'));
  });

  it('an altered envelope is rejected, not silently misread', () => {
    const kp = generateKeyPair();
    const bytes = sealedBytes(sealAnswer(kp.publicKey, 'do not touch'));
    for (const position of [0, 40, bytes.length - 1]) {
      // ephemeral key, tag, message: flipping one bit anywhere must fail the tag check
      const altered = Buffer.from(bytes);
      altered[position] = altered[position]! ^ 0x01;
      expect(() => openAnswer(kp.privateKey, envelopeOf(altered))).toThrow(
        failsWith('CRYPTO_OPEN_FAILED'),
      );
    }
  });

  it('refuses a forged envelope whose ephemeral key is degenerate (it would open under any private key)', () => {
    // With an all-zero ephemeral public key the X25519 shared secret is all zeros for everyone,
    // so an attacker can make a box that every private key opens. libsodium rejects this; so do we.
    const zeroKey = new Uint8Array(32);
    const anyone = nacl.box.keyPair();
    const sharedKey = nacl.box.before(zeroKey, anyone.secretKey); // the same for any secret key
    const victim = generateKeyPair();
    const nonce = blake2b(Buffer.concat([zeroKey, Buffer.from(victim.publicKey, 'base64')]), {
      dkLen: 24,
    });
    const boxed = nacl.box.after(new TextEncoder().encode('forged'), nonce, sharedKey);
    const forged = envelopeOf(Buffer.concat([zeroKey, boxed]));
    expect(() => openAnswer(victim.privateKey, forged)).toThrow(failsWith('CRYPTO_OPEN_FAILED'));
  });

  it('rejects malformed envelopes and malformed keys with named errors', () => {
    const kp = generateKeyPair();
    expect(() => openAnswer(kp.privateKey, 'v2.AAAA')).toThrow(failsWith('CRYPTO_BAD_ENVELOPE'));
    expect(() => openAnswer(kp.privateKey, 'v1.not base64!')).toThrow(
      failsWith('CRYPTO_BAD_ENVELOPE'),
    );
    expect(() => openAnswer(kp.privateKey, 'v1.AAAAA')).toThrow(failsWith('CRYPTO_BAD_ENVELOPE')); // length not a multiple of 4
    expect(() => openAnswer(kp.privateKey, envelopeOf(new Uint8Array(47)))).toThrow(
      failsWith('CRYPTO_BAD_ENVELOPE'),
    ); // one byte short
    expect(() => sealAnswer('not-base64!', 'x')).toThrow(CryptoError);
    expect(() => sealAnswer('AAAA', 'x')).toThrow(failsWith('CRYPTO_BAD_PUBLIC_KEY'));
    expect(() => sealAnswer(Buffer.alloc(33).toString('base64'), 'x')).toThrow(
      failsWith('CRYPTO_BAD_PUBLIC_KEY'),
    );
    expect(() => openAnswer('AAAA', 'v1.AAAA')).toThrow(failsWith('CRYPTO_BAD_PRIVATE_KEY'));
  });

  it('keeps a leading byte-order mark and rejects broken characters', () => {
    const kp = generateKeyPair();
    const withBom = '﻿hello';
    expect(openAnswer(kp.privateKey, sealAnswer(kp.publicKey, withBom))).toBe(withBom);
    expect(() => sealAnswer(kp.publicKey, 'ab\uD83C')).toThrow(failsWith('CRYPTO_BAD_TEXT')); // half an emoji
    expect(() => sealAnswer(kp.publicKey, '\uDC00ab')).toThrow(failsWith('CRYPTO_BAD_TEXT'));
  });

  it('refuses text over the answer limit, so nothing unsendable ever enters the outbox', () => {
    const kp = generateKeyPair();
    expect(() => sealAnswer(kp.publicKey, 'x'.repeat(MAX_ANSWER_CHARS + 1))).toThrow(
      failsWith('CRYPTO_BAD_TEXT'),
    );
  });

  it('handles the empty answer, unicode, and the maximum length in the widest characters', () => {
    const kp = generateKeyPair();
    const texts = [
      '',
      'café — \u{1F3ED} üñ',
      'x'.repeat(MAX_ANSWER_CHARS),
      '中'.repeat(MAX_ANSWER_CHARS), // 3 bytes each in UTF-8
      '\u{1F3ED}'.repeat(MAX_ANSWER_CHARS / 2), // 2 UTF-16 units and 4 bytes each
    ];
    for (const text of texts) {
      const envelope = sealAnswer(kp.publicKey, text);
      expect(sealedEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(openAnswer(kp.privateKey, envelope)).toBe(text);
    }
  });

  it('fingerprints are stable, short, and differ between keys', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const fa = fingerprint(a.publicKey);
    expect(fa).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    expect(fingerprint(a.publicKey)).toBe(fa);
    expect(fingerprint(b.publicKey)).not.toBe(fa);
  });
});
