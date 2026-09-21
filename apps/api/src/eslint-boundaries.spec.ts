/**
 * `eslint.config.mjs` is a protected path (`ai/standards/task-surfaces.md`) whose entire value
 * is that it never silently weakens. `npm run lint` alone cannot prove that: a rule a later
 * block silently DELETED (flat config replaces `no-restricted-imports` per block, not merges
 * it) looks identical to a rule that was never violated — `npm run lint` stays green either
 * way. This is exactly what happened once already (Architect design note §3.3, F-7, fixed in
 * the same change that added the mailer boundary below) and almost happened a second time in
 * this story's own first draft (design note §3.2, F-1).
 *
 * So this asks ESLint's own resolver what a representative file under each boundary actually
 * ends up with, rather than asserting a comment's promise.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function configFor(relativeFile: string) {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  return eslint.calculateConfigForFile(resolve(REPO_ROOT, relativeFile));
}

function restrictedImportRules(config: Awaited<ReturnType<typeof configFor>>): unknown[] {
  const rules = config.rules ?? {};
  return [
    ...(Array.isArray(rules['no-restricted-imports']) ? [rules['no-restricted-imports']] : []),
    ...(Array.isArray(rules['@typescript-eslint/no-restricted-imports'])
      ? [rules['@typescript-eslint/no-restricted-imports']]
      : []),
  ];
}

function bansSupabaseClient(config: Awaited<ReturnType<typeof configFor>>): boolean {
  return restrictedImportRules(config).some((rule) => {
    const options = (rule as [unknown, { paths?: Array<{ name?: string }> }])[1];
    return (options?.paths ?? []).some((p) => p.name === '@supabase/supabase-js');
  });
}

function bansMailer(config: Awaited<ReturnType<typeof configFor>>): boolean {
  return restrictedImportRules(config).some((rule) => {
    const options = (rule as [unknown, { patterns?: Array<{ group?: string[] }> }])[1];
    return (options?.patterns ?? []).some((p) => (p.group ?? []).some((g) => g.includes('infra/mailer')));
  });
}

describe('eslint.config.mjs — the boundaries stay live (US-034/AC-08, design note F-8)', () => {
  it('still bans a direct Supabase client everywhere except infra/supabase (ADR-001)', async () => {
    expect(await bansSupabaseClient(await configFor('apps/api/src/http/app.ts'))).toBe(true);
    expect(await bansSupabaseClient(await configFor('apps/ui/src/lib/api-client.ts'))).toBe(true);
    expect(await bansSupabaseClient(await configFor('apps/api/src/modules/bookings/bookings.service.ts'))).toBe(true);
  });

  it('does NOT ban a Supabase client inside infra/supabase itself — the one legitimate holder', async () => {
    expect(await bansSupabaseClient(await configFor('apps/api/src/infra/supabase/index.ts'))).toBe(false);
  });

  it('still bans apps/ui importing from apps/api (ADR-002)', async () => {
    const config = await configFor('apps/ui/src/lib/api-client.ts');
    const banned = restrictedImportRules(config).some((rule) => {
      const options = (rule as [unknown, { patterns?: Array<{ group?: string[] }> }])[1];
      return (options?.patterns ?? []).some((p) => (p.group ?? []).includes('@desk-booking/api'));
    });
    expect(banned).toBe(true);
  });

  it('still bans a cross-module import (architecture §3)', async () => {
    const config = await configFor('apps/api/src/modules/bookings/bookings.service.ts');
    const bannedAuth = restrictedImportRules(config).some((rule) => {
      const options = (rule as [unknown, { patterns?: Array<{ group?: string[] }> }])[1];
      return (options?.patterns ?? []).some((p) => (p.group ?? []).some((g) => g.includes('modules/auth')));
    });
    expect(bannedAuth).toBe(true);
  });

  it('bans infra/mailer from every module except notifications (US-034/AC-08)', async () => {
    expect(await bansMailer(await configFor('apps/api/src/modules/bookings/bookings.service.ts'))).toBe(true);
    expect(await bansMailer(await configFor('apps/api/src/http/app.ts'))).toBe(true);
    expect(await bansMailer(await configFor('apps/ui/src/lib/api-client.ts'))).toBe(true);
  });

  it('does NOT ban infra/mailer from modules/notifications — the one path AC-08 permits', async () => {
    expect(await bansMailer(await configFor('apps/api/src/modules/notifications/notifications.service.ts'))).toBe(false);
  });
});
