import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Standard browser globals
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        // FoundryVTT globals available at runtime
        game: 'readonly',
        Hooks: 'readonly',
        foundry: 'readonly',
        DialogV2: 'readonly',
        ProseMirror: 'readonly',
        ui: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['tools/**/*.mjs', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    ignores: ['vendor/', 'node_modules/'],
  },
];
