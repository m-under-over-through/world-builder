/**
 * The API's log lines (CLAUDE.md, non-negotiables: no log line may carry a name, an address, a
 * precise timestamp, the anonymous code or its hash; architecture plan, section 12: no request
 * bodies in logs). Every line the app writes goes through a Logger, so tests can read what was
 * written and prove what was not.
 */
export interface Logger {
  /** A request refused for a reason the client can fix. Never carries data from the request. */
  warn: (line: string) => void;
  /** An unexpected failure on our side. */
  error: (line: string) => void;
}

/** What the deployed function uses: Netlify keeps function logs for about a day. */
export const consoleLogger: Logger = {
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

/** The parts of a Zod issue the log line may use. Values and messages are not among them. */
export interface IssueLocation {
  code: string;
  path: readonly PropertyKey[];
}

/** More issues than this and the line says how many more; a batch of 200 bad events is still one line. */
export const MAX_ISSUES_IN_LINE = 20;

/**
 * The one line written when a body fails the contract (runbook: REQUEST_INVALID,
 * SYNC_PAYLOAD_INVALID). It names the route, the error code and where in the body the contract was
 * not met: a path of our own field names and array positions, with Zod's issue code. Nothing else.
 * Not a value. Not a key the client made up, since an unknown key could be anything, a code
 * included (Zod lists those keys on the issue and quotes them in its message; both stay out). Not
 * a message, for the same reason.
 */
export function validationLine(
  code: 'REQUEST_INVALID' | 'SYNC_PAYLOAD_INVALID',
  route: string,
  issues: readonly IssueLocation[] | 'not json',
): string {
  if (issues === 'not json') return `${code} ${route}: body is not JSON`;
  const shown = issues
    .slice(0, MAX_ISSUES_IN_LINE)
    .map(
      (issue) =>
        `${issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.')} (${issue.code})`,
    );
  const more = issues.length - shown.length;
  return `${code} ${route}: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`;
}

/**
 * The line for an unexpected failure (runbook: SERVER_ERROR). The response carries an errorId; this
 * line carries the same id, the error's name and what it says, its cause, and the stack frames, so
 * the reader can find the failing line. Drizzle puts a failed query's parameters in the error's
 * message (`Failed query: <sql>\nparams: <values>`), and the parameters of our queries are code
 * hashes, bucket keys built from them, and sealed bodies: the message is cut before `params:`, and
 * the stack's header, which repeats the message, is dropped so that only the frames remain. The
 * SQL stays, with its `$1` placeholders; the cause's message stays, since a Postgres primary
 * message names the constraint or the relation and keeps values for its detail field.
 */
export function serverErrorLine(errorId: string, error: unknown): string {
  const parts = [`SERVER_ERROR ${errorId} ${describeError(error)}`];
  if (error instanceof Error && error.cause !== undefined) {
    parts.push(`  cause: ${describeError(error.cause)}`);
  }
  if (error instanceof Error && error.stack) parts.push(...stackFrames(error.stack));
  return parts.join('\n');
}

/** An error as "Name: message", with a failed query's parameters cut; the value of a thrown non-Error is never shown. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return `a thrown value of type ${typeof error}`;
  const message = withoutConnectionStrings(error.message.split('\nparams:')[0] ?? '');
  // Drizzle's query error does not set a name; the class name says what it is.
  const name = error.name === 'Error' ? error.constructor.name : error.name;
  return `${name}: ${message}`;
}

/**
 * A connection string carries the database password, and Neon's driver quotes the whole string in
 * the error it throws for one that does not parse. connectNeon refuses such a string before the
 * driver sees it (packages/db/src/neon.ts); this is the second line of defence, for any error
 * that quotes one anyway: everything from the scheme to the end of its line is cut. Not to the
 * next space or quote: a password may hold either, and its tail would stay.
 */
function withoutConnectionStrings(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\n]*/gi, 'postgres://(not shown)');
}

/** Only the "    at ..." lines. The header line repeats the message, parameters included. */
function stackFrames(stack: string): string[] {
  return stack.split('\n').filter((line) => /^\s+at /.test(line));
}
