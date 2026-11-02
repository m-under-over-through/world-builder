/**
 * Reading a request body with a cap in bytes (CLAUDE.md, API builder notes; architecture plan,
 * section 12, "body size limits").
 *
 * Why bytes and not characters: JavaScript measures a string in UTF-16 units, and one unit stands
 * for one to three bytes on the wire (an emoji is two units and four bytes). The skeleton read the
 * whole body and compared `text.length` with MAX_REQUEST_BYTES, so a body of 600,000 four-byte
 * characters weighed 2.4 MB and passed. This reads the stream chunk by chunk, counts bytes, and
 * stops at the first byte over the cap: nothing larger than the cap is ever held in memory, let
 * alone parsed. A Content-Length header over the cap is refused before a single byte is read; a
 * header under the cap is not trusted, the count on the stream is what decides.
 */
export const BODY_TOO_LARGE = Symbol('body too large');

export async function readBodyBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | typeof BODY_TOO_LARGE> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return BODY_TOO_LARGE;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Tell the stream we want no more; the sender's remaining bytes are dropped, not buffered.
      await reader.cancel();
      return BODY_TOO_LARGE;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * The body as JSON, or undefined when it is not valid UTF-8 or not valid JSON. JSON is UTF-8 by
 * definition (RFC 8259), so a body that does not decode is not JSON; `fatal` makes the decoder say
 * so instead of substituting replacement characters.
 */
export function parseJsonBytes(body: Uint8Array): unknown | undefined {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return undefined;
  }
}
