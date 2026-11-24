import { z } from 'zod';

// Arrays stay honestly typed: wallabag returns empty arrays for untagged
// articles and for pages past the end, so callers must handle a missing first
// element under `noUncheckedIndexedAccess`.

export const WallabagTagSchema = z.object({
  id: z.number(),
  label: z.string(),
  slug: z.string(),
});

export const WallabagEntrySchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  domain_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  is_archived: z.number(),
  is_starred: z.number(),
  tags: z.array(WallabagTagSchema),
  given_url: z.string().optional(),
  mimetype: z.string().optional(),
  language: z.string().optional(),
  reading_time: z.number().optional(),
  preview_picture: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  published_by: z.array(z.string()).optional(),
  hashed_url: z.string().optional(),
  http_status: z.string().optional(),
});

export const WallabagEntriesResponseSchema = z.object({
  page: z.number(),
  pages: z.number(),
  total: z.number(),
  _embedded: z.object({ items: z.array(WallabagEntrySchema) }),
  limit: z.number().optional(),
  _links: z.record(z.string(), z.object({ href: z.string() })).optional(),
});

export const WallabagTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  scope: z.string().nullable().optional(),
});

export const WallabagConfigSchema = z.object({
  server_url: z.string(),
  client_id: z.string(),
  client_secret: z.string(),
  username: z.string(),
  password: z.string(),
  // Pre-encoded `application/x-www-form-urlencoded` token request body. The
  // on-reader catalog substitutes `{cfg.auth_body}` because the firmware
  // inserts `{cfg.KEY}` values raw, so a password containing `&` or `+` would
  // otherwise corrupt the password grant.
  auth_body: z.string().optional(),
  sync_limit: z.number().int().min(1).max(500).optional(),
  // Optional so configs written before the flag existed keep today's naming.
  date_prefixed_filenames: z.boolean().optional(),
  // Optional and pruning by default, so a config written before the flag
  // existed still mirrors the unread list instead of growing forever.
  prune_on_sync: z.boolean().default(true),
  // Optional and off by default, so a config written before the flag existed
  // keeps the unread-only mirror.
  sync_favourites: z.boolean().default(false),
  // Optional and defaulting to the historical folder, so a config written
  // before the field existed keeps working. Sync normalizes invalid values.
  wallabag_dir: z.string().default('/Wallabag'),
});

export type WallabagTag = z.infer<typeof WallabagTagSchema>;
export type WallabagEntry = z.infer<typeof WallabagEntrySchema>;
export type WallabagEntriesResponse = z.infer<
  typeof WallabagEntriesResponseSchema
>;
export type WallabagTokenResponse = z.infer<
  typeof WallabagTokenResponseSchema
>;
export type WallabagConfig = z.infer<typeof WallabagConfigSchema>;
