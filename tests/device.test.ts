import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DeviceSchema, TemplateStringSchema } from '../src/device';

interface RawDevice {
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
    format: 'json' | 'xml';
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

// Load the real payload so this fixture cannot drift from what ships.
const devicePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'crossbag.crosspoint-plugin',
  'device.json',
);

const device = JSON.parse(await readFile(devicePath, 'utf8')) as RawDevice;

const ALLOWED_VARIABLES = [
  '{cfg.server_url}',
  '{cfg.client_id}',
  '{cfg.auth_body}',
  '{token}',
  '{page}',
  '{limit}',
  '{id}',
  '{title}',
  '{author}',
  '{url}',
  '{query}',
  '{query_raw}',
];

describe('template strings', () => {
  it.each(ALLOWED_VARIABLES)(
    'accepts the %s variable alongside literal text',
    (variable) => {
      const template = `prefix/${variable}/suffix`;

      expect(TemplateStringSchema.parse(template)).toBe(template);
    },
  );

  it.each(['{cfg.}', '{unknown}', '{token'])(
    'rejects the malformed template %s',
    (template) => {
      expect(() => TemplateStringSchema.parse(template))
        .toThrow(/placeholder/i);
    },
  );

  it('accepts literal text with no placeholders', () => {
    expect(TemplateStringSchema.parse('plain text, no placeholders'))
      .toBe('plain text, no placeholders');
  });
});

describe('device catalog', () => {
  it('accepts a valid device.json', () => {
    const parsed = DeviceSchema.parse(device);

    expect(parsed.title).toBe('Crossbag');
    expect(parsed.config.file).toBe('config.json');
    expect(parsed.auth.request.url)
      .toBe('{cfg.server_url}/oauth/v2/token');
    expect(parsed.auth.token.path).toBe('access_token');
    expect(parsed.browse.items).toBe('_embedded.items');
    expect(parsed.browse.page_size).toBe(8);
    expect(parsed.browse.fields.url).toBe('url');
    expect(parsed.download.url)
      .toBe('{cfg.server_url}/api/entries/{id}/export.epub');
    expect(parsed.download.dest_dir).toBe('/Wallabag');
    expect(parsed.download.filename).toBe('{title}.epub');
  });

  it('rejects a browse block with no url', () => {
    const browseWithoutUrl: Record<string, unknown> = { ...device.browse };
    delete browseWithoutUrl.url;

    expect(() => DeviceSchema.parse({ ...device, browse: browseWithoutUrl }))
      .toThrow(/url/i);
  });

  it('rejects a page_size above the firmware limit of 16', () => {
    const browse = { ...device.browse, page_size: 17 };

    expect(() => DeviceSchema.parse({ ...device, browse })).toThrow(
      /page_size/i,
    );
  });

  it('keeps browse and download headers in the parsed result', () => {
    const headers = { Authorization: 'Bearer {token}' };
    const authorized = {
      ...device,
      browse: { ...device.browse, headers },
      download: { ...device.download, headers },
    };

    const parsed = DeviceSchema.parse(authorized);

    expect(parsed.browse.headers).toEqual(headers);
    expect(parsed.download.headers).toEqual(headers);
  });

  it('rejects a headers value that is a number', () => {
    const browse = {
      ...device.browse,
      headers: { Authorization: 42 },
    };

    expect(() => DeviceSchema.parse({ ...device, browse })).toThrow(
      /headers/i,
    );
  });

  it('rejects an unknown template variable in a header value', () => {
    const browse = {
      ...device.browse,
      headers: { Authorization: 'Bearer {unknown}' },
    };

    expect(() => DeviceSchema.parse({ ...device, browse }))
      .toThrow(/placeholder/i);
  });

  it('accepts empty headers on browse and download', () => {
    const parsed = DeviceSchema.parse({
      ...device,
      browse: { ...device.browse, headers: {} },
      download: { ...device.download, headers: {} },
    });

    expect(parsed.browse.headers).toEqual({});
    expect(parsed.download.headers).toEqual({});
  });
});

interface Sidecar {
  path: string;
  body: string;
}

describe('download sidecar', () => {
  const sidecar: Sidecar = {
    path: '{dest}.meta.json',
    body: '{"book_id":{id}}',
  };

  function parsedSidecar(value: unknown): Sidecar | undefined {
    const parsed = DeviceSchema.parse({
      ...device,
      download: { ...device.download, sidecar: value },
    });

    return parsed.download.sidecar;
  }

  it('parses a sidecar that names a path and a body', () => {
    expect(parsedSidecar(sidecar)?.path).toBe('{dest}.meta.json');
  });

  it('rejects a sidecar with no path', () => {
    expect(() => parsedSidecar({ body: sidecar.body })).toThrow(/path/i);
  });

  it('rejects a sidecar with a non-string body', () => {
    expect(() => parsedSidecar({ path: sidecar.path, body: 42 }))
      .toThrow(/body/i);
  });
});
