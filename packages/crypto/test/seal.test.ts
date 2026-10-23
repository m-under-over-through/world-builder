import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_CHARS, publicKeySchema, sealedEnvelopeSchema } from '@wb/contracts';
import { CryptoError, fingerprint, generateKeyPair, openAnswer, sealAnswer } from '../src/index.ts';

describe('sealed answers', () => {
  it('a sealed answer opens with the matching private key and reads back the same text', () => {
    const kp = generateKeyPair();
    const text = 'A typical Tuesday night: the shop is open late and the kids are there.';
    const envelope = sealAnswer(kp.publicKey, text);
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(envelope).not.toContain('Tuesday');
    expect(openAnswer(kp.privateKey, envelope)).toBe(text);
  });

  it('the envelope satisfies the contract and the keys satisfy theirs', () => {
    const kp = generateKeyPair();
    expect(publicKeySchema.safeParse(kp.publicKey).success).toBe(true);
    expect(publicKeySchema.safeParse(kp.privateKey).success).toBe(true); // same shape, 32 bytes
    const envelope = sealAnswer(kp.publicKey, 'hello');
    expect(sealedEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('has the sealed-box layout: 32 bytes of ephemeral key, 16 bytes of tag, then the message', () => {
    const kp = generateKeyPair();
    const envelope = sealAnswer(kp.publicKey, 'hello'); // 5 bytes of message
    const sealedBytes = Buffer.from(envelope.slice(3), 'base64');
    expect(sealedBytes.length).toBe(32 + 16 + 5);
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
    expect(() => openAnswer(wrong.privateKey, envelope)).toThrow(
      expect.objectContaining({ code: 'CRYPTO_OPEN_FAILED' }),
    );
  });

  it('an altered envelope is rejected, not silently misread', () => {
    const kp = generateKeyPair();
    const envelope = sealAnswer(kp.publicKey, 'do not touch');
    const bytes = Buffer.from(envelope.slice(3), 'base64');
    for (const position of [0, 40, bytes.length - 1]) {
      // ephemeral key, tag, message: flipping one bit anywhere must fail the tag check
      const altered = Buffer.from(bytes);
      altered[position] = altered[position]! ^ 0x01;
      expect(() => openAnswer(kp.privateKey, 'v1.' + altered.toString('base64'))).toThrow(
        expect.objectContaining({ code: 'CRYPTO_OPEN_FAILED' }),
      );
    }
  });

  it('rejects a malformed envelope and malformed keys with named errors', () => {
    const kp = generateKeyPair();
    expect(() => openAnswer(kp.privateKey, 'v2.AAAA')).toThrow(
      expect.objectContaining({ code: 'CRYPTO_BAD_ENVELOPE' }),
    );
    expect(() => openAnswer(kp.privateKey, 'v1.not base64!')).toThrow(
      expect.objectContaining({ code: 'CRYPTO_BAD_ENVELOPE' }),
    );
    expect(() => openAnswer(kp.privateKey, 'v1.AAAA')).toThrow(
      expect.objectContaining({ code: 'CRYPTO_BAD_ENVELOPE' }),
    );
    expect(() => sealAnswer('not-base64!', 'x')).toThrow(CryptoError);
    expect(() => sealAnswer('AAAA', 'x')).toThrow(
      expect.objectContaining({ code: 'CRYPTO_BAD_PUBLIC_KEY' }),
    );
    expect(() => openAnswer('AAAA', 'v1.AAAA')).toThrow(
      expect.objectContaining({ code: 'CRYPTO_BAD_PRIVATE_KEY' }),
    );
  });

  it('handles the empty answer, unicode, and the maximum length', () => {
    const kp = generateKeyPair();
    for (const text of ['', 'café — \u{1F3ED} üñ', 'x'.repeat(MAX_ANSWER_CHARS)]) {
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
