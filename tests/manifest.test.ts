import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '../src/manifest';

// Matches the Plugin Hub manifest contract used by the payload ticket.
const manifest = {
  name: 'crossbag',
  title: 'Crossbag',
  description: 'Pull wallabag articles onto your device as EPUBs',
  author: 'crossbag contributors',
  version: '0.1.0',
  compatibility: {
    firmware_family: ['crosspoint'],
    plugin_api_min: 1,
  },
  files: [
    'manifest.json',
    'device.json',
    'plugin.js',
    'README.md',
    'DETAILS.md',
  ],
};

describe('plugin manifest', () => {
  it('accepts a valid Plugin Hub manifest', () => {
    const parsed = ManifestSchema.parse(manifest);

    expect(parsed.name).toBe('crossbag');
    expect(parsed.title).toBe('Crossbag');
    expect(parsed.version).toBe('0.1.0');
    expect(parsed.files).toContain('device.json');
    expect(parsed.compatibility?.firmware_family).toEqual(['crosspoint']);
  });

  it('accepts a manifest without compatibility', () => {
    const withoutCompatibility: Record<string, unknown> = { ...manifest };
    delete withoutCompatibility.compatibility;

    const parsed = ManifestSchema.parse(withoutCompatibility);

    expect(parsed.compatibility).toBeUndefined();
  });

  it('rejects an uppercase plugin name', () => {
    const invalid = { ...manifest, name: 'Crossbag' };

    expect(() => ManifestSchema.parse(invalid)).toThrow(/name/i);
  });

  it('rejects a two-part version', () => {
    const invalid = { ...manifest, version: '1.0' };

    expect(() => ManifestSchema.parse(invalid)).toThrow(/version/i);
  });

  it('rejects a manifest missing name', () => {
    const withoutName: Record<string, unknown> = { ...manifest };
    delete withoutName.name;

    expect(() => ManifestSchema.parse(withoutName)).toThrow(/name/i);
  });
});
