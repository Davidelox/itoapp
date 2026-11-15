// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Nada de console en la app: los errores pasan por lib/registro.ts (docs/plan-onboarding.md §5.1).
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['lib/registro.ts'],
    rules: { 'no-console': 'error' },
  },
]);
