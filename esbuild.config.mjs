import { build } from 'esbuild';

await build({
  entryPoints: ['src/plugin.ts'],
  outfile: 'crossbag.crosspoint-plugin/plugin.js',
  bundle: true,
  // Keep the generated payload readable, but compact syntax so the 36 KB
  // bundle-size gate leaves room for features rather than comments and
  // redundant punctuation.
  minify: false,
  minifySyntax: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
});
