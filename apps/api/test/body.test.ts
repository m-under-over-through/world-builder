import { describe, expect, it } from 'vitest';
import { BODY_TOO_LARGE, parseJsonBytes, readBodyBytes } from '../src/body.ts';

/** A request whose body arrives in the given chunks, the way a network body does. */
function chunked(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  // duplex is what the fetch standard requires for a streamed body; Node's Request insists on it.
  return new Request('http://localhost/api/x/join', {
    method: 'POST',
    headers,
    body: stream,
    ...({ duplex: 'half' } as object),
  });
}

describe('reading a body with a cap in bytes', () => {
  it('returns a body of exactly the cap and refuses one byte more', async () => {
    const ok = await readBodyBytes(chunked(['abcde']), 5);
    expect(ok).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(ok as Uint8Array)).toBe('abcde');
    expect(await readBodyBytes(chunked(['abcdef']), 5)).toBe(BODY_TOO_LARGE);
  });

  it('counts bytes, not characters: three two-byte characters are six bytes', async () => {
    expect(await readBodyBytes(chunked(['ééé']), 5)).toBe(BODY_TOO_LARGE);
    expect(await readBodyBytes(chunked(['ééé']), 6)).toBeInstanceOf(Uint8Array);
  });

  it('stops at the chunk that crosses the cap and reads no further', async () => {
    let pulls = 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(encoder.encode('x'.repeat(4)));
      },
    });
    const request = new Request('http://localhost/api/x/join', {
      method: 'POST',
      body: stream,
      ...({ duplex: 'half' } as object),
    });
    expect(await readBodyBytes(request, 10)).toBe(BODY_TOO_LARGE);
    // Three chunks reach twelve bytes; an endless stream was not read to its end.
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it('refuses a Content-Length over the cap before reading, and does not trust one under it', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1));
      },
    });
    const declaredBig = new Request('http://localhost/api/x/join', {
      method: 'POST',
      headers: { 'content-length': '11' },
      body: stream,
      ...({ duplex: 'half' } as object),
    });
    expect(await readBodyBytes(declaredBig, 10)).toBe(BODY_TOO_LARGE);
    // A stream fills one chunk ahead on its own when it is made; the reader asked for none.
    expect(pulls).toBeLessThanOrEqual(1);
    const lies = chunked(['x'.repeat(20)], { 'content-length': '2' });
    expect(await readBodyBytes(lies, 10)).toBe(BODY_TOO_LARGE);
  });

  it('a request without a body reads as zero bytes', async () => {
    const body = await readBodyBytes(new Request('http://localhost/api/health'), 10);
    expect(body).toEqual(new Uint8Array(0));
  });

  it('joins the chunks back together in order', async () => {
    const body = await readBodyBytes(chunked(['{"a":', '1', '}']), 100);
    expect(parseJsonBytes(body as Uint8Array)).toEqual({ a: 1 });
  });
});

describe('parsing the bytes as JSON', () => {
  it('returns undefined for bytes that are not UTF-8 and for text that is not JSON', () => {
    expect(parseJsonBytes(new Uint8Array([0xff, 0xfe]))).toBeUndefined();
    expect(parseJsonBytes(new TextEncoder().encode('not json'))).toBeUndefined();
    expect(parseJsonBytes(new Uint8Array(0))).toBeUndefined();
  });

  it('keeps multi-byte characters intact', () => {
    expect(parseJsonBytes(new TextEncoder().encode('{"t":"é🙂"}'))).toEqual({ t: 'é🙂' });
  });
});
