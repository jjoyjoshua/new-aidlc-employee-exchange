// The architecture's import boundaries, as rules rather than as good intentions.
//
// `inception/architecture/app-architecture.md` §3 lists five boundaries and marks the first
// three "worth enforcing in tooling, not just agreeing to". This file is that enforcement.
// Crossing one of these is a design change, not an eslint-disable comment.
//
// This file is a protected path (`ai/standards/task-surfaces.md`): any change here is Complex.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** The five server modules, and the ones each is allowed to reach for.
 *  `notifications` is the named asymmetry (architecture §2): `bookings` and `users` call it,
 *  it calls neither, and nobody else calls it at all. */
const MODULES = ['auth', 'users', 'desks', 'bookings', 'notifications'];
const MAY_IMPORT = {
  auth: [],
  users: ['notifications'],
  desks: [],
  bookings: ['notifications'],
  notifications: [],
};

/** One rule per module: you may not reach into a sibling module's internals. */
const moduleBoundaries = MODULES.map((self) => {
  const forbidden = MODULES.filter(
    (other) => other !== self && !MAY_IMPORT[self].includes(other),
  );
  return {
    files: [`apps/api/src/modules/${self}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: forbidden.map((other) => ({
            group: [`../${other}`, `../${other}/**`, `**/modules/${other}/**`],
            message:
              `modules/${self} may not import modules/${other}. Modules collaborate through ` +
              `domain/ or a declared port — see app-architecture.md §3. A module that imports ` +
              `another module's service is a module that can no longer be changed alone.`,
          })),
        },
      ],
    },
  };
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'tools/**', // framework-owned, locked by ai/framework-lock.json
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // A leading underscore is the conventional "deliberately unused" marker: a destructured
  // omission in a test, or Express's four-argument error-handler signature, which only counts
  // as an error handler because the fourth parameter is there.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // ---- Configuration is read in one place -------------------------------------
  // US-034/AC-04: read once at startup, validated, and the process refuses to boot on a bad
  // value. `process.env` scattered through feature code is how a missing value becomes a
  // silent default instead of a failed boot.
  //
  // The rule targets `process.env` specifically, not `process`. Banning the whole global
  // would also ban `process.exit` in the bootstrap, whose entire job is to refuse to start —
  // and a rule that forbids the correct thing gets disabled, then stops protecting anything.
  //
  // This block sits ABOVE the boundary blocks deliberately: flat config REPLACES a rule
  // rather than merging it, so a later block setting `no-restricted-properties` would
  // silently delete whatever an earlier one set. domain/ below sets both restrictions and,
  // being later and stricter, wins.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/config/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Configuration is read and validated once in src/config, which refuses to start ' +
            'the process on a missing or malformed value (US-034/AC-04). Import from there.',
        },
      ],
    },
  },

  // ---- Boundary 1: the service-role key lives in exactly one module -----------
  // It bypasses every RLS policy in the project (ADR-001). One file constructs the client;
  // everything else asks that file. A second importer is a blocker finding, not a style note.
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    ignores: ['apps/api/src/infra/supabase/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Only apps/api/src/infra/supabase may construct a Supabase client. ADR-001 is ' +
                'worthless if any module can open its own connection, and it keeps the ' +
                'service-role key in one file. The browser client is the single exception below.',
            },
          ],
        },
      ],
    },
  },

  // ---- Boundary 4: the browser cannot reach the server package ----------------
  // ADR-002: this is what keeps infra/supabase — and the service-role key it holds —
  // unreachable from a browser bundle. It is the reason a shared package was chosen over
  // TypeScript path mapping.
  //
  // NOTE: this block RESTATES the @supabase/supabase-js ban from the apps/** block above.
  // Flat config REPLACES `no-restricted-imports` rather than merging it, so omitting the
  // restatement would silently delete that ban for apps/ui — the exact hole ADR-001 exists
  // to close, and the most important boundary in the project.
  {
    files: ['apps/ui/**/*.ts', 'apps/ui/**/*.tsx'],
    ignores: ['apps/ui/src/lib/supabase-client.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Only apps/api/src/infra/supabase (server) and apps/ui/src/lib/supabase-client.ts ' +
                '(browser, anon key, token refresh only) may construct a Supabase client.',
            },
          ],
          patterns: [
            {
              // Three forms, because this rule matches the import STRING, not the resolved
              // path. `**/apps/api/**` alone lets `../../api/src/http/app.js` straight through
              // — verified by deliberate violation on 2026-09-17, which is why the relative
              // form is listed separately (ADR-002 follow-up 2).
              group: ['@desk-booking/api', '**/apps/api/**', '../**/api/src/**'],
              message:
                'apps/ui may not import from apps/api. That package holds infra/supabase and the ' +
                'service-role key, which bypasses every RLS policy in the project. Shared wire ' +
                'shapes go in @desk-booking/contracts (ADR-002).',
            },
          ],
        },
      ],
    },
  },

  // ---- Boundary 5: the contract depends on neither side -----------------------
  {
    files: ['libs/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // The relative form is listed for the same reason as Boundary 4: this rule
              // matches the import string, not the resolved path.
              group: ['@desk-booking/api', '@desk-booking/ui', '**/apps/**', '../**/apps/**'],
              message:
                'libs/contracts depends on zod and nothing else (ADR-002). It describes what ' +
                'crosses the wire; the rules live in apps/api/src/domain.',
            },
          ],
        },
      ],
    },
  },

  // The browser's one permitted Supabase client: anon key and token refresh only.
  // It never reads a table, and since ADR-003 it never signs in either (ADR-001, ADR-003).
  // This must stay AFTER Boundary 4 or it exempts nothing.
  {
    files: ['apps/ui/src/lib/supabase-client.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // ---- Boundary 2: domain/ is pure -------------------------------------------
  // The rules take every input as an argument, including today's date. That is what makes
  // most acceptance criteria unit-testable with no database and no clock mocking.
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'express',
                '@supabase/*',
                '../modules/**',
                '../infra/**',
                '../http/**',
                '../config/**',
                '**/modules/**',
                '**/infra/**',
                '**/http/**',
                '**/config/**',
              ],
              message:
                'domain/ holds the rules as pure functions: no I/O, no framework, no config. ' +
                'It takes every input as an argument — including today\u2019s date. If a rule ' +
                'seems to need one of these, the plumbing belongs in the calling service.',
            },
          ],
          paths: [
            {
              name: 'node:fs',
              message: 'domain/ performs no I/O (app-architecture.md §2).',
            },
          ],
        },
      ],
      // A rule that reads the clock is a rule that cannot be tested at a boundary date.
      // Both entries, because this replaces the generic block above rather than adding to it.
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message:
            'domain/ takes the date as an argument. Ask the caller for it; infra/clock is ' +
            'where "now" comes from.',
        },
        {
          object: 'process',
          property: 'env',
          message: 'domain/ reads no configuration — take it as an argument.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'domain/ reads no configuration — take it as an argument.' },
      ],
    },
  },

  // ---- Boundary 3: modules do not reach into each other -----------------------
  ...moduleBoundaries,

  // ---- Configuration is read in one place -------------------------------------
  // US-034/AC-04: read once at startup, validated, and the process refuses to boot on a bad
  // value. `process.env` scattered through feature code is how a missing value becomes a
  // silent default instead of a failed boot.

  // ---- Server hygiene ----------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      // Structured JSON through infra/logger — and console.log is how a token or a
      // service-role key ends up in a log line (security-standards.md).
      'no-console': 'error',
    },
  },

  // Tests may do what production code may not.
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-console': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
