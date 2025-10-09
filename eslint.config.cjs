// ESLint flat config for TypeScript + jsdoc + sonarjs (minimal ruleset)
// See: https://eslint.org/docs/latest/use/configure/migration-guide

// Load dependencies via CommonJS requires (flat config file itself is not type-checked)
const tseslint = require('typescript-eslint');
const jsdoc = require('eslint-plugin-jsdoc');
const sonarjs = require('eslint-plugin-sonarjs');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'coverage/**',
      'data/**',
      'testws/**',
      '**/*.d.ts',
      'dist/**',
      '__mocks__/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
    },
    plugins: {
      jsdoc,
      sonarjs,
    },
    settings: {
      jsdoc: { mode: 'typescript' },
    },
    rules: {
      // Minimal required rules from the request
      'sonarjs/cognitive-complexity': ['error', 10],
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-returns': 'error',
    },
  },
  // In tests, relax JSDoc requirements to reduce noise
  {
    files: ['test/**/*.ts', 'src/test/**/*.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
    },
  },
];
