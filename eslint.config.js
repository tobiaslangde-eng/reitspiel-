export default [
  {
    files: ['src/**/*.js', 'server.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', screen: 'readonly', localStorage: 'readonly',
        performance: 'readonly', requestAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly', URL: 'readonly', confirm: 'readonly',
        prompt: 'readonly', process: 'readonly', location: 'readonly', TextDecoder: 'readonly', fetch: 'readonly', caches: 'readonly', self: 'readonly', Blob: 'readonly', matchMedia: 'readonly', Response: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-const-assign': 'error',
    },
  },
];
