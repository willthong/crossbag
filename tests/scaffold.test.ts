import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

interface PackageJson {
  scripts?: Record<string, string>;
}

interface FlatConfig {
  rules?: Record<string, unknown>;
}

async function readJson<T>(file: string): Promise<T> {
  const contents = await readFile(path.join(root, file), 'utf8');
  return JSON.parse(contents) as T;
}

describe('repository scaffold', () => {
  it('declares the required package scripts', async () => {
    const pkg = await readJson<PackageJson>('package.json');
    const required = [
      'build',
      'typecheck',
      'lint',
      'test',
      'test:watch',
      'check',
    ];
    for (const script of required) {
      expect(pkg.scripts, `missing script: ${script}`).toHaveProperty(script);
    }
  });

  it('has an eslint config file', async () => {
    await expect(
      access(path.join(root, 'eslint.config.mjs')),
    ).resolves.toBeUndefined();
  });

  it('configures max-len at 90 chars with ignoreStrings', async () => {
    const configUrl = pathToFileURL(
      path.join(root, 'eslint.config.mjs'),
    ).href;
    const mod = (await import(configUrl)) as { default?: unknown };
    const raw = mod.default;
    const configs = (
      Array.isArray(raw) ? raw.flat(Infinity) : [raw]
    ) as FlatConfig[];
    const maxLen = configs
      .map((config) => config.rules?.['max-len'])
      .find((rule) => rule !== undefined);
    expect(maxLen).toBeDefined();
    const [, options] = maxLen as [
      string,
      { code?: number; ignoreStrings?: boolean },
    ];
    expect(options.code).toBe(90);
    expect(options.ignoreStrings).toBe(true);
  });
});
