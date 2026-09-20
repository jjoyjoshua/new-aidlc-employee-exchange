/**
 * SCR-008 — People (US-020). ST-01 (default), ST-02 (loading), ST-03 (no match), ST-04 (load
 * error), ST-15 (row menu open — `AccountRowMenu`, owned per-row by `AccountRow`), ST-16 (search
 * with matches). ST-05 – ST-14 belong to US-023 – US-027 and are not built here (design note §6.3).
 *
 * **The search term: typed vs. committed** (design note §7.5, plan Open question 1). `typed` is
 * what the field shows on every keystroke; `committedQ` is what is actually sent to the server —
 * committed 300ms after the last keystroke, or immediately on Enter or blur. Only `committedQ`
 * drives the fetch, via `stableFetch`'s `useCallback` closure (`Desks.tsx:110-117`'s own device,
 * design note A8/§7.5) — `useUsers` keeps its ONE-argument fetcher signature throughout.
 *
 * **`hasLoadedOnce` — the disabled-search trap** (design note A7/§7.4). The search field is
 * disabled ONLY while no list has EVER loaded, never on every `loading` transition: `useUsers`
 * (mirroring `useDesks`) returns to `status: 'loading'` on every committed re-search, and a naive
 * `disabled={status === 'loading'}` would disable the field mid-search — dropping focus and the
 * term the user just typed, contradicting AC-05/ST-16. `hasLoadedOnce` latches true on the FIRST
 * `ready` state and never resets; skeletons still render on every re-search (AC-09's other half),
 * only the field itself stays enabled throughout.
 *
 * **The summary vs. the match line** (design note §2.2, §3.2, A5). The summary line is `summary`
 * from the wire, a second unfiltered read — NEVER `users.length` — so an active search cannot
 * change it (AC-02, AC-06). The match line (`Showing {users.length} of {summary.total}`) is shown
 * only while a committed term is active, and its own numerator IS `users.length`: the browser
 * holds the whole filtered array, since this screen never pages (AC-08).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import searchIconMarkup from '../../assets/icon-search.svg?raw';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { TextField } from '../../components/text-field/TextField.js';
import { Toast } from '../../components/toast/Toast.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import { createCreateAccount, type CreateAccountFetcher } from '../../lib/create-account.js';
import { createFetchUsers, type FetchUsers } from '../../lib/fetch-users.js';
import { createUpdateAccount, type UpdateAccountFetcher } from '../../lib/update-account.js';
import { useUsers, type UsersFetcher } from '../../lib/use-users.js';
import { AccountRow, AccountsTableHead } from './AccountRow.js';
import { AccountSkeletonRow } from './AccountSkeletonRow.js';
import {
  accountCreatedToast,
  accountUpdatedToast,
  ADD_PERSON_LABEL,
  CLEAR_SEARCH_FIELD_LABEL,
  CLEAR_SEARCH_LABEL,
  LOAD_FAILED,
  matchLine,
  noMatchMessage,
  PAGE_TITLE,
  SEARCH_LABEL,
  summaryLine,
  TRY_AGAIN_LABEL,
} from './copy.js';
import { UserFormDialog } from './UserFormDialog.js';
import { useUserFormDialog } from './use-user-form-dialog.js';
import './people.css';

/** 300ms — the plan's own default (Open question 1), confirmed reasonable by the design note
 *  (§12 item 3) and not overridden here. Committed sooner, on Enter or blur, regardless. */
const COMMIT_DEBOUNCE_MS = 300;
const SKELETON_ROW_COUNT = 4;

export interface PeopleProps {
  /** Test seam. Defaults to the real `GET /api/admin/users` call over the authenticated client
   *  from `useAuth()`. `| undefined` (not just `?`), matching every other screen's own seam. */
  fetchUsers?: FetchUsers | undefined;
  /** Test seam for `POST /api/admin/users` (US-021). Defaults to the real call. */
  createAccount?: CreateAccountFetcher | undefined;
  /** Test seam for `PATCH /api/admin/users/:id` (US-023). Defaults to the real call. */
  updateAccount?: UpdateAccountFetcher | undefined;
}

export function People({ fetchUsers, createAccount, updateAccount }: PeopleProps) {
  const { api, user } = useAuth();

  // Behind RequireSession, `user` is always present by the time this screen renders — the same
  // reasoning every other admin screen states for its own guarded fields.
  if (!user) return null;

  return (
    <PeopleContent
      api={api}
      currentUserId={user.id}
      fetchUsers={fetchUsers}
      createAccount={createAccount}
      updateAccount={updateAccount}
    />
  );
}

function PeopleContent({
  api,
  currentUserId,
  fetchUsers,
  createAccount,
  updateAccount,
}: {
  api: ApiClient;
  currentUserId: string;
  fetchUsers: FetchUsers | undefined;
  createAccount: CreateAccountFetcher | undefined;
  updateAccount: UpdateAccountFetcher | undefined;
}) {
  const resolvedFetch = useMemo(() => fetchUsers ?? createFetchUsers(api), [fetchUsers, api]);
  const resolvedCreateAccount = useMemo(() => createAccount ?? createCreateAccount(api), [createAccount, api]);
  const resolvedUpdateAccount = useMemo(() => updateAccount ?? createUpdateAccount(api), [updateAccount, api]);

  const [typed, setTyped] = useState('');
  const [committedQ, setCommittedQ] = useState<string | undefined>(undefined);
  const [retryKey, setRetryKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldRef = useRef<HTMLInputElement>(null);

  const stableFetch = useCallback<UsersFetcher>(
    (signal) => resolvedFetch(committedQ, signal),
    [resolvedFetch, committedQ, retryKey],
  );
  const users = useUsers(stableFetch);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  // US-021/AC-01, AC-09 (design note §4.2, A6): the row only joins the visible list when no
  // search is active — under a committed search, the toast is the whole of the confirmation,
  // never a row forced into a filtered view only the server can evaluate correctly.
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const handleCreated = useCallback(
    (account: AdminUser) => {
      if (users.status === 'ready') users.markAdded(account, { appendToList: committedQ === undefined });
      setSavedMessage(accountCreatedToast(account.fullName));
    },
    [users, committedQ],
  );
  // US-023/AC-01 (ST-07) — unlike `markAdded`, `markUpdated` replaces IN PLACE regardless of an
  // active search (`use-users.ts`'s own module docblock states why the two diverge here).
  const handleUpdated = useCallback(
    (account: AdminUser) => {
      if (users.status === 'ready') users.markUpdated(account);
      setSavedMessage(accountUpdatedToast(account.fullName));
    },
    [users],
  );
  const userFormDialog = useUserFormDialog(resolvedCreateAccount, resolvedUpdateAccount, handleCreated, handleUpdated);

  // A9/§7.4: latches true on the first successful load and never resets — see the module
  // docblock for why this must not simply track `status === 'loading'`.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (users.status === 'ready') setHasLoadedOnce(true);
  }, [users.status]);

  const commit = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCommittedQ(value.trim().length > 0 ? value.trim() : undefined);
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setTyped(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => commit(value), COMMIT_DEBOUNCE_MS);
    },
    [commit],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(typed);
      }
    },
    [commit, typed],
  );

  const handleBlur = useCallback(() => commit(typed), [commit, typed]);

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTyped('');
    setCommittedQ(undefined);
    fieldRef.current?.focus();
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <>
      {savedMessage ? <Toast>{savedMessage}</Toast> : null}

      {userFormDialog.dialog ? (
        <UserFormDialog
          dialog={userFormDialog.dialog}
          onSubmit={userFormDialog.submit}
          onDismiss={userFormDialog.dismiss}
          currentUserId={currentUserId}
        />
      ) : null}

      <div className="people__header">
        <h1>{PAGE_TITLE}</h1>
        {users.status !== 'error' ? (
          <Button variant="primary" onClick={userFormDialog.openAdd}>
            {ADD_PERSON_LABEL}
          </Button>
        ) : null}
      </div>

      <div className="people__search">
        <span className="people__search-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: searchIconMarkup }} />
        <TextField
          label={SEARCH_LABEL}
          value={typed}
          disabled={!hasLoadedOnce}
          inputRef={fieldRef}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          trailing={
            typed.length > 0 ? (
              <button type="button" className="people__clear" aria-label={CLEAR_SEARCH_FIELD_LABEL} onClick={handleClear}>
                ×
              </button>
            ) : undefined
          }
        />
      </div>

      {users.status === 'loading' ? <span className="people__summary--skeleton" aria-hidden="true" /> : null}
      {users.status === 'ready' ? (
        <p className="people__summary" role="status">
          {summaryLine(users.summary)}
        </p>
      ) : null}

      {users.status === 'ready' && committedQ ? (
        <p className="people__match-line">{matchLine(users.users.length, users.summary.total)}</p>
      ) : null}

      {users.status === 'loading' ? (
        <>
          <div className="people-table-wrapper" aria-hidden="true">
            <table className="people-table">
              <AccountsTableHead />
              <tbody>
                {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                  <AccountSkeletonRow key={i} layout="table" />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="people-cards" aria-hidden="true">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
              <AccountSkeletonRow key={i} layout="card" />
            ))}
          </ul>
        </>
      ) : null}

      {users.status === 'error' ? (
        <Alert tone="danger" live="assertive" actions={<Button variant="secondary" onClick={retry}>{TRY_AGAIN_LABEL}</Button>}>
          {LOAD_FAILED}
        </Alert>
      ) : null}

      {users.status === 'ready' ? (
        <PeopleReady
          users={users.users}
          committedQ={committedQ}
          currentUserId={currentUserId}
          onClearSearch={handleClear}
          onAddPerson={userFormDialog.openAdd}
          onEdit={userFormDialog.openEdit}
        />
      ) : null}
    </>
  );
}

function PeopleReady({
  users,
  committedQ,
  currentUserId,
  onClearSearch,
  onAddPerson,
  onEdit,
}: {
  users: AdminUser[];
  committedQ: string | undefined;
  currentUserId: string;
  onClearSearch: () => void;
  onAddPerson: () => void;
  onEdit: (account: AdminUser) => void;
}) {
  if (users.length === 0) {
    // AC-08: this is the ONLY empty branch this screen ever reaches — the signed-in
    // administrator's own row means a truly empty list cannot happen (there is always at least
    // one account), so there is no "no people/accounts" branch to build.
    return (
      <EmptyState
        title={noMatchMessage(committedQ ?? '')}
        actions={
          <>
            <Button variant="secondary" onClick={onClearSearch}>
              {CLEAR_SEARCH_LABEL}
            </Button>
            <Button variant="primary" onClick={onAddPerson}>
              {ADD_PERSON_LABEL}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <>
      <div className="people-table-wrapper">
        <table className="people-table">
          <AccountsTableHead />
          <tbody>
            {users.map((account) => (
              <AccountRow key={account.id} account={account} layout="table" currentUserId={currentUserId} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="people-cards">
        {users.map((account) => (
          <AccountRow key={account.id} account={account} layout="card" currentUserId={currentUserId} onEdit={onEdit} />
        ))}
      </ul>
    </>
  );
}
