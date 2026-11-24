import { describe, expect, it } from 'vitest';
import {
  WallabagConfigSchema,
  WallabagEntriesResponseSchema,
  WallabagEntrySchema,
  WallabagTokenResponseSchema,
} from '../src/wallabag';

// Realistic payloads, matching wallabag's REST API shape.
const article = {
  id: 4821,
  user_id: 1,
  uid: null,
  title: 'The Quiet Web',
  url: 'https://example.com/posts/quiet-web',
  given_url: 'https://example.com/posts/quiet-web',
  domain_name: 'example.com',
  preview_picture: null,
  mimetype: 'text/html',
  language: 'en',
  reading_time: 6,
  created_at: '2024-03-01T09:12:44+0000',
  updated_at: '2024-03-02T11:05:10+0000',
  published_at: null,
  published_by: [],
  is_archived: 0,
  is_starred: 0,
  tags: [{ id: 7, label: 'reading', slug: 'reading' }],
  annotations: [],
  hashed_url: 'a1b2c3d4e5f6',
  http_status: '200',
};

const entriesResponse = {
  page: 1,
  limit: 30,
  pages: 3,
  total: 64,
  _links: {
    self: { href: '/api/entries?page=1' },
    first: { href: '/api/entries?page=1' },
    last: { href: '/api/entries?page=3' },
    next: { href: '/api/entries?page=2' },
  },
  _embedded: { items: [article] },
};

const tokenResponse = {
  access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload.signature',
  expires_in: 3600,
  refresh_token: 'def50200c0ffee1234567890',
  token_type: 'bearer',
  scope: null,
};

describe('wallabag entries response', () => {
  it('accepts a paginated entries response', () => {
    const parsed = WallabagEntriesResponseSchema.parse(entriesResponse);

    expect(parsed.page).toBe(1);
    expect(parsed.pages).toBe(3);
    expect(parsed.total).toBe(64);
    expect(parsed._embedded.items).toHaveLength(1);

    const [entry] = parsed._embedded.items;
    expect(entry).toBeDefined();
    expect(entry?.id).toBe(4821);
    expect(entry?.title).toBe('The Quiet Web');
  });

  it('rejects a entries response missing _embedded', () => {
    const withoutEmbedded: Record<string, unknown> = { ...entriesResponse };
    delete withoutEmbedded._embedded;

    expect(() => WallabagEntriesResponseSchema.parse(withoutEmbedded))
      .toThrow(/_embedded/);
  });
});

describe('wallabag entry', () => {
  it('accepts a single article from the API', () => {
    const parsed = WallabagEntrySchema.parse(article);

    expect(parsed.id).toBe(4821);
    expect(parsed.url).toBe('https://example.com/posts/quiet-web');
    expect(parsed.domain_name).toBe('example.com');
    expect(parsed.is_archived).toBe(0);

    const [tag] = parsed.tags;
    expect(tag).toBeDefined();
    expect(tag?.label).toBe('reading');
  });

  it('rejects an article missing id', () => {
    const withoutId: Record<string, unknown> = { ...article };
    delete withoutId.id;

    expect(() => WallabagEntrySchema.parse(withoutId)).toThrow(/id/);
  });
});

describe('wallabag token response', () => {
  it('accepts an OAuth2 password grant response', () => {
    const parsed = WallabagTokenResponseSchema.parse(tokenResponse);

    expect(parsed.access_token).toBe(tokenResponse.access_token);
    expect(parsed.expires_in).toBe(3600);
    expect(parsed.refresh_token).toBe(tokenResponse.refresh_token);
    expect(parsed.token_type).toBe('bearer');
  });

  it('rejects a token response missing access_token', () => {
    const withoutToken: Record<string, unknown> = { ...tokenResponse };
    delete withoutToken.access_token;

    expect(() => WallabagTokenResponseSchema.parse(withoutToken))
      .toThrow(/access_token/);
  });
});

const wizardConfig = {
  server_url: 'https://wallabag.example.com',
  client_id: 'crossbag-client',
  client_secret: 'client-secret',
  username: 'reader',
  password: 'hunter2',
};

describe('wallabag config sync limit', () => {
  it('keeps a sync_limit of 50 written by the setup wizard', () => {
    const parsed = WallabagConfigSchema.parse({
      ...wizardConfig,
      sync_limit: 50,
    });

    expect(parsed.sync_limit).toBe(50);
  });

  it('still parses a config written before sync_limit existed', () => {
    const parsed = WallabagConfigSchema.parse({ ...wizardConfig });

    expect(parsed.sync_limit).toBeUndefined();
  });

  it('rejects a negative sync_limit', () => {
    const parsed = WallabagConfigSchema.safeParse({
      ...wizardConfig,
      sync_limit: -1,
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a sync_limit above 500', () => {
    const parsed = WallabagConfigSchema.safeParse({
      ...wizardConfig,
      sync_limit: 501,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('wallabag config date prefix', () => {
  it('accepts the date-prefixed filenames flag the wizard writes', () => {
    const parsed = WallabagConfigSchema.parse({
      ...wizardConfig,
      date_prefixed_filenames: true,
    });

    expect(parsed.date_prefixed_filenames).toBe(true);
  });

  it('leaves the flag off for configs written before it existed', () => {
    const parsed = WallabagConfigSchema.parse({ ...wizardConfig });

    expect(parsed.date_prefixed_filenames).toBeFalsy();
  });
});

describe('wallabag config auth body', () => {
  it('accepts the pre-encoded token body the wizard writes', () => {
    const authBody = 'grant_type=password&client_id=crossbag-client';

    const parsed = WallabagConfigSchema.parse({
      ...wizardConfig,
      auth_body: authBody,
    });

    expect(parsed.auth_body).toBe(authBody);
  });

  it('leaves the body optional for configs the wizard did not write', () => {
    const parsed = WallabagConfigSchema.parse({ ...wizardConfig });

    expect(parsed.auth_body).toBeUndefined();
  });
});

describe('wallabag config prune', () => {
  it('accepts the prune_on_sync flag the wizard writes', () => {
    const parsed = WallabagConfigSchema.parse({
      ...wizardConfig,
      prune_on_sync: false,
    });

    expect(parsed.prune_on_sync).toBe(false);
  });

  it('defaults the flag on for configs written before it existed', () => {
    const parsed = WallabagConfigSchema.parse({ ...wizardConfig });

    expect(parsed.prune_on_sync).toBe(true);
  });});
