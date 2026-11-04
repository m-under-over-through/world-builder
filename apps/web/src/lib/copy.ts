import { CLIENT_ERROR_CODES, ERROR_CODES } from '@wb/contracts';

/**
 * Every participant-facing word comes from workshops/<slug>/copy.md, loaded at build time
 * (lib/workshops.ts), never typed into a component. This file reads that document: a block per
 * `## heading`, looked up by name. The words are Marco's and the partner's; the headings and the
 * list keys below are the client's, so a block is renamed only together with the client.
 *
 * The shape of a block (the top of copy.md says the same to the person editing it):
 * - a `[placeholder]` line marks a draft; it is stripped and remembered, never shown;
 * - `- key: value` lines are entries of a list, read by key;
 * - `<!-- ... -->` is a note to the editor, never shown;
 * - the other lines are the text, with a blank line between paragraphs;
 * - `[word]` inside the text is a slot the client fills (`fill`).
 *
 * A block the file lacks is not silent: the lookup returns a visible marker with the heading's
 * name, and a test in test/copy.test.ts fails for every workshop folder that lacks a heading
 * or a key the client reads.
 */
export interface CopySection {
  heading: string;
  /** The note in parentheses after the heading, such as "under 60 words". Empty when none. */
  note: string;
  /** Paragraphs separated by a blank line. */
  text: string;
  items: Record<string, string>;
  placeholder: boolean;
}

const HEADING = /^## (.+?)(?:\s*\(([^)]*)\))?\s*$/;
const ITEM = /^- ([^:]+):\s*(.*)$/;
const PLACEHOLDER = '[placeholder]';

export function parseCopy(markdown: string): CopySection[] {
  const sections: CopySection[] = [];
  let current: CopySection | null = null;
  let lines: string[] = [];
  const finish = () => {
    if (current) current.text = paragraphs(lines).join('\n\n');
    lines = [];
  };
  for (const raw of stripComments(markdown.split('\n'))) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    if (heading) {
      finish();
      current = {
        heading: heading[1]!.trim(),
        note: heading[2]?.trim() ?? '',
        text: '',
        items: {},
        placeholder: false,
      };
      sections.push(current);
      continue;
    }
    if (!current) continue; // the preamble above the first heading
    if (line.trim() === PLACEHOLDER) {
      current.placeholder = true;
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      current.items[item[1]!.trim()] = item[2]!.trim();
      continue;
    }
    lines.push(line);
  }
  finish();
  return sections;
}

/** Remove `<!-- ... -->` notes, which may span lines; what remains keeps its line breaks. */
function stripComments(lines: string[]): string[] {
  const out: string[] = [];
  let inComment = false;
  for (const line of lines) {
    let rest = line;
    let kept = '';
    while (rest.length > 0) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end === -1) {
          rest = '';
        } else {
          rest = rest.slice(end + 3);
          inComment = false;
        }
      } else {
        const start = rest.indexOf('<!--');
        if (start === -1) {
          kept += rest;
          rest = '';
        } else {
          kept += rest.slice(0, start);
          rest = rest.slice(start + 4);
          inComment = true;
        }
      }
    }
    out.push(kept);
  }
  return out;
}

/** Lines into paragraphs: a blank line separates them, and a soft line break inside one is a space. */
function paragraphs(lines: string[]): string[] {
  const result: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
    if (text) result.push(text);
    buffer = [];
  };
  for (const line of lines) {
    if (line.trim() === '') flush();
    else buffer.push(line.trim());
  }
  flush();
  return result;
}

/** The headings whose text the client reads. */
export const COPY_TEXT = [
  'Intro 1',
  'Intro 2',
  'Intro 3, consent',
  'Demo card',
  'Card nudge',
  'Remind me',
  'Not a workshop',
  'Welcome: new here',
  'Welcome: I have a code',
  'Welcome: no link',
  'Welcome: code not accepted',
  'Enter code',
  'Enter code: too short',
  'Closed',
  'Thank you card',
  'Not open yet',
  'About: what this is',
  'About: delete',
  'Privacy panel: caveat',
  'Privacy panel: delete confirm',
  'Terms',
  'Privacy policy',
  'Trust page: what we store',
  'Trust page: what we never collect',
  'Trust page: how it is protected',
  'Trust page: check it yourself',
  'Trust page: who, where, until when',
  'Trust page: the honest limit',
] as const;

/** The paragraphs under "How your answers are protected", in the order they are shown. */
export const TRUST_BLOCKS = [
  'Trust page: what we store',
  'Trust page: what we never collect',
  'Trust page: how it is protected',
  'Trust page: check it yourself',
  'Trust page: who, where, until when',
  'Trust page: the honest limit',
] as const satisfies readonly TextHeading[];

/** The lists the client reads, with the keys it reads from each. */
export const COPY_LISTS = {
  'Dictation hint': ['iPhone and iPad', 'Android', 'Mac', 'Windows', 'ChromeOS'],
  'Trust page variables': [
    'organizer',
    'data owners',
    'storage region',
    'collection closes',
    'deletion',
    'hostname',
    'contact',
    'key fingerprint',
    'source',
    'webbkoll',
    'blacklight',
  ],
  'Trust page links': ['source', 'webbkoll', 'blacklight', 'terms', 'privacy policy'],
  Titles: [
    'not a workshop',
    'enter code',
    'intro 1',
    'intro 2',
    'consent',
    'demo card',
    'dictation hint',
    'closed',
    'not open yet',
    'about',
    'trust page',
    'privacy panel',
    'terms',
    'privacy policy',
  ],
  Buttons: [
    'about',
    'new here',
    'i have a code',
    'continue',
    'back',
    'next',
    'i understand',
    'save',
    'set aside',
    'copy',
    'copied',
    'delete',
    'yes delete',
    'keep',
    'got it',
    'prefer to talk',
    'remind me',
  ],
  'App labels': ['loading', 'app name', 'retrying'],
  'Card labels': [
    'position',
    'position with area',
    'tap to answer',
    'click to answer',
    'placeholder',
    'counter',
    'swipe hint',
    'close without saving',
    'could not save',
  ],
  'Card states': ['saving', 'saved', 'synced', 'offline', 'sync problem', 'dismissed', 'deferred'],
  'Your world': [
    'title',
    'pill label',
    'summary',
    'answered',
    'set aside',
    'tile label',
    'tile label without area',
    'empty',
    'empty laptop',
    'written elsewhere',
    'progress',
    'close',
  ],
  'Privacy panel': [
    'code',
    'code note',
    'no code yet',
    'cookies',
    'hosts',
    'permissions',
    'permissions value',
    'key',
    'stored',
    'nothing stored',
    'not reachable',
    'stored summary',
    'show rows',
    'joined',
    'came through',
    'an invite',
    'invites left',
    'sessions',
    'session row',
    'events',
    'event row',
    'sealed body',
    'waiting',
    'outbox summary',
    'last sync',
    'last sync day',
    'last error',
    'no error',
    'version',
    'source',
  ],
  'Event kinds': ['shown', 'answered', 'dismissed', 'deferred', 'revisited'],
  Diagnostics: ['last sync', 'outbox', 'last error', 'never', 'ok', 'offline', 'error'],
  Reminder: ['summary', 'description'],
} as const;

/** One line per error code, server and client, under "Error: <CODE>". */
export const ERROR_HEADINGS = [...Object.keys(ERROR_CODES), ...Object.keys(CLIENT_ERROR_CODES)].map(
  (code) => `Error: ${code}`,
);

export type TextHeading = (typeof COPY_TEXT)[number];
export type ListHeading = keyof typeof COPY_LISTS;
export type ListKey<H extends ListHeading> = (typeof COPY_LISTS)[H][number];

/** What a missing block looks like on the screen: visible, and naming what to add to copy.md. */
export function missing(name: string): string {
  return `[missing: ${name}]`;
}

/**
 * A paragraph split into plain and bold runs: the drafts in copy.md mark a lead-in with
 * `**two stars**`, and a screen renders each run as text or as `<strong>`, never as HTML.
 */
export function inline(text: string): { bold: boolean; text: string }[] {
  return text
    .split('**')
    .map((run, i) => ({ bold: i % 2 === 1, text: run }))
    .filter((run) => run.text !== '');
}

/** Fill the `[slot]`s in a text: fill('Card [n] of [total]', { n: 1, total: 4 }). */
export function fill(text: string, values: Record<string, string | number>): string {
  let out = text;
  for (const [key, value] of Object.entries(values))
    out = out.split(`[${key}]`).join(String(value));
  return out;
}

export class Copy {
  readonly sections: Map<string, CopySection>;

  constructor(sections: CopySection[]) {
    this.sections = new Map(sections.map((s) => [s.heading, s]));
  }

  static parse(markdown: string): Copy {
    return new Copy(parseCopy(markdown));
  }

  has(heading: string): boolean {
    return this.sections.has(heading);
  }

  text(heading: TextHeading): string {
    return this.lookup(heading);
  }

  paragraphs(heading: TextHeading): string[] {
    return this.lookup(heading).split('\n\n');
  }

  item<H extends ListHeading>(heading: H, key: ListKey<H>): string {
    return this.sections.get(heading)?.items[key] ?? missing(`${heading}: ${key}`);
  }

  /** The one-line wording of an error code, server or client. Codes are shown only in diagnostics. */
  error(code: string): string {
    return this.lookup(`Error: ${code}`);
  }

  /** Headings still marked [placeholder]: what the partner has not worded yet. */
  placeholders(): string[] {
    return [...this.sections.values()].filter((s) => s.placeholder).map((s) => s.heading);
  }

  /** Every heading or "heading: key" the client reads that this document lacks. */
  missingHeadings(): string[] {
    const gaps: string[] = [];
    for (const heading of [...COPY_TEXT, ...ERROR_HEADINGS]) {
      if (!this.sections.get(heading)?.text) gaps.push(heading);
    }
    for (const [heading, keys] of Object.entries(COPY_LISTS)) {
      const items = this.sections.get(heading)?.items ?? {};
      for (const key of keys) if (!items[key]) gaps.push(`${heading}: ${key}`);
    }
    return gaps;
  }

  private lookup(heading: string): string {
    const text = this.sections.get(heading)?.text;
    return text ? text : missing(heading);
  }
}
