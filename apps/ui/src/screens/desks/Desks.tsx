/**
 * SCR-006 — Desks (US-016), plus SCR-007's add-desk dialog (US-017). ST-01 Default, ST-02
 * Loading, ST-03 Empty, ST-04 Load error, and now the add flow (SCR-007 ST-01/03/04/05/07) — ST-05
 * through ST-10 on THIS screen (deactivate confirm/blocked/activate) are still US-019's and are
 * not built here (design note §6.2/§7, "What this story must NOT build").
 *
 * **Edit and Deactivate/Activate still render visible and `disabled`** (US-018, US-019 — their
 * destinations do not exist yet). Only **Add desk** is wired by this story; `DeskInventoryRow.tsx`
 * and its spec are untouched (US-017 design note §9.1).
 *
 * A load failure (ST-04) is still a DIFFERENT case from the rest: Add desk is HIDDEN, not merely
 * disabled, because adding a desk blind risks a duplicate-number refusal against a list nobody can
 * see (AC-07, BR-001.8).
 */
import { useCallback, useMemo, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { Toast } from '../../components/toast/Toast.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useDesks, type DesksFetcher } from '../../lib/use-desks.js';
import { createFetchDesks } from '../../lib/fetch-desks.js';
import { createAddDesk, type AddDeskFetcher } from '../../lib/add-desk.js';
import { DeskFormDialog } from './DeskFormDialog.js';
import { useAddDeskDialog } from './use-add-desk-dialog.js';
import { DeskInventoryRow, DeskInventoryTableHead } from './DeskInventoryRow.js';
import { DeskInventorySkeletonRow } from './DeskInventorySkeletonRow.js';
import { ADD_DESK_LABEL, EMPTY_BODY, EMPTY_TITLE, LOAD_FAILED, PAGE_TITLE, TRY_AGAIN_LABEL, deskAddedToast, summaryLine } from './copy.js';
import './desks.css';

export interface DesksProps {
  /** Test seam. Defaults to the real `GET /api/admin/desks` call over the authenticated client
   *  from `useAuth()`. `| undefined` (not just `?`), same reasoning `AllBookingsProps.fetchAllBookings`
   *  states under `exactOptionalPropertyTypes`. */
  fetchDesks?: DesksFetcher | undefined;
  /** Test seam for `POST /api/admin/desks` (US-017). Defaults to the real call. */
  addDesk?: AddDeskFetcher | undefined;
}

export function Desks({ fetchDesks, addDesk }: DesksProps) {
  const { api } = useAuth();
  return <DesksContent api={api} fetchDesks={fetchDesks} addDesk={addDesk} />;
}

function AddDeskButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="primary" onClick={onClick}>
      {ADD_DESK_LABEL}
    </Button>
  );
}

function DesksContent({
  api,
  fetchDesks,
  addDesk,
}: {
  api: ReturnType<typeof useAuth>['api'];
  fetchDesks: DesksFetcher | undefined;
  addDesk: AddDeskFetcher | undefined;
}) {
  const resolvedFetch = useMemo(() => fetchDesks ?? createFetchDesks(api), [fetchDesks, api]);
  // A retry re-fetches by changing `stableFetch`'s identity, which is `useDesks`'s own effect
  // dependency — the same "stableFetch" device `AllBookings.tsx` uses for filter changes, applied
  // here to force a re-run on demand rather than on a dependency change (`decisions.md` D-06).
  const [retryKey, setRetryKey] = useState(0);
  const stableFetch = useCallback<DesksFetcher>((signal) => resolvedFetch(signal), [resolvedFetch, retryKey]);
  const desks = useDesks(stableFetch);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  const resolvedAddDesk = useMemo(() => addDesk ?? createAddDesk(api), [addDesk, api]);
  // US-017/AC-01, design note §6.5: inserted in place, never refetched — a refetch would flash
  // skeletons over a list the administrator is reading (`use-my-bookings.ts`'s own reasoning for
  // `markCancelled`).
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const handleAdded = useCallback(
    (desk: AdminDesk) => {
      if (desks.status === 'ready') desks.markAdded(desk);
      setAddedMessage(deskAddedToast(desk.deskNumber));
    },
    [desks],
  );
  const addDeskDialog = useAddDeskDialog(resolvedAddDesk, handleAdded);

  return (
    <>
      {addedMessage ? <Toast>{addedMessage}</Toast> : null}

      <div className="desks__header">
        <h1>{PAGE_TITLE}</h1>
        {desks.status !== 'error' ? <AddDeskButton onClick={addDeskDialog.open} /> : null}
      </div>

      {desks.status === 'loading' ? <span className="desks__summary desks__summary--skeleton" aria-hidden="true" /> : null}
      {desks.status === 'ready' ? (
        <p className="desks__summary" role="status">
          {summaryLine(desks.desks)}
        </p>
      ) : null}

      {desks.status === 'loading' ? (
        <>
          <table className="desk-inventory-table" aria-hidden="true">
            <DeskInventoryTableHead />
            <tbody>
              {Array.from({ length: 4 }, (_, i) => (
                <DeskInventorySkeletonRow key={i} layout="table" />
              ))}
            </tbody>
          </table>
          <ul className="desks-cards" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <DeskInventorySkeletonRow key={i} layout="card" />
            ))}
          </ul>
        </>
      ) : null}

      {desks.status === 'error' ? (
        <Alert tone="danger" live="assertive" actions={<Button variant="secondary" onClick={retry}>{TRY_AGAIN_LABEL}</Button>}>
          {LOAD_FAILED}
        </Alert>
      ) : null}

      {desks.status === 'ready' ? <DesksReady desks={desks.desks} onAddDesk={addDeskDialog.open} /> : null}

      {addDeskDialog.dialog ? (
        <DeskFormDialog dialog={addDeskDialog.dialog} onSubmit={addDeskDialog.submit} onDismiss={addDeskDialog.dismiss} />
      ) : null}
    </>
  );
}

function DesksReady({ desks, onAddDesk }: { desks: AdminDesk[]; onAddDesk: () => void }) {
  if (desks.length === 0) {
    // AC-06. No table and no column headers over nothing — SCR-006 is explicit that headers
    // over nothing are furniture (design note §7.3).
    return <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} actions={<AddDeskButton onClick={onAddDesk} />} />;
  }

  return (
    <>
      <table className="desk-inventory-table">
        <DeskInventoryTableHead />
        <tbody>
          {desks.map((desk) => (
            <DeskInventoryRow key={desk.id} desk={desk} layout="table" />
          ))}
        </tbody>
      </table>
      <ul className="desks-cards">
        {desks.map((desk) => (
          <DeskInventoryRow key={desk.id} desk={desk} layout="card" />
        ))}
      </ul>
    </>
  );
}
