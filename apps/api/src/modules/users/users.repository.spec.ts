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
  order: Array<{ column: string; ascending: boolean }>;
  insert?: unknown;
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
      order(column: string, opts?: { ascending?: boolean }) {
        call.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      insert(row: unknown) {
        call.insert = row;
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
