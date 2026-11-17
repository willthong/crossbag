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

interface ManifestJson {
  name: string;
  version: string;
  files: string[];
}

interface DeviceJson {
  title: string;
  config: { file: string };
  auth: {
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    token: { path?: string };
  };
  browse: {
    format: string;
    url: string;
    items: string;
    page_size: number;
    headers?: Record<string, string>;
    fields: Record<string, string>;
  };
  download: {
    url: string;
    dest_dir: string;
    filename: string;
    headers?: Record<string, string>;
    sidecar?: { path: string; body: string };
  };
}

async function readJson<T>(file: string): Promise<T> {
  const contents = await readFile(file, 'utf8');
  return JSON.parse(contents) as T;
}

async function payloadDir(): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.crosspoint-plugin'));
  expect(dirs).toEqual(['crossbag.crosspoint-plugin']);
  return path.join(root, 'crossbag.crosspoint-plugin');
}

describe('plugin payload', () => {
  it('lives in a directory whose stem is the manifest name', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<ManifestJson>(
      path.join(dir, 'manifest.json'),
    );

    expect(path.basename(dir)).toBe('crossbag.crosspoint-plugin');
    expect(path.basename(dir).replace(/\.crosspoint-plugin$/, ''))
      .toBe(manifest.name);
  });

  it('has a manifest.json that matches ManifestSchema', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<unknown>(
      path.join(dir, 'manifest.json'),
    );

    expect(() => ManifestSchema.parse(manifest)).not.toThrow();
  });

  it('mounts the setup wizard on the web UI Plugins page', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<unknown>(
      path.join(dir, 'manifest.json'),
    );

    // mount defaults to "settings", which renders the card on /plugins.
    // Declare it explicitly so the wizard's location is never implicit.
    expect(ManifestSchema.parse(manifest).mount).toBe('settings');
  });

  it('declares only payload files that exist on disk', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<ManifestJson>(
      path.join(dir, 'manifest.json'),
    );

    for (const file of manifest.files) {
      await expect(
        readFile(path.join(dir, file)),
        `declared payload file is missing: ${file}`,
      ).resolves.toBeDefined();
    }
  });

  it('contains no files beyond those declared in the manifest', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<ManifestJson>(
      path.join(dir, 'manifest.json'),
    );
    const onDisk = await readdir(dir);

    expect([...onDisk].sort()).toEqual([...manifest.files].sort());
  });

  it('has a device.json that matches DeviceSchema', async () => {
    const dir = await payloadDir();
    const device = await readJson<unknown>(path.join(dir, 'device.json'));

    expect(() => DeviceSchema.parse(device)).not.toThrow();
  });

  it('keeps manifest version in step with package.json', async () => {
    const dir = await payloadDir();
    const manifest = await readJson<ManifestJson>(
      path.join(dir, 'manifest.json'),
    );
    const pkg = await readJson<{ version: string }>(
      path.join(root, 'package.json'),
    );

    expect(manifest.version).toBe(pkg.version);
  });
});

describe('device catalog content', () => {
  async function device(): Promise<DeviceJson> {
    const dir = await payloadDir();
    return readJson<DeviceJson>(path.join(dir, 'device.json'));
  }

  it('reads its credentials from config.json', async () => {
    const raw = await device();

    expect(raw.config.file).toBe('config.json');
  });

  it('sends the pre-encoded OAuth2 password token body from config', async () => {
    const raw = await device();

    expect(raw.auth.request.url)
      .toBe('{cfg.server_url}/oauth/v2/token');
    expect(raw.auth.request.body).toBe('{cfg.auth_body}');
  });

  it('browses unread articles eight at a time', async () => {
    const raw = await device();

    expect(raw.browse.url).toContain('/api/entries');
    expect(raw.browse.url).toContain('archive=0');
    expect(raw.browse.page_size).toBe(8);
  });

  it('downloads EPUB exports into /Wallabag', async () => {
    const raw = await device();

    expect(raw.download.url).toContain('/export.epub');
    expect(raw.download.dest_dir).toBe('/Wallabag');
  });

  it('authorizes both browse and download with the stored token', async () => {
    const raw = await device();

    expect(raw.browse.headers?.Authorization)
      .toContain('Bearer {token}');
    expect(raw.download.headers?.Authorization)
      .toContain('Bearer {token}');
  });

  it('writes the article id beside each catalog download', async () => {
    const raw = await device();

    expect(raw.download.sidecar?.path).toBe('{dest}.meta.json');
    expect(raw.download.sidecar?.body).toContain('book_id');
  });
});
