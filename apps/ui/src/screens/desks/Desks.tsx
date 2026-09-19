/**
 * SCR-006 — Desks (US-016). ST-01 Default, ST-02 Loading, ST-03 Empty, ST-04 Load error only —
 * ST-05 through ST-10 (deactivate confirm/blocked/activate) are US-019's and are not built here
 * (design note §6.2, "What this story must NOT build").
 *
 * **Every row action, and both Add desk buttons, render visible and `disabled`.** US-017 (add),
 * US-018 (edit) and US-019 (deactivate/activate) — their destinations — do not exist yet, and
 * AC-06/AC-08 make the controls themselves this story's subject, so omitting them would fail
 * those ACs (design note §6). Each `US-017 deletes this` / `US-018 deletes this` / `US-019
 * deletes this`-titled assertion in `Desks.spec.tsx` and `DeskInventoryRow.spec.tsx` is the
 * forcing function that story must edit to ship.
 *
 * A load failure (ST-04) is a DIFFERENT case from the rest: Add desk is HIDDEN, not disabled,
 * because adding a desk blind risks a duplicate-number refusal against a list nobody can see
 * (AC-07, BR-001.8). Elsewhere the control is present but disabled because its destination is
 * unbuilt. Two reasons, two renderings — conflating them is the likely slip (design note §7.3).
 */
import { useCallback, useMemo, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useDesks, type DesksFetcher } from '../../lib/use-desks.js';
import { createFetchDesks } from '../../lib/fetch-desks.js';
import { DeskInventoryRow, DeskInventoryTableHead } from './DeskInventoryRow.js';
import { DeskInventorySkeletonRow } from './DeskInventorySkeletonRow.js';
import { ADD_DESK_LABEL, EMPTY_BODY, EMPTY_TITLE, LOAD_FAILED, PAGE_TITLE, TRY_AGAIN_LABEL, UNAVAILABLE_CONTROL_REASON, summaryLine } from './copy.js';
import './desks.css';

export interface DesksProps {
  /** Test seam. Defaults to the real `GET /api/admin/desks` call over the authenticated client
   *  from `useAuth()`. `| undefined` (not just `?`), same reasoning `AllBookingsProps.fetchAllBookings`
   *  states under `exactOptionalPropertyTypes`. */
  fetchDesks?: DesksFetcher | undefined;
}

export function Desks({ fetchDesks }: DesksProps) {
  const { api } = useAuth();
  return <DesksContent api={api} fetchDesks={fetchDesks} />;
}

/** US-017 deletes this: the Add desk button is disabled everywhere it is not entirely hidden
 *  (ST-04). Carries `UNAVAILABLE_CONTROL_REASON` as both a mouse `title` and part of its
 *  accessible name, the same pattern `DeskInventoryRow`'s row actions use. */
function AddDeskButton() {
  return (
    <Button variant="primary" disabled title={UNAVAILABLE_CONTROL_REASON}>
      {ADD_DESK_LABEL}
      <span className="desks__visually-hidden"> {UNAVAILABLE_CONTROL_REASON}</span>
    </Button>
  );
}

function DesksContent({ api, fetchDesks }: { api: ReturnType<typeof useAuth>['api']; fetchDesks: DesksFetcher | undefined }) {
  const resolvedFetch = useMemo(() => fetchDesks ?? createFetchDesks(api), [fetchDesks, api]);
  // A retry re-fetches by changing `stableFetch`'s identity, which is `useDesks`'s own effect
  // dependency — the same "stableFetch" device `AllBookings.tsx` uses for filter changes, applied
  // here to force a re-run on demand rather than on a dependency change (`decisions.md` D-06).
  const [retryKey, setRetryKey] = useState(0);
  const stableFetch = useCallback<DesksFetcher>((signal) => resolvedFetch(signal), [resolvedFetch, retryKey]);
  const desks = useDesks(stableFetch);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  return (
    <>
      <div className="desks__header">
        <h1>{PAGE_TITLE}</h1>
        {desks.status !== 'error' ? <AddDeskButton /> : null}
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

      {desks.status === 'ready' ? <DesksReady desks={desks.desks} /> : null}
    </>
  );
}

function DesksReady({ desks }: { desks: AdminDesk[] }) {
  if (desks.length === 0) {
    // AC-06. No table and no column headers over nothing — SCR-006 is explicit that headers
    // over nothing are furniture (design note §7.3).
    return <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} actions={<AddDeskButton />} />;
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
