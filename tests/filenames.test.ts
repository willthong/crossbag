import { describe, expect, it } from 'vitest';
import { chooseFilename, sanitizeFilenamePart } from '../src/plugin';

const ILLEGAL_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function expectNoIllegalChars(text: string): void {
  for (const char of ILLEGAL_CHARS) {
    expect(text, `filename part contained ${char}`).not.toContain(char);
  }
  expect(text, 'filename part contained a control character').not.toMatch(
    CONTROL_CHARS,
  );
}

describe('sanitizeFilenamePart', () => {
  it('strips filesystem-illegal characters from the title', () => {
    const sanitized = sanitizeFilenamePart('a/b\\c:d*e?f"g<h>i|j');

    expectNoIllegalChars(sanitized);
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain(':');
  });

  it('removes control characters', () => {
    const sanitized = sanitizeFilenamePart('a\u0000b\u0007c\u001fd');

    expect(sanitized).not.toMatch(CONTROL_CHARS);
    expect(sanitized).toContain('a');
    expect(sanitized).toContain('b');
    expect(sanitized).toContain('c');
    expect(sanitized).toContain('d');
  });

  it('trims whitespace and trailing dots and spaces', () => {
    expect(sanitizeFilenamePart('  Weekly digest...  ')).toBe('Weekly digest');
    expect(sanitizeFilenamePart('Weekly digest . . ')).toBe('Weekly digest');
  });

  it('collapses runs of whitespace to a single space', () => {
    expect(sanitizeFilenamePart('Weekly   \t  digest')).toBe('Weekly digest');
  });

  it('falls back to a non-empty placeholder when nothing survives', () => {
    const sanitized = sanitizeFilenamePart('///');

    expect(sanitized.length).toBeGreaterThan(0);
    expectNoIllegalChars(sanitized);
  });

  it('preserves non-ASCII letters', () => {
    expect(sanitizeFilenamePart('café')).toBe('café');
  });
});

describe('chooseFilename', () => {
  it('uses the sanitized title when the name is free', () => {
    const chosen = chooseFilename('Weekly digest', 4242, new Set());

    expect(chosen).toBe('Weekly digest.epub');
  });

  it('appends the article id when the title collides', () => {
    const existing = new Set(['Weekly digest.epub']);

    const chosen = chooseFilename('Weekly digest', 4242, existing);

    expect(chosen).toBe('Weekly digest-4242.epub');
  });

  it('prefixes the filename with the added date when one is given', () => {
    expect(chooseFilename('Weekly digest', 4242, new Set(), '240101')).toBe(
      '240101-Weekly digest.epub',
    );

    const sameDay = new Set(['240101-Weekly digest.epub']);
    expect(chooseFilename('Weekly digest', 4242, sameDay, '240101')).toBe(
      '240101-Weekly digest-4242.epub',
    );

    expect(chooseFilename('Weekly digest', 4242, new Set())).toBe(
      'Weekly digest.epub',
    );
  });

  it('compares collisions case-insensitively, as FAT does', () => {
    const existing = new Set(['WEEKLY DIGEST.EPUB']);

    const chosen = chooseFilename('Weekly digest', 4242, existing);

    expect(chosen).toBe('Weekly digest-4242.epub');
  });

  it('keeps making the name unique when the id-qualified name collides too', () => {
    const existing = new Set([
      'weekly digest.epub',
      'Weekly Digest-4242.EPUB',
    ]);

    const chosen = chooseFilename('Weekly digest', 4242, existing);

    expect(existing.has(chosen)).toBe(false);
    expect(chosen.endsWith('.epub')).toBe(true);
    expect(chooseFilename('Weekly digest', 4242, existing)).toBe(chosen);
  });

  it('sanitizes the title before building the filename', () => {
    const chosen = chooseFilename('Weekly/digest: 1', 7, new Set());

    expect(chosen).not.toContain('/');
    expect(chosen).not.toContain(':');
    expect(chosen.endsWith('.epub')).toBe(true);
  });

  it('always returns an .epub filename without path separators', () => {
    const cases = [
      ['Weekly digest', 1],
      ['///', 2],
      ['../etc/passwd', 3],
      ['a\\b:c*', 4],
      ['', 5],
    ] as const;
    const existing = new Set(['Weekly digest.epub']);

    for (const [title, id] of cases) {
      const chosen = chooseFilename(title, id, existing);

      expect(chosen.endsWith('.epub'), `${title} -> ${chosen}`).toBe(true);
      expect(chosen, `${title} -> ${chosen}`).not.toContain('/');
      expect(chosen, `${title} -> ${chosen}`).not.toContain('\\');
      expect(chosen.length).toBeGreaterThan('.epub'.length);
    }
  });
});
