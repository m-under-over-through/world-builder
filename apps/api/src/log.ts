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
