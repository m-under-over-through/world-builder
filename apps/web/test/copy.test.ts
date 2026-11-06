import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES, ERROR_CODES } from '@wb/contracts';
import { Copy, fill, inline, missing, parseCopy } from '../src/lib/copy.ts';

const SAMPLE = `# Copy: sample

Lines above the first heading are not a block.

## Welcome (under 120 words)

[placeholder]
First paragraph, on one line.

Second paragraph,
soft-wrapped onto two lines.

## Buttons (one word each)

<!-- A note to the editor,
over two lines. -->

- save: Save
- set aside: Set aside

## Final words

No marker here: these words are final. <!-- and an inline note -->

## Empty
`;

describe('the copy parser', () => {
  const sections = parseCopy(SAMPLE);
  const by = (heading: string) => sections.find((s) => s.heading === heading)!;

  it('reads one block per heading, with the heading name without its note', () => {
    expect(sections.map((s) => s.heading)).toEqual(['Welcome', 'Buttons', 'Final words', 'Empty']);
    expect(by('Welcome').note).toBe('under 120 words');
    expect(by('Final words').note).toBe('');
  });

  it('joins soft-wrapped lines and keeps paragraphs apart', () => {
    expect(by('Welcome').text).toBe(
      'First paragraph, on one line.\n\nSecond paragraph, soft-wrapped onto two lines.',
    );
  });

  it('strips the [placeholder] marker and remembers it', () => {
    expect(by('Welcome').placeholder).toBe(true);
    expect(by('Welcome').text).not.toContain('[placeholder]');
    expect(by('Final words').placeholder).toBe(false);
  });

  it('reads "- key: value" lines as entries of a list', () => {
    expect(by('Buttons').items).toEqual({ save: 'Save', 'set aside': 'Set aside' });
    expect(by('Buttons').text).toBe('');
  });

  it('never shows a note to the editor, on one line or several', () => {
    expect(by('Buttons').text).not.toContain('note');
    expect(by('Final words').text).toBe('No marker here: these words are final.');
  });

  it('fills the slots in a text', () => {
    expect(fill('Card [n] of [total]', { n: 1, total: 4 })).toBe('Card 1 of 4');
    expect(fill('No slots', { n: 1 })).toBe('No slots');
  });
});

describe('a file organised by screen', () => {
  const FILE = `# Copy: sample

## Titles

- about: About this app

# Welcome

Words about the screen, for the editor.

## Welcome

[placeholder]
First part.

## Buttons

- save: Save

# About

This line sits under a screen heading and is ignored.

## Titles

<!-- a note on the second part -->

- terms: Terms

## Welcome

Second part.

## Buttons

[placeholder]

- back: Back
`;
  const sections = parseCopy(FILE);
  const by = (heading: string) => sections.find((s) => s.heading === heading)!;

  it('ends the block at a "# " heading and starts none, so the lines after it are ignored', () => {
    expect(sections.map((s) => s.heading)).toEqual(['Titles', 'Welcome', 'Buttons']);
    for (const section of sections) {
      expect(section.text).not.toContain('editor');
      expect(section.text).not.toContain('ignored');
    }
    expect(by('Titles').text).toBe('');
  });

  it('merges blocks with the same heading: entries together, texts as paragraphs in file order, placeholder if any part says so', () => {
    expect(by('Titles').items).toEqual({ about: 'About this app', terms: 'Terms' });
    expect(by('Buttons').items).toEqual({ save: 'Save', back: 'Back' });
    expect(by('Welcome').text).toBe('First part.\n\nSecond part.');
    expect(by('Welcome').placeholder).toBe(true);
    expect(by('Titles').placeholder).toBe(false);
    expect(by('Buttons').placeholder).toBe(true);
  });

  it('names a key given twice, so the check fails instead of one value winning silently', () => {
    const twice = parseCopy(
      '## Buttons\n\n- save: Save\n\n# Other\n\n## Buttons\n\n- save: Store\n',
    );
    expect(twice[0]!.duplicateKeys).toEqual(['save']);
    expect(
      Copy.parse('## Buttons\n- save: Save\n## Buttons\n- save: Store\n').missingHeadings(),
    ).toContain('Buttons: save (given twice)');
    expect(by('Buttons').duplicateKeys).toEqual([]);
  });
});

describe('looking words up', () => {
  const copy = Copy.parse(SAMPLE);

  it('returns the text of a block and the entries of a list', () => {
    expect(copy.paragraphs('Welcome')[0]!).toContain('First paragraph');
    expect(copy.paragraphs('Welcome')).toHaveLength(2);
    expect(copy.item('Buttons', 'save')).toBe('Save');
  });

  it('shows a visible marker with the name of a block or entry the file lacks, never silence', () => {
    expect(copy.text('Closed')).toBe(missing('Closed'));
    expect(copy.text('Closed')).toContain('Closed');
    expect(copy.item('Buttons', 'back')).toBe(missing('Buttons: back'));
    expect(copy.error('AUTH_CODE_UNKNOWN')).toBe(missing('Error: AUTH_CODE_UNKNOWN'));
  });

  it('treats an empty block as missing', () => {
    expect(copy.has('Empty')).toBe(true);
    expect(copy.missingHeadings()).toContain('Closed');
    expect(copy.missingHeadings()).toContain('Buttons: back');
  });

  it('lists the blocks still marked as placeholders', () => {
    expect(copy.placeholders()).toEqual(['Welcome']);
  });
});

describe('every workshop folder has the words the client reads', () => {
  // A path, not a URL: the client's tests run in a DOM whose URL class is not the one node:fs reads.
  const root = join(fileURLToPath(import.meta.url), '../../../../workshops');
  const slugs = readdirSync(root).filter((name) => !name.startsWith('.'));

  it('has at least one workshop folder', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    const copy = Copy.parse(readFileSync(join(root, slug, 'copy.md'), 'utf8'));

    it(`${slug}: every heading and list entry the client reads is in copy.md`, () => {
      expect(copy.missingHeadings()).toEqual([]);
    });

    it(`${slug}: every error code, server and client, has its one line`, () => {
      for (const code of [...Object.keys(ERROR_CODES), ...Object.keys(CLIENT_ERROR_CODES)]) {
        expect(copy.has(`Error: ${code}`), code).toBe(true);
        expect(copy.error(code)).not.toBe(missing(`Error: ${code}`));
      }
    });

    it(`${slug}: no block shows a marker or a note to participants`, () => {
      for (const section of copy.sections.values()) {
        expect(section.text).not.toContain('[placeholder]');
        expect(section.text).not.toContain('<!--');
        for (const value of Object.values(section.items)) expect(value).not.toContain('<!--');
      }
    });

    it(`${slug}: no block is left for the session end or the install offer, and nobody says "That is a session"`, () => {
      // Both went with ADR 0017; a block nothing reads is a block nobody keeps up to date.
      for (const heading of copy.sections.keys())
        expect(heading).not.toMatch(/^(Session end|Install steps)/);
      expect(copy.sections.get('Titles')?.items).not.toHaveProperty('session end');
      expect(copy.sections.get('Buttons')?.items).not.toHaveProperty('install');
      for (const section of copy.sections.values()) {
        expect(section.text).not.toContain('That is a session');
        for (const value of Object.values(section.items))
          expect(value).not.toContain('That is a session');
      }
    });

    it(`${slug}: the words a screen fills are still there`, () => {
      expect(copy.item('Reminder', 'description')).toContain('[link]');
      expect(copy.item('Your world', 'answered so far')).toContain('[n]');
    });

    it(`${slug}: no block is left for the intro screens, the toasts, the nudge on the card or the numbers of a round (ADR 0019)`, () => {
      for (const heading of [
        'Intro 1',
        'Intro 2',
        'Intro 3, consent',
        'Welcome: new here',
        'Card nudge',
      ])
        expect(copy.has(heading), heading).toBe(false);
      const keys = (heading: string) => Object.keys(copy.sections.get(heading)?.items ?? {});
      expect(keys('Titles')).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^(intro 1|intro 2|consent|demo card)$/)]),
      );
      expect(keys('Buttons')).not.toContain('new here');
      expect(keys('Buttons')).not.toContain('next');
      expect(keys('Card labels')).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^(position|tap to answer|click to answer)/),
        ]),
      );
      expect(keys('Card states')).toEqual(['saving']);
      expect(keys('Your world')).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^(tile label|progress)/)]),
      );
      expect(copy.item('Your world', 'summary')).not.toContain('[left]');
    });

    it(`${slug}: the welcome's title and workshop.json's name are the same words`, () => {
      const config = JSON.parse(readFileSync(join(root, slug, 'workshop.json'), 'utf8')) as {
        name: string;
      };
      expect(copy.text('Welcome: title')).toBe(config.name);
    });
  }
});

describe('a paragraph with bold lead-ins', () => {
  it('splits into plain and bold runs, and a text without stars is one plain run', () => {
    expect(inline('**What this is.** A set of questions, **not** a test.')).toEqual([
      { bold: true, text: 'What this is.' },
      { bold: false, text: ' A set of questions, ' },
      { bold: true, text: 'not' },
      { bold: false, text: ' a test.' },
    ]);
    expect(inline('Plain words.')).toEqual([{ bold: false, text: 'Plain words.' }]);
  });
});
