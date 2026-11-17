import { z } from 'zod';

export const ManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  mount: z.enum(['settings', 'files']).optional(),
  files: z.array(z.string()),
  compatibility: z
    .object({
      firmware_family: z.array(z.string()),
      plugin_api_min: z.number(),
    })
    .optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
