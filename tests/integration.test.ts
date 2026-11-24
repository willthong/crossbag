import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DeviceSchema } from '../src/device';
import { ManifestSchema } from '../src/manifest';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const payloadDir = path.join(root, 'crossbag.crosspoint-plugin');

const config: Record<string, string> = {
  'cfg.server_url': 'https://wb.example.com',
  'cfg.client_id': 'crossbag-client',
  'cfg.client_secret': 'shhh',
  'cfg.username': 'reader',
  'cfg.password': 'hunter2',
  'cfg.auth_body':
    'grant_type=password&client_id=crossbag-client&client_secret=shhh' +
    '&username=reader&password=hunter2',
};

interface ManifestJson {
  name: string;
  version: string;
  files: string[];
}

async function readJson<T>(file: string): Promise<T> {
  const contents = await readFile(file, 'utf8');
  return JSON.parse(contents) as T;
}

async function manifest(): Promise<ManifestJson> {
  return readJson<ManifestJson>(path.join(payloadDir, 'manifest.json'));
}

async function device() {
  return DeviceSchema.parse(
    await readJson<unknown>(path.join(payloadDir, 'device.json')),
  );
}

function resolve(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{([^}]+)\}/g,
    (match, key: string) => vars[key] ?? match,
  );
}

describe('payload files on disk', () => {
  it('declares every payload file and each one is non-empty', async () => {
    const declared = await manifest();

    for (const file of declared.files) {
      const contents = await readFile(path.join(payloadDir, file));
      expect(contents.length, `empty payload file: ${file}`)
        .toBeGreaterThan(0);
    }
  });

  it('contains no files beyond those declared in the manifest', async () => {
    const declared = await manifest();
    const onDisk = await readdir(payloadDir);

    expect([...onDisk].sort()).toEqual([...declared.files].sort());
  });

  it('lives in a directory whose stem matches the manifest name', async () => {
    const declared = await manifest();
    const stem = path.basename(payloadDir)
      .replace(/\.crosspoint-plugin$/, '');

    expect(stem).toBe(declared.name);
  });

  it('validates manifest.json and device.json against their schemas', async () => {
    const rawManifest = await readJson<unknown>(
      path.join(payloadDir, 'manifest.json'),
    );
    const rawDevice = await readJson<unknown>(
      path.join(payloadDir, 'device.json'),
    );

    expect(() => ManifestSchema.parse(rawManifest)).not.toThrow();
    expect(() => DeviceSchema.parse(rawDevice)).not.toThrow();
  });
});

describe('release version', () => {
  it('matches package.json and the newest CHANGELOG entry', async () => {
    const declared = await manifest();
    const pkg = await readJson<{ version: string }>(
      path.join(root, 'package.json'),
    );
    const changelog = await readFile(
      path.join(root, 'CHANGELOG.md'),
      'utf8',
    );
    const published = changelog
      .split('\n')
      .filter((line) => /^##\s+/.test(line))
      .map((line) => line.replace(/^##\s+v?/, '').trim());

    expect(declared.version).toBe(pkg.version);
    expect(published).toContain(declared.version);
  });
});

describe('built plugin.js', () => {
  it('registers a plugin and stays a self-contained script', async () => {
    const source = await readFile(
      path.join(payloadDir, 'plugin.js'),
      'utf8',
    );

    expect(source).toContain('registerPlugin');
    expect(source).not.toMatch(/\bimport\s/);
    expect(source).not.toMatch(/\bexport\s/);
    expect(source).not.toContain('require(');
  });

  it('stays under 36 KB and ships no zod runtime', async () => {
    const source = await readFile(
      path.join(payloadDir, 'plugin.js'),
      'utf8',
    );

    expect(Buffer.byteLength(source)).toBeLessThan(36 * 1024);
    expect(source).not.toMatch(/\bzod\b/i);
  });
});

describe('wallabag api calls', () => {
  it('resolves the browse url to the unread entries endpoint', async () => {
    const catalog = await device();
    const url = resolve(catalog.browse.url, {
      ...config,
      page: '2',
      limit: '8',
    });

    expect(url).toBe(
      'https://wb.example.com/api/entries?archive=0&sort=created&order=desc'
      + '&page=2&perPage=8',
    );
  });

  it('resolves the download url to the article EPUB export', async () => {
    const catalog = await device();
    const url = resolve(catalog.download.url, {
      ...config,
      id: '4242',
    });

    expect(url).toBe('https://wb.example.com/api/entries/4242/export.epub');
  });

  it('resolves the auth request body from config as a password grant', async () => {
    const catalog = await device();
    const url = resolve(catalog.auth.request.url, config);
    const body = resolve(catalog.auth.request.body, config);

    expect(url).toBe('https://wb.example.com/oauth/v2/token');
    expect(body).toContain('grant_type=password');
    expect(body).toContain('client_id=crossbag-client');
    expect(body).not.toContain('{');
  });

  it('authorizes browse and download with the stored token', async () => {
    const catalog = await device();

    expect(catalog.browse.headers?.Authorization)
      .toContain('Bearer {token}');
    expect(catalog.download.headers?.Authorization)
      .toContain('Bearer {token}');
  });
});
