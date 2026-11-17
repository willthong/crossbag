import { build } from 'esbuild';

await build({
  entryPoints: ['src/plugin.ts'],
  outfile: 'crossbag.crosspoint-plugin/plugin.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
});
