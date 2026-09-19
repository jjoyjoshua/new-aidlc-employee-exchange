/**
 * SCR-006 — Desks (US-016), plus SCR-007's add-desk (US-017) and edit-desk (US-018) dialogs, and
 * now the deactivate/activate flow (US-019: ST-05 – ST-10).
 *
 * **US-019 is the last story this screen owed.** `DeskInventoryRow`'s toggle now calls
 * `onToggleActive` instead of rendering `disabled`; deactivating opens `DeskDeactivateDialog`
 * (ST-05, switching to ST-06/ST-07/ST-08 on the outcome — one mounted dialog, design note §8.2);
 * activating is called directly, with NO dialog at any point (AC-09's structural asymmetry).
 *
 * A load failure (ST-04) is still a DIFFERENT case from the rest: Add desk is HIDDEN, not merely
 * disabled, because adding a desk blind risks a duplicate-number refusal against a list nobody can
 * see (AC-07, BR-001.8).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { AdminDesk, Office } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { Toast } from '../../components/toast/Toast.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import { useDesks, type DesksFetcher } from '../../lib/use-desks.js';
import { createFetchDesks } from '../../lib/fetch-desks.js';
import { createAddDesk, type AddDeskFetcher } from '../../lib/add-desk.js';
import { createRenameDesk, type RenameDeskFetcher } from '../../lib/rename-desk.js';
import { createDeactivateDesk, type DeactivateDeskFetcher } from '../../lib/deactivate-desk.js';
import { createActivateDesk, type ActivateDeskFetcher } from '../../lib/activate-desk.js';
import { DeskFormDialog } from './DeskFormDialog.js';
import { useDeskFormDialog } from './use-desk-form-dialog.js';
import { DeskDeactivateDialog, type DeskDeactivateDialogState } from './DeskDeactivateDialog.js';
import { DeskInventoryRow, DeskInventoryTableHead } from './DeskInventoryRow.js';
import { DeskInventorySkeletonRow } from './DeskInventorySkeletonRow.js';
import {
  ADD_DESK_LABEL,
  EMPTY_BODY,
  EMPTY_TITLE,
  LOAD_FAILED,
  PAGE_TITLE,
  TRY_AGAIN_LABEL,
  activateFailedAlert,
  deskActivatedToast,
  deskAddedToast,
  deskDeactivatedToast,
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
  /** Test seam for `POST /api/admin/desks/:id/deactivate` (US-019). Defaults to the real call. */
  deactivateDesk?: DeactivateDeskFetcher | undefined;
  /** Test seam for `POST /api/admin/desks/:id/activate` (US-019). Defaults to the real call. */
  activateDesk?: ActivateDeskFetcher | undefined;
}

export function Desks({ fetchDesks, addDesk, renameDesk, deactivateDesk, activateDesk }: DesksProps) {
  const { api, office } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it (same reasoning `AllBookings` states).
  // AC-06's route needs the OFFICE's today, never the device's (design note §8.5).
  if (!office) return null;

  return (
    <DesksContent
      api={api}
      office={office}
      fetchDesks={fetchDesks}
      addDesk={addDesk}
      renameDesk={renameDesk}
      deactivateDesk={deactivateDesk}
      activateDesk={activateDesk}
    />
  );
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
  office,
  fetchDesks,
  addDesk,
  renameDesk,
  deactivateDesk,
  activateDesk,
}: {
  api: ApiClient;
  office: Office;
  fetchDesks: DesksFetcher | undefined;
  addDesk: AddDeskFetcher | undefined;
  renameDesk: RenameDeskFetcher | undefined;
  deactivateDesk: DeactivateDeskFetcher | undefined;
  activateDesk: ActivateDeskFetcher | undefined;
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
  const resolvedDeactivateDesk = useMemo(() => deactivateDesk ?? createDeactivateDesk(api), [deactivateDesk, api]);
  const resolvedActivateDesk = useMemo(() => activateDesk ?? createActivateDesk(api), [activateDesk, api]);
  // US-017/AC-01, US-018/AC-01, US-019/AC-10 (design note §6.3, §8.6): inserted/renamed/state-changed
  // in place, never refetched — a refetch would flash skeletons over a list the administrator is
  // reading (`use-my-bookings.ts`'s own reasoning for `markCancelled`).
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

  // US-019/AC-01, AC-03 – AC-08, AC-11: `DeskDeactivateDialog`'s own state machine, owned here
  // rather than a separate hook — mirrors `use-admin-cancel-dialog.ts`'s "subject plus busy plus
  // outcome" shape, but this screen's own file. ONE mounted dialog switches states; it is never
  // unmounted between ST-05/ST-06/ST-07/ST-08 (design note §8.2, `decisions.md` D-05).
  const [deactivateDialog, setDeactivateDialog] = useState<DeskDeactivateDialogState | undefined>(undefined);
  const deactivateInFlight = useRef(false);
  // AC-09: activation is called directly, with no dialog at all — a separate, synchronous guard
  // from the deactivate flow's, the same "ref, not state" reasoning `use-my-bookings.ts` states.
  const activateInFlight = useRef(false);
  const [activateFailure, setActivateFailure] = useState<string | undefined>(undefined);

  const openDeactivate = useCallback((desk: AdminDesk) => {
    setDeactivateDialog({ desk, busy: false });
  }, []);

  const confirmDeactivate = useCallback(() => {
    if (deactivateInFlight.current || !deactivateDialog || deactivateDialog.busy) return;
    deactivateInFlight.current = true;
    const { desk } = deactivateDialog;
    setDeactivateDialog({ desk, busy: true });

    void resolvedDeactivateDesk(desk.id).then((outcome) => {
      deactivateInFlight.current = false;
      if (outcome.kind === 'ok') {
        if (desks.status === 'ready') desks.markStateChanged(desk.id, false);
        setSavedMessage(deskDeactivatedToast(desk.deskNumber));
        setDeactivateDialog(undefined);
        return;
      }
      if (outcome.kind === 'blocked') {
        setDeactivateDialog({ desk, busy: false, outcome: 'blocked', upcomingBookings: outcome.upcomingBookings });
        return;
      }
      // US-019/AC-11: the desk is unchanged — no `markStateChanged` call on this path — and the
      // dialog stays open with a retry, ST-08.
      setDeactivateDialog({ desk, busy: false, outcome: 'failed' });
    });
  }, [deactivateDialog, resolvedDeactivateDesk, desks]);

  const dismissDeactivate = useCallback(() => {
    setDeactivateDialog(undefined);
  }, []);

  const handleToggleActive = useCallback(
    (desk: AdminDesk) => {
      if (desk.isActive) {
        openDeactivate(desk);
        return;
      }

      // AC-09: no dialog, no count, no confirmation — activating just happens.
      if (activateInFlight.current) return;
      activateInFlight.current = true;
      setActivateFailure(undefined);

      void resolvedActivateDesk(desk.id).then((outcome) => {
        activateInFlight.current = false;
        if (outcome.kind === 'ok') {
          if (desks.status === 'ready') desks.markStateChanged(desk.id, true);
          setSavedMessage(deskActivatedToast(desk.deskNumber));
          return;
        }
        // SCR-006 ST-10's failure has no dialog to live in (AC-09) — a page-level `Alert`,
        // mirroring ST-08's wording (design note §8.4, open item 5(b); `decisions.md` D-07).
        setActivateFailure(activateFailedAlert(desk.deskNumber));
      });
    },
    [openDeactivate, resolvedActivateDesk, desks],
  );

  return (
    <>
      {savedMessage ? <Toast>{savedMessage}</Toast> : null}

      <div className="desks__header">
        <h1>{PAGE_TITLE}</h1>
        {desks.status !== 'error' ? <AddDeskButton onClick={deskFormDialog.openAdd} /> : null}
      </div>

      {activateFailure ? (
        <Alert tone="danger" live="assertive">
          {activateFailure}
        </Alert>
      ) : null}

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
        <DesksReady
          desks={desks.desks}
          onAddDesk={deskFormDialog.openAdd}
          onEditDesk={deskFormDialog.openEdit}
          onToggleActive={handleToggleActive}
        />
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

      {deactivateDialog ? (
        <DeskDeactivateDialog
          dialog={deactivateDialog}
          today={office.today}
          onConfirm={confirmDeactivate}
          onDismiss={dismissDeactivate}
        />
      ) : null}
    </>
  );
}

function DesksReady({
  desks,
  onAddDesk,
  onEditDesk,
  onToggleActive,
}: {
  desks: AdminDesk[];
  onAddDesk: () => void;
  onEditDesk: (desk: AdminDesk) => void;
  onToggleActive: (desk: AdminDesk) => void;
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
            <DeskInventoryRow key={desk.id} desk={desk} layout="table" onEdit={onEditDesk} onToggleActive={onToggleActive} />
          ))}
        </tbody>
      </table>
      <ul className="desks-cards">
        {desks.map((desk) => (
          <DeskInventoryRow key={desk.id} desk={desk} layout="card" onEdit={onEditDesk} onToggleActive={onToggleActive} />
        ))}
      </ul>
    </>
  );
}
