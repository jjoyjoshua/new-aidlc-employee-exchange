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

// Hoisted so every block that needs the ADR-001 ban restates the IDENTICAL entry. Flat config
// REPLACES `no-restricted-imports` per matching block rather than merging it (see the comment
// on the "Configuration is read in one place" block below) — a block that sets the rule with
// its OWN `paths`/`patterns` and forgets one of these silently drops that ban for every file it
// matches. `moduleBoundaries` below did exactly this before US-034 (Architect design note §3.3,
// F-7): all five module directories could import `@supabase/supabase-js` directly, because
// their `no-restricted-imports` never restated Boundary 1's `paths`. Fixed here, in the same
// change that adds the mailer boundary, since both are instances of the same mistake.
// `allowTypeImports: true` (the TS-aware `@typescript-eslint/no-restricted-imports`, not the
// core rule) — a repository-fake test file legitimately writes `import type { SupabaseClient }`
// for its fake's return type (bookings.repository.spec.ts and siblings). That carries no
// runtime client and no service-role key; only a VALUE import constructs one.
const SUPABASE_CLIENT_BAN = {
  name: '@supabase/supabase-js',
  message:
    'Only apps/api/src/infra/supabase may construct a Supabase client. ADR-001 is worthless ' +
    'if any module can open its own connection, and it keeps the service-role key in one file.',
  allowTypeImports: true,
};

// US-034/AC-08. `infra/mailer` is importable only from `modules/notifications` — a second mail
// path must not be able to appear silently. Every block below that owns `no-restricted-imports`
// for a file `infra/mailer` could reach adds this pattern, EXCEPT the `notifications` module's
// own block, which needs to import it. (Architect design note §3.2, F-1 — the original draft of
// this boundary was a single new block over `apps/**/*.ts`, which would have replaced, not
// merged, the rule for every other file it matched, silently deleting the bans above.)
const MAILER_BAN = {
  group: ['**/infra/mailer/**', '../infra/mailer/**', '../../infra/mailer/**'],
  message:
    'infra/mailer is importable only from modules/notifications (US-034/AC-08) — every message ' +
    'type sends through notifications.service.ts’s recordAndSend, so there is exactly one mail ' +
    'path. Add a port there instead of importing the transport directly.',
};

/** One rule per module: you may not reach into a sibling module's internals, you may not open
 *  your own Supabase client (F-7), and — except `notifications` itself — you may not import
 *  `infra/mailer` directly (FR-07). */
const moduleBoundaries = MODULES.map((self) => {
  const forbidden = MODULES.filter(
    (other) => other !== self && !MAY_IMPORT[self].includes(other),
  );
  const patterns = forbidden.map((other) => ({
    group: [`../${other}`, `../${other}/**`, `**/modules/${other}/**`],
    message:
      `modules/${self} may not import modules/${other}. Modules collaborate through ` +
      `domain/ or a declared port — see app-architecture.md §3. A module that imports ` +
      `another module's service is a module that can no longer be changed alone.`,
  }));
  if (self !== 'notifications') patterns.push(MAILER_BAN);

  return {
    files: [`apps/api/src/modules/${self}/**/*.ts`],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { paths: [SUPABASE_CLIENT_BAN] }],
      'no-restricted-imports': ['error', { patterns }],
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
  //
  // Also carries the mailer boundary (US-034/AC-08, MAILER_BAN) for everything this block
  // covers that `moduleBoundaries` does not re-cover more specifically — http/, domain/, infra/
  // itself. `ignores` excludes infra/supabase (this ban) but NOT infra/mailer: MAILER_BAN's own
  // group excludes nothing, because `notifications` needing the exemption is handled by
  // `moduleBoundaries` overriding this block for files under `modules/notifications/**` (flat
  // config: the LAST matching block wins, and `moduleBoundaries` is appended after this one).
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    ignores: ['apps/api/src/infra/supabase/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [{ ...SUPABASE_CLIENT_BAN, message: SUPABASE_CLIENT_BAN.message + ' The browser client is the single exception below.' }] },
      ],
      'no-restricted-imports': ['error', { patterns: [MAILER_BAN] }],
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
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Only apps/api/src/infra/supabase (server) and apps/ui/src/lib/supabase-client.ts ' +
                '(browser, anon key, token refresh only) may construct a Supabase client.',
              allowTypeImports: true,
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
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
            // US-034/AC-08. Restated because this block sets its own `patterns` (flat config
            // replaces, not merges) — the browser has no business reaching infra/mailer at all,
            // but the general form above already covers `apps/api/**`; this entry is here so
            // the intent is explicit rather than incidental.
            MAILER_BAN,
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
                'crosses the wire, plus the rules both sides must evaluate identically ' +
                '(evaluatePasswordPolicy, booking-window) — persistence, HTTP and auth stay in ' +
                'apps/api/src/domain.',
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
    rules: { 'no-restricted-imports': 'off', '@typescript-eslint/no-restricted-imports': 'off' },
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
