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
]);

function isAllowedVariable(name: string): boolean {
  return ALLOWED_VARIABLES.has(name) || /^cfg\.[A-Za-z0-9_]+$/.test(name);
}

/**
 * Allow literal text plus well-formed `{...}` placeholders. Anything left
 * over after removing valid placeholders (including stray or unclosed braces)
 * makes the template malformed.
 */
function hasWellFormedTemplates(value: string): boolean {
  const remaining = value.replace(
    TEMPLATE,
    (match, name: string) => (isAllowedVariable(name) ? '' : match),
  );

  return !/[{}]/.test(remaining);
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
    dest_dir: z.string(),
    filename: z.string(),
  }),
});

export type Device = z.infer<typeof DeviceSchema>;
