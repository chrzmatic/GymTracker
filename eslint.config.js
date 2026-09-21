/** Configuração do ESLint (flat config). Sem build: só ES Modules nativos. */
export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        crypto: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        IDBKeyRange: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  },
  { ignores: ['lib/**', 'node_modules/**'] },
];
