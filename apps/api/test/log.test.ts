import { describe, expect, it } from 'vitest';
import { joinRequestSchema, syncRequestSchema } from '@wb/contracts';
import { MAX_ISSUES_IN_LINE, serverErrorLine, validationLine } from '../src/log.ts';

describe('the validation log line', () => {
  it('names the route, the code and the field paths with the issue kind, nothing else', () => {
    const parsed = joinRequestSchema.safeParse({ code: 'not digits', wave: 7 });
    if (parsed.success) throw new Error('setup');
    const line = validationLine('REQUEST_INVALID', 'POST /api/:slug/join', parsed.error.issues);
    expect(line).toBe(
      'REQUEST_INVALID POST /api/:slug/join: code (invalid_format), wave (invalid_type)',
    );
  });

  it('points at an unknown key by the object that holds it, never by the key itself', () => {
    const parsed = joinRequestSchema.safeParse({
      code: '1234567890123456',
      wave: 'wave-1',
      '9876543210987654': 'a code hidden in a key',
      emailAddress: 'x@y.z',
    });
    if (parsed.success) throw new Error('setup');
    const line = validationLine('REQUEST_INVALID', 'POST /api/:slug/join', parsed.error.issues);
    expect(line).toBe('REQUEST_INVALID POST /api/:slug/join: (root) (unrecognized_keys)');
    expect(line).not.toContain('9876');
    expect(line).not.toContain('email');
    expect(line).not.toContain('x@y.z');
  });

  it('gives array positions, so the reader can count to the bad event', () => {
    const parsed = syncRequestSchema.safeParse({
      sessions: [],
      events: [
        {
          id: 'x',
          sessionId: 'y',
          cardId: 'c',
          seq: 0,
          kind: 'shown',
          createdDay: 'd',
          deckVersion: 'v',
        },
      ],
    });
    if (parsed.success) throw new Error('setup');
    const line = validationLine(
      'SYNC_PAYLOAD_INVALID',
      'POST /api/:slug/sync',
      parsed.error.issues,
    );
    expect(line).toContain('events.0.id (invalid_format)');
    expect(line).toContain('events.0.createdDay (invalid_format)');
  });

  it('says so when the body was not JSON, and caps a long list of issues', () => {
    expect(validationLine('REQUEST_INVALID', 'POST /api/:slug/join', 'not json')).toBe(
      'REQUEST_INVALID POST /api/:slug/join: body is not JSON',
    );
    const many = Array.from({ length: MAX_ISSUES_IN_LINE + 5 }, (_, i) => ({
      code: 'invalid_type',
      path: ['events', i, 'seq'],
    }));
    const line = validationLine('SYNC_PAYLOAD_INVALID', 'POST /api/:slug/sync', many);
    expect(line.endsWith(', and 5 more')).toBe(true);
    expect(line).toContain(`events.${MAX_ISSUES_IN_LINE - 1}.seq`);
    expect(line).not.toContain(`events.${MAX_ISSUES_IN_LINE}.seq`);
  });
});

describe('the server error line', () => {
  it('carries the id, the name, the query without its parameters, the cause and the frames', () => {
    // The shape Drizzle gives a failed query: the message ends with the parameters.
    const cause = new Error('relation "rate_buckets" does not exist');
    cause.name = 'PostgresError';
    const error = new Error(
      'Failed query: insert into "rate_buckets" ("key", "count") values ($1, $2)\nparams: auth:1234:abc123hash,1',
      { cause },
    );
    error.name = 'DrizzleQueryError';
    const line = serverErrorLine('0a1b2c3d', error);
    const [head, causeLine, ...frames] = line.split('\n');
    expect(head).toBe(
      'SERVER_ERROR 0a1b2c3d DrizzleQueryError: Failed query: insert into "rate_buckets" ("key", "count") values ($1, $2)',
    );
    expect(causeLine).toBe('  cause: PostgresError: relation "rate_buckets" does not exist');
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(frame).toMatch(/^\s+at /);
    expect(line).not.toContain('params');
    expect(line).not.toContain('abc123hash');
  });

  it('describes a thrown value that is not an Error by its type only', () => {
    expect(serverErrorLine('deadbeef', 'the secret 1234567890123456')).toBe(
      'SERVER_ERROR deadbeef a thrown value of type string',
    );
  });
});
