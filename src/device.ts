import { z } from 'zod';

const TEMPLATE = /\{([^{}]*)\}/g;

const ALLOWED_VARIABLES = new Set([
  'token',
  'page',
  'limit',
  'id',
  'title',
  'author',
  'url',
  'query',
  'query_raw',
  'dest',
]);

function isAllowedVariable(name: string): boolean {
  return ALLOWED_VARIABLES.has(name) || /^cfg\.[A-Za-z0-9_]+$/.test(name);
}

/**
 * Allow literal text plus well-formed `{...}` placeholders. Every placeholder
 * must name a known variable, and the literal text left once placeholders are
 * removed must have balanced braces, so JSON bodies such as `{"book_id":{id}}`
 * are fine while unclosed or stray brace groups are not.
 */
function hasWellFormedTemplates(value: string): boolean {
  const malformed = [...value.matchAll(TEMPLATE)].some(
    (match) => !isAllowedVariable(match[1] ?? ''),
  );
  if (malformed) return false;

  const remaining = value.replace(TEMPLATE, '');
  const opens = remaining.split('{').length - 1;
  const closes = remaining.split('}').length - 1;

  return opens === closes;
}

export const TemplateStringSchema = z.string().refine(hasWellFormedTemplates, {
  message: 'malformed or unknown template placeholder',
});

export const DeviceSchema = z.object({
  title: z.string(),
  config: z.object({ file: z.string() }),
  auth: z.object({
    request: z.object({
      method: z.string(),
      url: TemplateStringSchema,
      headers: z.record(z.string(), TemplateStringSchema),
      body: TemplateStringSchema,
    }),
    token: z.object({
      file: z.string().optional(),
      path: z.string().optional(),
    }),
    poll: z.record(z.string(), z.unknown()).optional(),
  }),
  browse: z.object({
    format: z.enum(['json', 'xml']),
    url: TemplateStringSchema,
    method: z.string().optional(),
    headers: z.record(z.string(), TemplateStringSchema).optional(),
    items: z.string(),
    page_size: z.number().int().max(16),
    fields: z.record(z.string(), z.string()),
    lists: z.record(z.string(), z.unknown()).optional(),
    lists_url: TemplateStringSchema.optional(),
    search: z.record(z.string(), z.unknown()).optional(),
  }),
  download: z.object({
    url: TemplateStringSchema,
    headers: z.record(z.string(), TemplateStringSchema).optional(),
    dest_dir: TemplateStringSchema,
    filename: z.string(),
    sidecar: z
      .object({
        path: TemplateStringSchema,
        body: TemplateStringSchema,
      })
      .optional(),
  }),
});

export type Device = z.infer<typeof DeviceSchema>;
