/**
 * ESLint flat config.
 *
 * Deliberately small. A linter that drowns a codebase in stylistic warnings gets
 * ignored, so this only enforces the three classes of bug that have actually
 * cost time on this project: undefined identifiers, hook-rule violations, and
 * unused code.
 */
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['dist/**', 'data/**', 'node_modules/**', 'coverage/**', 'install.log'],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // The codebase uses JSX comments and unescaped apostrophes in user-facing
      // copy, both of which the default rules flag noisily.
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',

      // This project is JavaScript-only by design, so there are no propTypes to
      // validate. The rule exists to catch TypeScript-less drift that this
      // codebase intentionally does not have.
      'react/prop-types': 'off',

      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // The server and tooling are plain Node ESM: no JSX, no browser globals.
    files: ['server/**/*.js', 'scripts/**/*.js', 'shared/**/*.js', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },

  {
    // Node's own test files use describe/it/expect as globals.
    files: ['tests/**/*.js', 'tests/**/*.jsx'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
