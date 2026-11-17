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
