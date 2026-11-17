import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'crossbag.crosspoint-plugin/plugin.js',
      'dist/',
      'node_modules/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      'max-len': ['error', { code: 90, ignoreStrings: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
);
