import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES, ERROR_CODES } from '@wb/contracts';
import { Copy, fill, inline, missing, parseCopy } from '../src/lib/copy.ts';

const SAMPLE = `# Copy: sample

Lines above the first heading are not a block.

## Intro 1 (under 60 words)

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
    expect(sections.map((s) => s.heading)).toEqual(['Intro 1', 'Buttons', 'Final words', 'Empty']);
    expect(by('Intro 1').note).toBe('under 60 words');
    expect(by('Final words').note).toBe('');
  });

  it('joins soft-wrapped lines and keeps paragraphs apart', () => {
    expect(by('Intro 1').text).toBe(
      'First paragraph, on one line.\n\nSecond paragraph, soft-wrapped onto two lines.',
    );
  });

  it('strips the [placeholder] marker and remembers it', () => {
    expect(by('Intro 1').placeholder).toBe(true);
    expect(by('Intro 1').text).not.toContain('[placeholder]');
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

describe('looking words up', () => {
  const copy = Copy.parse(SAMPLE);

  it('returns the text of a block and the entries of a list', () => {
    expect(copy.text('Intro 1')).toContain('First paragraph');
    expect(copy.paragraphs('Intro 1')).toHaveLength(2);
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
    expect(copy.placeholders()).toEqual(['Intro 1']);
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
