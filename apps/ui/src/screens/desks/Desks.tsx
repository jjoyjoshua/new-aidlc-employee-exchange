/**
 * SCR-006 — Desks (US-016), plus SCR-007's add-desk (US-017) and edit-desk (US-018) dialogs.
 * ST-01 Default, ST-02 Loading, ST-03 Empty, ST-04 Load error, and now the add AND edit flows
 * (SCR-007 ST-01–ST-05, ST-07) — ST-06+ on THIS screen (deactivate confirm/blocked/activate) are
 * still US-019's and are not built here (design note §6.2/§7, "What this story must NOT build").
 *
 * **Deactivate/Activate still renders visible and `disabled`** (US-019 — its destination does not
 * exist yet). **Add desk** and now **Edit** are wired; `DeskInventoryRow.tsx` and its spec ARE
 * modified by this story — the exact inverse of US-017 design note §9.1's "must not touch".
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
import { createRenameDesk, type RenameDeskFetcher } from '../../lib/rename-desk.js';
import { DeskFormDialog } from './DeskFormDialog.js';
import { useDeskFormDialog } from './use-desk-form-dialog.js';
import { DeskInventoryRow, DeskInventoryTableHead } from './DeskInventoryRow.js';
import { DeskInventorySkeletonRow } from './DeskInventorySkeletonRow.js';
import {
  ADD_DESK_LABEL,
  EMPTY_BODY,
  EMPTY_TITLE,
  LOAD_FAILED,
  PAGE_TITLE,
  TRY_AGAIN_LABEL,
  deskAddedToast,
  deskRenamedToast,
  summaryLine,
} from './copy.js';
import './desks.css';

export interface DesksProps {
  /** Test seam. Defaults to the real `GET /api/admin/desks` call over the authenticated client
   *  from `useAuth()`. `| undefined` (not just `?`), same reasoning `AllBookingsProps.fetchAllBookings`
   *  states under `exactOptionalPropertyTypes`. */
  fetchDesks?: DesksFetcher | undefined;
  /** Test seam for `POST /api/admin/desks` (US-017). Defaults to the real call. */
  addDesk?: AddDeskFetcher | undefined;
  /** Test seam for `PATCH /api/admin/desks/:id` (US-018). Defaults to the real call. */
  renameDesk?: RenameDeskFetcher | undefined;
}

export function Desks({ fetchDesks, addDesk, renameDesk }: DesksProps) {
  const { api } = useAuth();
  return <DesksContent api={api} fetchDesks={fetchDesks} addDesk={addDesk} renameDesk={renameDesk} />;
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
  renameDesk,
}: {
  api: ReturnType<typeof useAuth>['api'];
  fetchDesks: DesksFetcher | undefined;
  addDesk: AddDeskFetcher | undefined;
  renameDesk: RenameDeskFetcher | undefined;
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
  const resolvedRenameDesk = useMemo(() => renameDesk ?? createRenameDesk(api), [renameDesk, api]);
  // US-017/AC-01, US-018/AC-01 (design note §6.3): inserted/renamed in place, never refetched — a
  // refetch would flash skeletons over a list the administrator is reading (`use-my-bookings.ts`'s
  // own reasoning for `markCancelled`).
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const handleAdded = useCallback(
    (desk: AdminDesk) => {
      if (desks.status === 'ready') desks.markAdded(desk);
      setSavedMessage(deskAddedToast(desk.deskNumber));
    },
    [desks],
  );
  const handleRenamed = useCallback(
    (id: string, deskNumber: string) => {
      if (desks.status === 'ready') desks.markRenamed(id, deskNumber);
      setSavedMessage(deskRenamedToast(deskNumber));
    },
    [desks],
  );
  const deskFormDialog = useDeskFormDialog(resolvedAddDesk, resolvedRenameDesk, handleAdded, handleRenamed);

  return (
    <>
      {savedMessage ? <Toast>{savedMessage}</Toast> : null}

      <div className="desks__header">
        <h1>{PAGE_TITLE}</h1>
        {desks.status !== 'error' ? <AddDeskButton onClick={deskFormDialog.openAdd} /> : null}
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

      {desks.status === 'ready' ? (
        <DesksReady desks={desks.desks} onAddDesk={deskFormDialog.openAdd} onEditDesk={deskFormDialog.openEdit} />
      ) : null}

      {deskFormDialog.dialog ? (
        <DeskFormDialog
          mode={deskFormDialog.dialog.mode}
          desk={deskFormDialog.dialog.desk}
          dialog={deskFormDialog.dialog}
          onSubmit={deskFormDialog.submit}
          onDismiss={deskFormDialog.dismiss}
        />
      ) : null}
    </>
  );
}

function DesksReady({
  desks,
  onAddDesk,
  onEditDesk,
}: {
  desks: AdminDesk[];
  onAddDesk: () => void;
  onEditDesk: (desk: AdminDesk) => void;
}) {
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
            <DeskInventoryRow key={desk.id} desk={desk} layout="table" onEdit={onEditDesk} />
          ))}
        </tbody>
      </table>
      <ul className="desks-cards">
        {desks.map((desk) => (
          <DeskInventoryRow key={desk.id} desk={desk} layout="card" onEdit={onEditDesk} />
        ))}
      </ul>
    </>
  );
}
