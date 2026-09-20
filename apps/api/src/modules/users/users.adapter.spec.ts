import { describe, expect, it } from 'vitest';
import { usersAuthAdapter } from './users.adapter.js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';

describe('usersAuthAdapter.createAccount (US-021/AC-01, AC-10)', () => {
  it('resolves ok with the new user id, always sending email_confirm: true (US-021/AC-10 — half of its proof, design note §3.4)', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async createUser(attrs: { email: string; password: string; email_confirm?: boolean }) {
            expect(attrs.email).toBe('dana@company.com');
            expect(attrs.password).toBe('Correct1!x');
            // Without this, GoTrue itself can send a confirmation email in any project with
            // SMTP configured — an email nobody in this repository wrote code to send.
            expect(attrs.email_confirm).toBe(true);
            return { data: { user: { id: 'new-user-id' } }, error: null };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.createAccount('dana@company.com', 'Correct1!x');

    expect(outcome).toEqual({ kind: 'ok', userId: 'new-user-id' });
    setSupabaseForTesting(undefined);
  });

  it('resolves duplicate on GoTrue\'s own email_exists code (US-021/D-02 — defence in depth against the race the pre-check cannot close)', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async createUser() {
            return { data: { user: null }, error: { message: 'already registered', code: 'email_exists' } };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.createAccount('dana@company.com', 'Correct1!x');

    expect(outcome).toEqual({ kind: 'duplicate' });
    setSupabaseForTesting(undefined);
  });

  it('resolves unavailable, never throws, on any other admin error', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async createUser() {
            return { data: { user: null }, error: { message: 'network error', code: undefined } };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.createAccount('dana@company.com', 'Correct1!x');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseForTesting(undefined);
  });

  it('resolves unavailable when the admin call throws outright', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async createUser() {
            throw new Error('boom');
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.createAccount('dana@company.com', 'Correct1!x');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseForTesting(undefined);
  });

  it('resolves unavailable on a success shape with no user — defensive, not a documented GoTrue response', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async createUser() {
            return { data: { user: null }, error: null };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.createAccount('dana@company.com', 'Correct1!x');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseForTesting(undefined);
  });
});

describe('usersAuthAdapter.deleteAccount (ADR-011 — the compensating delete)', () => {
  it('calls admin.deleteUser with the userId and NO second argument (ADR-011 — a soft delete would leave the email occupied)', async () => {
    const calls: unknown[][] = [];
    setSupabaseForTesting({
      auth: {
        admin: {
          async deleteUser(...args: unknown[]) {
            calls.push(args);
            return { error: null };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.deleteAccount('a-user-id');

    expect(outcome).toEqual({ kind: 'ok' });
    expect(calls).toEqual([['a-user-id']]);
    setSupabaseForTesting(undefined);
  });

  it('resolves failed, never throws, when the delete errors', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async deleteUser() {
            return { error: { message: 'not found' } };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.deleteAccount('a-user-id');

    expect(outcome).toEqual({ kind: 'failed' });
    setSupabaseForTesting(undefined);
  });

  it('resolves failed when the delete throws outright', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async deleteUser() {
            throw new Error('boom');
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.deleteAccount('a-user-id');

    expect(outcome).toEqual({ kind: 'failed' });
    setSupabaseForTesting(undefined);
  });
});

describe('usersAuthAdapter.updateEmail (US-023/AC-05, AC-07)', () => {
  it('calls admin.updateUserById with ONE attribute plus email_confirm — never a password key (US-023/AC-05, AC-07)', async () => {
    const calls: unknown[][] = [];
    setSupabaseForTesting({
      auth: {
        admin: {
          async updateUserById(...args: unknown[]) {
            calls.push(args);
            return { data: { user: { id: 'a-user-id' } }, error: null };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.updateEmail('a-user-id', 'dana.okafor@company.com');

    expect(outcome).toEqual({ kind: 'ok' });
    expect(calls).toEqual([['a-user-id', { email: 'dana.okafor@company.com', email_confirm: true }]]);
    setSupabaseForTesting(undefined);
  });

  it("resolves duplicate on GoTrue's own email_exists code (US-023, reusing createAccount's branch)", async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async updateUserById() {
            return { data: { user: null }, error: { message: 'already registered', code: 'email_exists' } };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.updateEmail('a-user-id', 'dana.okafor@company.com');

    expect(outcome).toEqual({ kind: 'duplicate' });
    setSupabaseForTesting(undefined);
  });

  it('resolves unavailable, never throws, on any other admin error', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async updateUserById() {
            return { data: { user: null }, error: { message: 'network error', code: undefined } };
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.updateEmail('a-user-id', 'dana.okafor@company.com');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseForTesting(undefined);
  });

  it('resolves unavailable when the admin call throws outright', async () => {
    setSupabaseForTesting({
      auth: {
        admin: {
          async updateUserById() {
            throw new Error('boom');
          },
        },
      },
    } as never);

    const outcome = await usersAuthAdapter.updateEmail('a-user-id', 'dana.okafor@company.com');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseForTesting(undefined);
  });
});
