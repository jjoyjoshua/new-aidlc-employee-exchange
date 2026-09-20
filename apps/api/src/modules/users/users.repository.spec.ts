/**
 * A recording-fake Supabase client for `UsersRepository`, matching the pattern
 * `desks.repository.spec.ts` established. This proves the QUERY we issue — in particular that
 * `listAccounts` carries the `.or()` clause `buildSearchFilter` produces only when `q` is
 * present, and that `getSummaryCounts` issues NO `.or()`/`.ilike()` call at all (design note
 * §2.2 item 2 — it is the one query touching every row and it carries no PII, but it must also
 * carry no filter).
 *
 * This fake needs an `or()` recorder no existing fake in this repository has
 * (`.ilike()`/`.or()` appear nowhere else in `apps/api/src` — design note §10 note 2). It proves
 * only "the query we issue" — never "the query Postgres runs against that string" — that is
 * `admin.concurrency.spec.ts`'s gated real-Postgres case (design note §2.3, A2).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { usersRepository } from './users.repository.js';
import { buildSearchFilter } from './search-filter.js';

interface RecordedCall {
  table: string;
  select?: string;
  or?: string;
  eq: Array<[string, unknown]>;
  neq?: [string, unknown];
  gte?: [string, unknown];
  order: Array<{ column: string; ascending: boolean }>;
  insert?: unknown;
  update?: Record<string, unknown>;
  maybeSingle?: true;
}

type FakeResponse = { data: unknown; error: { code?: string; message: string } | null };

function fakeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, eq: [], order: [] };
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      or(filter: string) {
        call.or = filter;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
        return builder;
      },
      neq(column: string, value: unknown) {
        call.neq = [column, value];
        return builder;
      },
      gte(column: string, value: unknown) {
        call.gte = [column, value];
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        call.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      insert(row: unknown) {
        call.insert = row;
        return builder;
      },
      update(values: Record<string, unknown>) {
        call.update = values;
        return builder;
      },
      maybeSingle() {
        call.maybeSingle = true;
        calls.push(call);
        return Promise.resolve(response);
      },
      then(onFulfilled: (value: FakeResponse) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(response).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { calls, client: { from } as unknown as SupabaseClient };
}

interface RecordedRpcCall {
  name: string;
  args: unknown;
}

/** US-025. This module's first `.rpc()` fake — `deactivateAccount` never calls `.from()`, so the
 *  table-recording `fakeSupabase` above does not apply. Records the RPC name and its argument
 *  object so a test can assert the exact wire contract (design note §2.1, §3.1) without touching
 *  real Postgres — that proof is `admin.concurrency.spec.ts`'s gated case, not this file's job. */
function fakeSupabaseRpc(response: FakeResponse) {
  const calls: RecordedRpcCall[] = [];
  function rpc(name: string, args: unknown) {
    calls.push({ name, args });
    return Promise.resolve(response);
  }
  return { calls, client: { rpc } as unknown as SupabaseClient };
}

const ROW_A = { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', full_name: 'Dana Silva', email: 'dana@company.com', role: 'employee', is_active: true };
const ROW_B = { id: '4f2504e0-4f89-41d3-9a0c-0305e82c3302', full_name: 'Marcus Webb', email: 'marcus@company.com', role: 'admin', is_active: false };

describe('usersRepository.listAccounts — no search term (US-020/AC-01)', () => {
  it('selects id, full_name, email, role, is_active ordered by full_name, with NO .or() call', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW_A, ROW_B], error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.listAccounts();

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [],
          order: [{ column: 'full_name', ascending: true }],
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns the rows unfiltered', async () => {
    const { client } = fakeSupabase({ data: [ROW_A, ROW_B], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.listAccounts();
      expect(result).toEqual([ROW_A, ROW_B]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty list rather than throwing when there are no accounts', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.listAccounts()).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.listAccounts()).rejects.toThrow(/user accounts lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.listAccounts — a search term (US-020/AC-04)', () => {
  it('carries the EXACT .or() string buildSearchFilter produces for a plain term', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW_A], error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.listAccounts('dana');

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [],
          order: [{ column: 'full_name', ascending: true }],
          or: buildSearchFilter('dana'),
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('carries the escaped .or() string for a term containing a metacharacter — the repository does not re-derive the escaping', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.listAccounts('a_b');
      expect(calls[0]?.or).toBe(buildSearchFilter('a_b'));
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.getSummaryCounts — the whole-list composition read (US-020/AC-02, AC-06)', () => {
  it('selects role, is_active ONLY — no id, no email, no full_name (design note §7 — no PII at all)', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW_A, ROW_B], error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.getSummaryCounts();

      expect(calls).toEqual([{ table: 'user_profiles', select: 'role, is_active', eq: [], order: [] }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('issues NO .or() call — the whole table, unfiltered, regardless of any search term (US-020/AC-06)', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW_A, ROW_B], error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.getSummaryCounts();
      expect(calls[0]?.or).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns the raw role/is_active rows for the service to tally', async () => {
    // Real Postgres would only ever return the SELECTed columns; this fake echoes whatever data
    // it is handed, so the fixture is shaped like the actual select — not the full table row.
    const summaryRows = [
      { role: 'employee', is_active: true },
      { role: 'admin', is_active: false },
    ];
    const { client } = fakeSupabase({ data: summaryRows, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.getSummaryCounts();
      expect(result).toEqual(summaryRows);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty list rather than throwing on an empty table', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.getSummaryCounts()).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.getSummaryCounts()).rejects.toThrow(/user summary lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.findByEmail (US-021/AC-06, D-02)', () => {
  it('selects full_name, is_active ONLY, matched on the given email — no id, no role', async () => {
    const { calls, client } = fakeSupabase({ data: { full_name: 'Dana Silva', is_active: true }, error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.findByEmail('dana@company.com');

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'full_name, is_active',
          eq: [['email', 'dana@company.com']],
          order: [],
          maybeSingle: true,
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns the row when the email is already held', async () => {
    const { client } = fakeSupabase({ data: { full_name: 'Dana Silva', is_active: false }, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.findByEmail('dana@company.com');
      expect(result).toEqual({ full_name: 'Dana Silva', is_active: false });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined, not null, when nobody holds the email', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.findByEmail('nobody@company.com')).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.findByEmail('dana@company.com')).rejects.toThrow(/email lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('issues no .neq() at all when excludeId is omitted — the two existing US-021 call sites (US-023)', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.findByEmail('dana@company.com');
      expect(calls[0]?.neq).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('carries a .neq(id, excludeId) clause when excludeId is given (US-023/AC-02, AC-03 — defence in depth)', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.findByEmail('dana@company.com', '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
      expect(calls[0]?.neq).toEqual(['id', '3f2504e0-4f89-41d3-9a0c-0305e82c3301']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.insertProfile (US-021/AC-01, AC-08)', () => {
  it('inserts id, email, full_name, role ONLY — no is_active, no must_change_password (both are column defaults)', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.insertProfile({
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        email: 'dana@company.com',
        fullName: 'Dana Silva',
        role: 'employee',
      });

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          eq: [],
          order: [],
          insert: {
            id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
            email: 'dana@company.com',
            full_name: 'Dana Silva',
            role: 'employee',
          },
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.insertProfile({
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'dana@company.com',
          fullName: 'Dana Silva',
          role: 'employee',
        }),
      ).rejects.toThrow(/profile insert failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.findById (US-023 — read before any write, design note §2.6)', () => {
  it('selects id, full_name, email, role, is_active, keyed on id', async () => {
    const { calls, client } = fakeSupabase({ data: ROW_A, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.findById(ROW_A.id);

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [['id', ROW_A.id]],
          order: [],
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual(ROW_A);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined, not null, when no account holds the id', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.findById('missing-id')).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.findById(ROW_A.id)).rejects.toThrow(/user lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.updateProfileDetails (US-023/AC-01, AC-07 — this module\'s first UPDATE)', () => {
  const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z');

  it('updates full_name, email and updated_at ONLY, keyed on id — never must_change_password, never is_active (US-023/AC-06)', async () => {
    const row = { ...ROW_A, full_name: 'Dana Okafor', email: 'dana.okafor@company.com' };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.updateProfileDetails({
        id: ROW_A.id,
        fullName: 'Dana Okafor',
        email: 'dana.okafor@company.com',
        updatedAt: UPDATED_AT,
      });

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [['id', ROW_A.id]],
          order: [],
          update: { full_name: 'Dana Okafor', email: 'dana.okafor@company.com', updated_at: UPDATED_AT.toISOString() },
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ kind: 'ok', profile: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('this is also the COMPENSATING restore\'s own statement — called again with the remembered old values (ADR-012)', async () => {
    const row = { ...ROW_A };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      await usersRepository.updateProfileDetails({
        id: ROW_A.id,
        fullName: ROW_A.full_name,
        email: ROW_A.email,
        updatedAt: UPDATED_AT,
      });

      expect(calls[0]?.update).toEqual({
        full_name: ROW_A.full_name,
        email: ROW_A.email,
        updated_at: UPDATED_AT.toISOString(),
      });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when no row matches the id — zero rows, not an error (US-023)', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.updateProfileDetails({
        id: 'missing-id',
        fullName: 'Dana Silva',
        email: 'dana@company.com',
        updatedAt: UPDATED_AT,
      });
      expect(result).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "duplicate" } on a 23505 naming user_profiles_email_key (US-023/AC-02)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "user_profiles_email_key"' },
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.updateProfileDetails({
        id: ROW_A.id,
        fullName: 'Dana Silva',
        email: 'marcus@company.com',
        updatedAt: UPDATED_AT,
      });
      expect(result).toEqual({ kind: 'duplicate' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23505 naming an unrecognised index', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other_key"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.updateProfileDetails({
          id: ROW_A.id,
          fullName: 'Dana Silva',
          email: 'dana@company.com',
          updatedAt: UPDATED_AT,
        }),
      ).rejects.toThrow(/unrecognised unique violation/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any other repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.updateProfileDetails({
          id: ROW_A.id,
          fullName: 'Dana Silva',
          email: 'dana@company.com',
          updatedAt: UPDATED_AT,
        }),
      ).rejects.toThrow(/user update failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

/**
 * US-024/AC-01, AC-04, AC-07, AC-12 (design note §3.2, §3.3 — this module's first write to
 * `role`). Names `role` and `updated_at` ONLY, keyed on `id` — never `is_active`, never the
 * later deactivation story's own `deactivated_at` column, never `must_change_password`, the same
 * discipline `updateProfileDetails` states for its own two columns.
 *
 * `.maybeSingle()`, never `.single()` — `updateProfileDetails`'s own reason: zero rows must
 * answer `{ kind: 'not_found' }`, not a thrown Postgres error.
 *
 * The `blocked` mapping matches `error.code === 'Z0011'` ONLY — the SQLSTATE
 * `user_profiles_require_active_admin()` raises (migration `0004_last_active_admin_guard.sql`),
 * a code minted by this project and raised by exactly one statement in the whole schema. This is
 * deliberately NOT the two-part match `updateProfileDetails` needs for `23505` (design note
 * §3.1-§3.2): `23505` is raised by every unique index in the schema, so the index name in the
 * message disambiguates; `Z0011` needs no second discriminator. The negative test below is the
 * one that would fail if a message match crept in.
 */
describe('usersRepository.setRole (US-024/AC-01, AC-04, AC-07, AC-12)', () => {
  const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z');

  it('updates role and updated_at ONLY, keyed on id — never is_active, never must_change_password', async () => {
    const row = { ...ROW_A, role: 'admin' as const };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.setRole({ id: ROW_A.id, role: 'admin', updatedAt: UPDATED_AT });

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [['id', ROW_A.id]],
          order: [],
          update: { role: 'admin', updated_at: UPDATED_AT.toISOString() },
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ kind: 'ok', profile: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when no row matches the id — zero rows, not an error', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.setRole({ id: 'missing-id', role: 'employee', updatedAt: UPDATED_AT });
      expect(result).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "blocked" } on the Z0011 SQLSTATE the last-active-admin trigger raises (US-024/AC-04, AC-07)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: 'Z0011', message: 'BR-001.11: this change would leave the office with no active administrator' },
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.setRole({ id: ROW_A.id, role: 'employee', updatedAt: UPDATED_AT });
      expect(result).toEqual({ kind: 'blocked' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws — never "blocked" — on the SAME message under the DEFAULT SQLSTATE: the match is on the code, not the prose', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: 'P0001', message: 'BR-001.11: this change would leave the office with no active administrator' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.setRole({ id: ROW_A.id, role: 'employee', updatedAt: UPDATED_AT }),
      ).rejects.toThrow(/role change failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any other repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.setRole({ id: ROW_A.id, role: 'employee', updatedAt: UPDATED_AT }),
      ).rejects.toThrow(/role change failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.previewDeactivation (US-025/AC-05)', () => {
  it('selects id, booking_date and the joined desk_number, filtered on user_id/status/booking_date >= from', async () => {
    const { calls, client } = fakeSupabase({
      data: [{ id: 'b-1', booking_date: '2026-09-08', desks: { desk_number: 'A-01' } }],
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.previewDeactivation(ROW_A.id, 'confirmed', '2026-09-08');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, booking_date, desks(desk_number)',
          eq: [
            ['user_id', ROW_A.id],
            ['status', 'confirmed'],
          ],
          gte: ['booking_date', '2026-09-08'],
          order: [],
        },
      ]);
      expect(result).toEqual([{ id: 'b-1', desk_number: 'A-01', booking_date: '2026-09-08' }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty list rather than throwing when nothing qualifies (US-025/AC-07\'s population)', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.previewDeactivation(ROW_A.id, 'confirmed', '2026-09-08')).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined desk — desk_id is NOT NULL, this would be a bug', async () => {
    const { client } = fakeSupabase({ data: [{ id: 'b-1', booking_date: '2026-09-08', desks: null }], error: null });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.previewDeactivation(ROW_A.id, 'confirmed', '2026-09-08')).rejects.toThrow(
        /has no joined desk/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.previewDeactivation(ROW_A.id, 'confirmed', '2026-09-08')).rejects.toThrow(
        /deactivation preview lookup failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

/**
 * US-025/AC-01, AC-02, AC-04, AC-10, AC-12 (design note §2.1–§2.3, §3.1). Proves the four
 * PostgREST argument names are the exact wire contract the migration expects, and that the four
 * `outcome` values the RPC can return each map to the right repository kind — including the
 * negative that matters: the SAME refusal MESSAGE under the default SQLSTATE must throw, never
 * be reported as `blocked`, the identical discipline `setRole`'s own negative test proves.
 */
describe('usersRepository.deactivateAccount (US-025/AC-01, AC-02, AC-04, AC-10, AC-12)', () => {
  const NOW = new Date('2026-09-20T10:00:00.000Z');
  const INPUT = { id: ROW_A.id, actorId: 'actor-1', now: NOW, today: '2026-09-20' as const };

  it('calls the RPC with exactly the four documented argument names', async () => {
    const { calls, client } = fakeSupabaseRpc({
      data: { outcome: 'ok', profile: { ...ROW_A, is_active: false }, cancelled_bookings: [] },
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      await usersRepository.deactivateAccount(INPUT);

      expect(calls).toEqual([
        {
          name: 'deactivate_account_cascade',
          args: {
            p_target_id: ROW_A.id,
            p_actor_id: 'actor-1',
            p_now: NOW.toISOString(),
            p_today: '2026-09-20',
          },
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "ok" } with the deactivated profile and each cancelled booking mapped to camelCase', async () => {
    const { client } = fakeSupabaseRpc({
      data: {
        outcome: 'ok',
        profile: { ...ROW_A, is_active: false },
        cancelled_bookings: [
          {
            id: 'b-1',
            desk_id: 'd-1',
            desk_number: 'A-01',
            booking_date: '2026-09-20',
            cancellation_source: 'deactivation_cascade',
          },
        ],
      },
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.deactivateAccount(INPUT);
      expect(result).toEqual({
        kind: 'ok',
        profile: { ...ROW_A, is_active: false },
        cancelledBookings: [
          {
            id: 'b-1',
            deskId: 'd-1',
            deskNumber: 'A-01',
            bookingDate: '2026-09-20',
            cancellationSource: 'deactivation_cascade',
          },
        ],
      });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "ok" } with an empty cancelledBookings array when nothing qualified (US-025/AC-07\'s population)', async () => {
    const { client } = fakeSupabaseRpc({
      data: { outcome: 'ok', profile: { ...ROW_A, is_active: false }, cancelled_bookings: [] },
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.deactivateAccount(INPUT);
      expect(result).toEqual({ kind: 'ok', profile: { ...ROW_A, is_active: false }, cancelledBookings: [] });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when the outcome is not_found — no profile in the payload', async () => {
    const { client } = fakeSupabaseRpc({ data: { outcome: 'not_found' }, error: null });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.deactivateAccount(INPUT)).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "already_inactive" } with the profile — distinct from not_found, design note §2.2', async () => {
    const { client } = fakeSupabaseRpc({
      data: { outcome: 'already_inactive', profile: { ...ROW_A, is_active: false }, cancelled_bookings: [] },
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.deactivateAccount(INPUT);
      expect(result).toEqual({ kind: 'already_inactive', profile: { ...ROW_A, is_active: false } });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "blocked" } on the Z0011 SQLSTATE the last-active-admin trigger raises (US-025/AC-10)', async () => {
    const { client } = fakeSupabaseRpc({
      data: null,
      error: { code: 'Z0011', message: 'BR-001.11: this change would leave the office with no active administrator' },
    });
    setSupabaseForTesting(client);

    try {
      expect(await usersRepository.deactivateAccount(INPUT)).toEqual({ kind: 'blocked' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws — never "blocked" — on the SAME message under the DEFAULT SQLSTATE: the match is on the code, not the prose', async () => {
    const { client } = fakeSupabaseRpc({
      data: null,
      error: { code: 'P0001', message: 'BR-001.11: this change would leave the office with no active administrator' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.deactivateAccount(INPUT)).rejects.toThrow(/account deactivation failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on PGRST202 (schema cache / mis-spelled argument) rather than mapping it to any outcome', async () => {
    const { client } = fakeSupabaseRpc({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.deactivateAccount(INPUT)).rejects.toThrow(/account deactivation failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on an unrecognised outcome value — a bug, never a refusal', async () => {
    const { client } = fakeSupabaseRpc({ data: { outcome: 'something_new' }, error: null });
    setSupabaseForTesting(client);

    try {
      await expect(usersRepository.deactivateAccount(INPUT)).rejects.toThrow(/unrecognised deactivation outcome/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.activateAccount (US-026/AC-01, AC-03, AC-04, AC-05, AC-07)', () => {
  const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z');

  it('updates is_active and updated_at ONLY, keyed on id, and touches no bookings row — never role (US-026/AC-03), never must_change_password (US-026/AC-05), never a booking (US-026/AC-04)', async () => {
    const row = { ...ROW_B, is_active: true };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.activateAccount({ id: ROW_B.id, updatedAt: UPDATED_AT });

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [['id', ROW_B.id]],
          order: [],
          update: { is_active: true, updated_at: UPDATED_AT.toISOString() },
          maybeSingle: true,
        },
      ]);
      expect(calls[0]?.update).not.toHaveProperty('role');
      expect(calls[0]?.update).not.toHaveProperty('must_change_password');
      expect(calls[0]?.update).not.toHaveProperty('deactivated_at');
      expect(result).toEqual({ kind: 'ok', profile: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when no row matches the id — zero rows, not an error (US-026/AC-07)', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.activateAccount({ id: 'missing-id', updatedAt: UPDATED_AT });
      expect(result).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any repository error — reactivation never fires the last-active-admin trigger, so there is no "blocked" kind to map to', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.activateAccount({ id: ROW_B.id, updatedAt: UPDATED_AT }),
      ).rejects.toThrow(/account activation failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('usersRepository.armMustChangePassword (US-027/AC-07, AC-10)', () => {
  const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z');

  it('updates must_change_password and updated_at ONLY, keyed on id, RETURNING the same five columns activateAccount does (US-027/AC-07)', async () => {
    const row = { ...ROW_A };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.armMustChangePassword({ id: ROW_A.id, updatedAt: UPDATED_AT });

      expect(calls).toEqual([
        {
          table: 'user_profiles',
          select: 'id, full_name, email, role, is_active',
          eq: [['id', ROW_A.id]],
          order: [],
          update: { must_change_password: true, updated_at: UPDATED_AT.toISOString() },
          maybeSingle: true,
        },
      ]);
      expect(calls[0]?.update).not.toHaveProperty('role');
      expect(calls[0]?.update).not.toHaveProperty('is_active');
      expect(result).toEqual({ kind: 'ok', profile: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "ok" } unconditionally, even when the account was already must_change_password: true — a repeat has no side effect to double-fire (US-027/AC-10)', async () => {
    const row = { ...ROW_A };
    const { client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.armMustChangePassword({ id: ROW_A.id, updatedAt: UPDATED_AT });
      expect(result).toEqual({ kind: 'ok', profile: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when no row matches the id — zero rows, not an error (US-027/AC-01)', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await usersRepository.armMustChangePassword({ id: 'missing-id', updatedAt: UPDATED_AT });
      expect(result).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        usersRepository.armMustChangePassword({ id: ROW_A.id, updatedAt: UPDATED_AT }),
      ).rejects.toThrow(/must_change_password arming failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});
