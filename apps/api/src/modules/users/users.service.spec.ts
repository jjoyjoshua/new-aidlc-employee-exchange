import { describe, expect, it } from 'vitest';
import { createUsersService } from './users.service.js';
import type {
  EmailLookupRow,
  InsertProfileInput,
  ProfileDetailsRow,
  UpdateProfileDetailsInput,
  UpdateProfileDetailsOutcome,
  UserAccountRow,
  UsersRepository,
  UserSummaryRow,
} from './users.repository.js';
import type { UsersAuthAdapter } from './users.adapter.js';

const NOW_MS = new Date('2026-09-20T10:00:00.000Z').getTime();

interface StubOptions {
  accountsByQuery: (q: string | undefined) => UserAccountRow[];
  summaryRows: UserSummaryRow[];
}

function stubRepository({ accountsByQuery, summaryRows }: StubOptions): {
  repository: UsersRepository;
  listAccountsCalls: Array<string | undefined>;
  summaryCallCount: () => number;
} {
  const listAccountsCalls: Array<string | undefined> = [];
  let summaryCalls = 0;
  return {
    listAccountsCalls,
    summaryCallCount: () => summaryCalls,
    repository: {
      async listAccounts(q) {
        listAccountsCalls.push(q);
        return accountsByQuery(q);
      },
      async getSummaryCounts() {
        summaryCalls += 1;
        return summaryRows;
      },
      async findByEmail() {
        throw new Error('findByEmail not stubbed — this suite does not exercise createAccount/updateAccount');
      },
      async insertProfile() {
        throw new Error('insertProfile not stubbed — this suite does not exercise createAccount');
      },
      async findById() {
        throw new Error('findById not stubbed — this suite does not exercise updateAccount');
      },
      async updateProfileDetails() {
        throw new Error('updateProfileDetails not stubbed — this suite does not exercise updateAccount');
      },
    },
  };
}

function notStubbedUsersAuth(): UsersAuthAdapter {
  return {
    async createAccount() {
      throw new Error('createAccount not stubbed — this suite does not exercise it');
    },
    async deleteAccount() {
      throw new Error('deleteAccount not stubbed — this suite does not exercise it');
    },
    async updateEmail() {
      throw new Error('updateEmail not stubbed — this suite does not exercise it');
    },
  };
}

function service(repository: UsersRepository, usersAuth: UsersAuthAdapter = notStubbedUsersAuth()) {
  return createUsersService({ users: repository, usersAuth, nowMs: () => NOW_MS });
}

function row(overrides: Partial<UserAccountRow> = {}): UserAccountRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    full_name: 'Dana Silva',
    email: 'dana@company.com',
    role: 'employee',
    is_active: true,
    ...overrides,
  };
}

describe('createUsersService.listAccounts — mapping (US-020/AC-01)', () => {
  it('maps a repository row to the wire shape: fullName from full_name, isActive from is_active', async () => {
    const { repository } = stubRepository({
      accountsByQuery: () => [row()],
      summaryRows: [{ role: 'employee', is_active: true }],
    });

    const result = await service(repository).listAccounts();

    expect(result.users).toEqual([
      { id: row().id, fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true },
    ]);
  });

  it('preserves the repository\'s order', async () => {
    const rows = [row({ id: 'a', full_name: 'Amy' }), row({ id: 'b', full_name: 'Zed' })];
    const { repository } = stubRepository({ accountsByQuery: () => rows, summaryRows: [] });

    const result = await service(repository).listAccounts();

    expect(result.users.map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('returns an empty users list rather than throwing when nothing matches', async () => {
    const { repository } = stubRepository({ accountsByQuery: () => [], summaryRows: [] });
    const result = await service(repository).listAccounts('nomatch');
    expect(result.users).toEqual([]);
  });
});

describe('createUsersService.listAccounts — q reaches only the filtered read (US-020/AC-04)', () => {
  it('passes q through to listAccounts, and no q at all through getSummaryCounts (it takes none)', async () => {
    const { repository, listAccountsCalls } = stubRepository({
      accountsByQuery: () => [],
      summaryRows: [],
    });

    await service(repository).listAccounts('dana');

    expect(listAccountsCalls).toEqual(['dana']);
  });

  it('calls listAccounts and getSummaryCounts exactly once each per request — Promise.all, not a retry loop', async () => {
    const { repository, listAccountsCalls, summaryCallCount } = stubRepository({
      accountsByQuery: () => [],
      summaryRows: [],
    });

    await service(repository).listAccounts('dana');

    expect(listAccountsCalls).toHaveLength(1);
    expect(summaryCallCount()).toBe(1);
  });
});

describe('createUsersService.listAccounts — the summary that must not follow the search (US-020/AC-02, AC-06, design note §2.2, A10)', () => {
  const FIVE_ACCOUNTS: UserAccountRow[] = [
    row({ id: '1', full_name: 'Dana Silva', role: 'employee', is_active: true }),
    row({ id: '2', full_name: 'Sam Okoro', role: 'employee', is_active: true }),
    row({ id: '3', full_name: 'Priya Sharma', role: 'employee', is_active: true }),
    row({ id: '4', full_name: 'Marcus Webb', role: 'admin', is_active: true }),
    // The deactivated seed member — without it, "count total over active rows only" passes
    // every other fixture in this file.
    row({ id: '5', full_name: 'Alex Ito', role: 'admin', is_active: false }),
  ];
  const SUMMARY_ROWS: UserSummaryRow[] = FIVE_ACCOUNTS.map((r) => ({ role: r.role, is_active: r.is_active }));

  it('a search matching 2 of 5 seeded accounts returns those 2, with a summary reflecting all 5', async () => {
    const { repository } = stubRepository({
      accountsByQuery: (q) => (q === 'a' ? [FIVE_ACCOUNTS[0]!, FIVE_ACCOUNTS[3]!] : FIVE_ACCOUNTS),
      summaryRows: SUMMARY_ROWS,
    });

    const result = await service(repository).listAccounts('a');

    expect(result.users).toHaveLength(2);
    expect(result.summary).toEqual({ total: 5, employees: 3, admins: 2, deactivated: 1 });
  });

  it('the summary is BYTE-IDENTICAL with and without q, for a fixed seed', async () => {
    const { repository } = stubRepository({
      accountsByQuery: (q) => (q === undefined ? FIVE_ACCOUNTS : [FIVE_ACCOUNTS[0]!]),
      summaryRows: SUMMARY_ROWS,
    });

    const withoutQ = await service(repository).listAccounts();
    const withQ = await service(repository).listAccounts('dana');

    expect(withQ.summary).toEqual(withoutQ.summary);
  });

  it('employees + admins === total, and deactivated is a SUBSET of total, not a fourth bucket', async () => {
    const { repository } = stubRepository({ accountsByQuery: () => FIVE_ACCOUNTS, summaryRows: SUMMARY_ROWS });

    const { summary } = await service(repository).listAccounts();

    expect(summary.employees + summary.admins).toBe(summary.total);
    expect(summary.deactivated).toBeLessThanOrEqual(summary.total);
    expect(summary).toEqual({ total: 5, employees: 3, admins: 2, deactivated: 1 });
  });

  it('an all-active, all-employee seed reports deactivated: 0 and admins: 0 — the invariant does not accidentally pass by omission', async () => {
    const allActiveEmployees: UserSummaryRow[] = [
      { role: 'employee', is_active: true },
      { role: 'employee', is_active: true },
    ];
    const { repository } = stubRepository({ accountsByQuery: () => [], summaryRows: allActiveEmployees });

    const { summary } = await service(repository).listAccounts();

    expect(summary).toEqual({ total: 2, employees: 2, admins: 0, deactivated: 0 });
  });

  it('an empty system reports all-zero counts, never undefined', async () => {
    const { repository } = stubRepository({ accountsByQuery: () => [], summaryRows: [] });

    const { summary } = await service(repository).listAccounts();

    expect(summary).toEqual({ total: 0, employees: 0, admins: 0, deactivated: 0 });
  });
});

const CREATE_INPUT = {
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee' as const,
  password: 'Correct-Horse7',
};

interface CreateStubOptions {
  findByEmailResults?: Array<EmailLookupRow | undefined>;
  createAccountResult?: Awaited<ReturnType<UsersAuthAdapter['createAccount']>>;
  insertProfileImpl?: (input: InsertProfileInput) => Promise<void>;
  deleteAccountResult?: Awaited<ReturnType<UsersAuthAdapter['deleteAccount']>>;
}

function stubForCreate({
  findByEmailResults = [undefined],
  createAccountResult = { kind: 'ok', userId: 'new-user-id' },
  insertProfileImpl = async () => undefined,
  deleteAccountResult = { kind: 'ok' },
}: CreateStubOptions = {}) {
  const findByEmailCalls: string[] = [];
  const insertProfileCalls: InsertProfileInput[] = [];
  const deleteAccountCalls: string[] = [];
  let findByEmailCallIndex = 0;

  const repository: UsersRepository = {
    async listAccounts() {
      throw new Error('not exercised by createAccount tests');
    },
    async getSummaryCounts() {
      throw new Error('not exercised by createAccount tests');
    },
    async findByEmail(email) {
      findByEmailCalls.push(email);
      const result = findByEmailResults[findByEmailCallIndex];
      findByEmailCallIndex = Math.min(findByEmailCallIndex + 1, findByEmailResults.length - 1);
      return result;
    },
    async insertProfile(input) {
      insertProfileCalls.push(input);
      return insertProfileImpl(input);
    },
    async findById() {
      throw new Error('findById not stubbed — this suite does not exercise updateAccount');
    },
    async updateProfileDetails() {
      throw new Error('updateProfileDetails not stubbed — this suite does not exercise updateAccount');
    },
  };

  const usersAuth: UsersAuthAdapter = {
    async createAccount() {
      return createAccountResult;
    },
    async deleteAccount(userId) {
      deleteAccountCalls.push(userId);
      return deleteAccountResult;
    },
    async updateEmail() {
      throw new Error('updateEmail not stubbed — this suite does not exercise updateAccount');
    },
  };

  return { repository, usersAuth, findByEmailCalls, insertProfileCalls, deleteAccountCalls };
}

describe('createUsersService.createAccount — the happy path (US-021/AC-01, AC-08)', () => {
  it('returns ok with the assembled account, and never re-reads it', async () => {
    const { repository, usersAuth, insertProfileCalls } = stubForCreate();

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({
      kind: 'ok',
      account: { id: 'new-user-id', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true },
    });
    expect(insertProfileCalls).toEqual([
      { id: 'new-user-id', email: 'dana@company.com', fullName: 'Dana Silva', role: 'employee' },
    ]);
  });

  it('insertProfile is called with no is_active/must_change_password key (US-021/AC-08 — proven by an absence)', async () => {
    const { repository, usersAuth, insertProfileCalls } = stubForCreate();

    await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(insertProfileCalls[0]).not.toHaveProperty('is_active');
    expect(insertProfileCalls[0]).not.toHaveProperty('must_change_password');
  });
});

describe('createUsersService.createAccount — duplicate email (US-021/AC-06)', () => {
  it('an existing active holder is returned without ever calling the Auth adapter', async () => {
    const created: string[] = [];
    const { repository } = stubForCreate({
      findByEmailResults: [{ full_name: 'Existing Holder', is_active: true }],
    });
    const spiedAuth: UsersAuthAdapter = {
      async createAccount() {
        created.push('called');
        return { kind: 'ok', userId: 'x' };
      },
      async deleteAccount() {
        return { kind: 'ok' };
      },
      async updateEmail() {
        throw new Error('updateEmail not stubbed — this suite does not exercise updateAccount');
      },
    };

    const outcome = await service(repository, spiedAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Existing Holder', isActive: true });
    expect(created).toEqual([]);
  });

  it('a deactivated holder is reported as such (US-021/AC-06 — the natural implementation filters to active accounts and lets this through)', async () => {
    const { repository, usersAuth } = stubForCreate({
      findByEmailResults: [{ full_name: 'Former Employee', is_active: false }],
    });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Former Employee', isActive: false });
  });
});

describe('createUsersService.createAccount — the race the pre-check cannot close (US-021/AC-06, D-02, design note §2.4)', () => {
  it('a race resolves: the adapter reports duplicate, the SECOND findByEmail now finds the concurrent request\'s row', async () => {
    const { repository, usersAuth, findByEmailCalls } = stubForCreate({
      findByEmailResults: [undefined, { full_name: 'Concurrent Winner', is_active: true }],
      createAccountResult: { kind: 'duplicate' },
    });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Concurrent Winner', isActive: true });
    expect(findByEmailCalls).toHaveLength(2);
  });

  it('an orphan is detected: the adapter reports duplicate, but user_profiles STILL has no row — failed, never an undefined-named duplicate', async () => {
    const { repository, usersAuth } = stubForCreate({
      findByEmailResults: [undefined, undefined],
      createAccountResult: { kind: 'duplicate' },
    });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('createUsersService.createAccount — Auth unreachable (US-021/AC-11)', () => {
  it('resolves unavailable, distinct from failed, so the router can choose 503 over 500', async () => {
    const { repository, usersAuth } = stubForCreate({ createAccountResult: { kind: 'unavailable' } });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'unavailable' });
  });
});

describe('createUsersService.createAccount — profile insert fails after the credential was minted (ADR-011)', () => {
  it('compensates with deleteAccount, using the minted userId, and resolves failed', async () => {
    const { repository, usersAuth, deleteAccountCalls } = stubForCreate({
      insertProfileImpl: async () => {
        throw new Error('db unreachable');
      },
    });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
    expect(deleteAccountCalls).toEqual(['new-user-id']);
  });

  it('resolves failed even when the compensating delete itself fails — never thrown, never surfaced (ADR-011)', async () => {
    const { repository, usersAuth } = stubForCreate({
      insertProfileImpl: async () => {
        throw new Error('db unreachable');
      },
      deleteAccountResult: { kind: 'failed' },
    });

    const outcome = await service(repository, usersAuth).createAccount(CREATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

function currentRow(overrides: Partial<ProfileDetailsRow> = {}): ProfileDetailsRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    full_name: 'Dana Silva',
    email: 'dana@company.com',
    role: 'employee',
    is_active: true,
    ...overrides,
  };
}

interface UpdateStubOptions {
  /** Omit for the default row (`currentRow()`); pass `null` for "no account exists" (US-023's
   *  not_found case) — `null`, not `undefined`, so a destructuring default can still fire on an
   *  omitted key while leaving an explicit "no account" distinguishable (`exactOptionalPropertyTypes`). */
  findByIdResult?: ProfileDetailsRow | null;
  findByEmailResults?: Array<EmailLookupRow | undefined>;
  updateProfileDetailsImpl?: (input: UpdateProfileDetailsInput) => Promise<UpdateProfileDetailsOutcome>;
  updateEmailResult?: Awaited<ReturnType<UsersAuthAdapter['updateEmail']>>;
}

function stubForUpdate({
  findByIdResult: findByIdResultOption = currentRow(),
  findByEmailResults = [undefined],
  updateProfileDetailsImpl,
  updateEmailResult = { kind: 'ok' },
}: UpdateStubOptions = {}) {
  const findByIdResult = findByIdResultOption === null ? undefined : findByIdResultOption;
  const findByEmailCalls: Array<{ email: string; excludeId?: string }> = [];
  const updateProfileDetailsCalls: UpdateProfileDetailsInput[] = [];
  const updateEmailCalls: Array<{ userId: string; email: string }> = [];
  const deleteAccountCalls: string[] = [];
  const createAccountCalls: unknown[] = [];
  let findByEmailCallIndex = 0;

  const echoImpl = async (input: UpdateProfileDetailsInput): Promise<UpdateProfileDetailsOutcome> => ({
    kind: 'ok',
    profile: {
      id: input.id,
      full_name: input.fullName,
      email: input.email,
      role: findByIdResult?.role ?? 'employee',
      is_active: findByIdResult?.is_active ?? true,
    },
  });

  const repository: UsersRepository = {
    async listAccounts() {
      throw new Error('not exercised by updateAccount tests');
    },
    async getSummaryCounts() {
      throw new Error('not exercised by updateAccount tests');
    },
    async findByEmail(email, excludeId) {
      findByEmailCalls.push(excludeId === undefined ? { email } : { email, excludeId });
      const result = findByEmailResults[findByEmailCallIndex];
      findByEmailCallIndex = Math.min(findByEmailCallIndex + 1, findByEmailResults.length - 1);
      return result;
    },
    async insertProfile() {
      throw new Error('not exercised by updateAccount tests');
    },
    async findById() {
      return findByIdResult;
    },
    async updateProfileDetails(input) {
      updateProfileDetailsCalls.push(input);
      return (updateProfileDetailsImpl ?? echoImpl)(input);
    },
  };

  const usersAuth: UsersAuthAdapter = {
    async createAccount() {
      createAccountCalls.push('called');
      return { kind: 'ok', userId: 'x' };
    },
    async deleteAccount(userId) {
      deleteAccountCalls.push(userId);
      return { kind: 'ok' };
    },
    async updateEmail(userId, email) {
      updateEmailCalls.push({ userId, email });
      return updateEmailResult;
    },
  };

  return {
    repository,
    usersAuth,
    findByEmailCalls,
    updateProfileDetailsCalls,
    updateEmailCalls,
    deleteAccountCalls,
    createAccountCalls,
  };
}

const UPDATE_INPUT = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  fullName: 'Dana Okafor',
  email: 'dana.okafor@company.com',
};

describe('createUsersService.updateAccount — account missing (US-023)', () => {
  it('resolves not_found without touching either write', async () => {
    const { repository, usersAuth, updateProfileDetailsCalls, updateEmailCalls } = stubForUpdate({
      findByIdResult: null,
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'not_found' });
    expect(updateProfileDetailsCalls).toEqual([]);
    expect(updateEmailCalls).toEqual([]);
  });
});

describe('createUsersService.updateAccount — email unchanged (US-023/AC-01, AC-03, design note §2.3)', () => {
  it('never calls the Auth adapter at all when the normalised email is unchanged', async () => {
    const { repository, usersAuth, updateEmailCalls } = stubForUpdate({
      findByIdResult: currentRow({ email: 'dana@company.com' }),
    });

    const outcome = await service(repository, usersAuth).updateAccount({
      id: UPDATE_INPUT.id,
      fullName: 'Dana Silva (corrected)',
      email: 'dana@company.com',
    });

    expect(outcome.kind).toBe('ok');
    expect(updateEmailCalls).toEqual([]);
  });

  it('the unchanged-email guard is LOAD-BEARING (US-023/AC-03) — the current email never reaches the duplicate pre-check, even when findByEmail would report a self-collision', async () => {
    const { repository, usersAuth, findByEmailCalls } = stubForUpdate({
      findByIdResult: currentRow({ email: 'dana@company.com' }),
      // If the guard were absent, this result would make the save look like a self-collision.
      findByEmailResults: [{ full_name: 'Dana Silva', is_active: true }],
    });

    const outcome = await service(repository, usersAuth).updateAccount({
      id: UPDATE_INPUT.id,
      fullName: 'Dana Silva',
      email: 'dana@company.com',
    });

    expect(outcome.kind).toBe('ok');
    expect(findByEmailCalls).toEqual([]);
  });

  it('writes full_name/email/updated_at with the injected nowMs() reading (US-023, design note §2.10)', async () => {
    const { repository, usersAuth, updateProfileDetailsCalls } = stubForUpdate({
      findByIdResult: currentRow({ email: 'dana@company.com' }),
    });

    await service(repository, usersAuth).updateAccount({
      id: UPDATE_INPUT.id,
      fullName: 'Dana Silva (corrected)',
      email: 'dana@company.com',
    });

    expect(updateProfileDetailsCalls).toEqual([
      { id: UPDATE_INPUT.id, fullName: 'Dana Silva (corrected)', email: 'dana@company.com', updatedAt: new Date(NOW_MS) },
    ]);
  });
});

describe('createUsersService.updateAccount — the excludeId pre-check is defence in depth (US-023/AC-02, AC-03, design note §2.8)', () => {
  it('passes excludeId on the pre-check whenever the email actually changed', async () => {
    const { repository, usersAuth, findByEmailCalls } = stubForUpdate();

    await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(findByEmailCalls[0]).toEqual({ email: 'dana.okafor@company.com', excludeId: UPDATE_INPUT.id });
  });
});

describe('createUsersService.updateAccount — duplicate email (US-023/AC-02)', () => {
  it('an active holder is refused before either write runs', async () => {
    const { repository, usersAuth, updateProfileDetailsCalls, updateEmailCalls } = stubForUpdate({
      findByEmailResults: [{ full_name: 'Existing Holder', is_active: true }],
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Existing Holder', isActive: true });
    expect(updateProfileDetailsCalls).toEqual([]);
    expect(updateEmailCalls).toEqual([]);
  });

  it('a deactivated holder is reported as such — the pre-check includes deactivated accounts (US-023/AC-02)', async () => {
    const { repository, usersAuth } = stubForUpdate({
      findByEmailResults: [{ full_name: 'Former Employee', is_active: false }],
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Former Employee', isActive: false });
  });

  it('a race the pre-check missed: user_profiles_email_key fires at write time, and the re-read composes the refusal', async () => {
    const { repository, usersAuth } = stubForUpdate({
      findByEmailResults: [undefined, { full_name: 'Concurrent Winner', is_active: true }],
      updateProfileDetailsImpl: async () => ({ kind: 'duplicate' }),
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Concurrent Winner', isActive: true });
  });

  it('a write-time 23505 with no row visible on re-read resolves failed, not an undefined-named duplicate', async () => {
    const { repository, usersAuth } = stubForUpdate({
      findByEmailResults: [undefined, undefined],
      updateProfileDetailsImpl: async () => ({ kind: 'duplicate' }),
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('createUsersService.updateAccount — the profile write reports not_found at write time (US-023)', () => {
  it('resolves not_found — the account vanished between the read and the write', async () => {
    const { repository, usersAuth } = stubForUpdate({
      updateProfileDetailsImpl: async () => ({ kind: 'not_found' }),
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'not_found' });
  });
});

describe('createUsersService.updateAccount — Auth write fails after the profile write succeeds (ADR-012, US-023/AC-01, AC-07, AC-08)', () => {
  it('restores BOTH the old fullName and old email — never a partial revert (design note §2.7)', async () => {
    const { repository, usersAuth, updateProfileDetailsCalls } = stubForUpdate({
      findByIdResult: currentRow({ full_name: 'Dana Silva', email: 'dana@company.com' }),
      updateEmailResult: { kind: 'unavailable' },
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    // The restore succeeded, so the ONLY thing surfaced is the original reason (`unavailable`,
    // mirroring createAccount's own unavailable/failed split so the router can choose 503 over
    // 500) — never a distinction about whether the compensation itself worked (ADR-011 item 3).
    expect(outcome).toEqual({ kind: 'unavailable' });
    expect(updateProfileDetailsCalls).toEqual([
      { id: UPDATE_INPUT.id, fullName: 'Dana Okafor', email: 'dana.okafor@company.com', updatedAt: new Date(NOW_MS) },
      { id: UPDATE_INPUT.id, fullName: 'Dana Silva', email: 'dana@company.com', updatedAt: new Date(NOW_MS) },
    ]);
  });

  it('resolves failed even when the compensating restore ALSO fails — never thrown, never surfaced (ADR-012)', async () => {
    let calls = 0;
    const { repository, usersAuth } = stubForUpdate({
      updateEmailResult: { kind: 'unavailable' },
      updateProfileDetailsImpl: async (input) => {
        calls += 1;
        // First call (the happy-path write) succeeds; the second (the restore) fails.
        if (calls === 1) return { kind: 'ok', profile: { id: input.id, full_name: input.fullName, email: input.email, role: 'employee', is_active: true } };
        return { kind: 'not_found' };
      },
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('a GoTrue duplicate on the Auth write (a diverged/orphaned credential) still restores and resolves failed — never named as a ST-04 refusal (ADR-011 item 4)', async () => {
    const { repository, usersAuth, updateProfileDetailsCalls } = stubForUpdate({
      updateEmailResult: { kind: 'duplicate' },
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
    expect(updateProfileDetailsCalls).toHaveLength(2);
  });
});

describe('createUsersService.updateAccount — AC-07: usersAuth.deleteAccount is unreachable from this path, on every branch', () => {
  it.each([
    ['account missing', { findByIdResult: null }],
    ['duplicate at pre-check', { findByEmailResults: [{ full_name: 'Existing Holder', is_active: true }] }],
    ['Auth write unavailable, restore succeeds', { updateEmailResult: { kind: 'unavailable' as const } }],
    ['Auth write duplicate, restore succeeds', { updateEmailResult: { kind: 'duplicate' as const } }],
  ])('%s', async (_label, options) => {
    const { repository, usersAuth, deleteAccountCalls, createAccountCalls } = stubForUpdate(options);

    await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(deleteAccountCalls).toEqual([]);
    expect(createAccountCalls).toEqual([]);
  });
});

describe('createUsersService.updateAccount — the happy path (US-023/AC-01, AC-05)', () => {
  it('returns ok with the assembled account, and writes the Auth email exactly once', async () => {
    const { repository, usersAuth, updateEmailCalls } = stubForUpdate({
      findByIdResult: currentRow({ role: 'admin', is_active: true }),
    });

    const outcome = await service(repository, usersAuth).updateAccount(UPDATE_INPUT);

    expect(outcome).toEqual({
      kind: 'ok',
      account: {
        id: UPDATE_INPUT.id,
        fullName: 'Dana Okafor',
        email: 'dana.okafor@company.com',
        role: 'admin',
        isActive: true,
      },
    });
    expect(updateEmailCalls).toEqual([{ userId: UPDATE_INPUT.id, email: 'dana.okafor@company.com' }]);
  });
});
