/**
 * SCR-005 — All bookings. US-013 built the list itself: ST-01 (default), ST-02 (loading),
 * ST-03 (empty — no bookings at all) and ST-05 (load error). US-014 adds the filter bar itself:
 * ST-04 (empty — nothing matches the filter), ST-06 (filtered results) and ST-12 (the 360px
 * collapsed panel, inside `FilterBar`). US-015 adds cancellation (ST-07–ST-11).
 *
 * US-004/AC-07 already puts the password-saved `Toast` here, carried on the navigation that
 * lands an admin on this screen after a forced password change — preserved unchanged below.
 *
 * **US-015's cancel flow, in outline** (design note §5): `useAdminCancelDialog` owns the
 * dialog's own state machine, mirroring `my-bookings/use-cancel-dialog.ts` with one deliberate
 * divergence — `handleAlreadyCancelled` below calls `bookings.markCancelled`, NEVER `bookings.retry`.
 * Under an active `status=confirmed` filter (US-014), a refetch would make the just-cancelled row
 * vanish, which is the exact behaviour AC-04 forbids. `justCancelledId` is this screen's own
 * addition, for ST-11's "focus returns to the row, which still exists" — `ConfirmDialog` restores
 * focus to whatever triggered it, but that element (the row's own Cancel button) is gone from the
 * DOM once the row is cancelled, so this screen refocuses the row itself after the dialog unmounts.
 */
import { useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';
import { Button } from '../../components/button/Button.js';
import { Alert } from '../../components/alert/Alert.js';
import { ConfirmDialog } from '../../components/confirm-dialog/ConfirmDialog.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { AdminBookingRow, AdminBookingsTableHead } from './AdminBookingRow.js';
import { AdminSkeletonRow } from './AdminSkeletonRow.js';
import { FilterBar } from './FilterBar.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useAllBookings, type AllBookingsFetcher } from './use-all-bookings.js';
import { createFetchAllBookings } from './fetch-all-bookings.js';
import { useDesks, type DesksFetcher } from './use-desks.js';
import { createFetchDesks } from './fetch-desks.js';
import { useAdminCancelDialog } from './use-admin-cancel-dialog.js';
import { createAdminCancelBooking, type CancelBookingFetcher } from '../../lib/cancel-booking.js';
import { isFiltered, parseFilters, type AllBookingsFilters } from './filters.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import {
  alreadyCancelledMessage,
  CANCEL_CLOSE_LABEL,
  CANCEL_CONFIRM_LABEL,
  CANCEL_FAILED_RETRYABLE,
  CANCEL_KEEP_LABEL,
  CANCEL_RETRY_LABEL,
  cancelDialogBody,
  cancelDialogTitle,
  cancelledToast,
  CLEAR_FILTERS,
  countLine,
  EMPTY_FILTERED_BODY,
  EMPTY_FILTERED_TITLE,
  EMPTY_NO_BOOKINGS_TITLE,
  LOAD_FAILED,
  OFFICE_TIME,
  SHOW_MORE,
  statusLabel,
} from './copy.js';
import type { AdminDesk, AllBookingsListItem, AllBookingsResponse, Office } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import './all-bookings.css';

export interface AllBookingsProps {
  /** Test seam. Defaults to the real `GET /api/admin/bookings` call over the authenticated
   *  client from `useAuth()`. `| undefined` (not just `?`) so a caller under
   *  `exactOptionalPropertyTypes` may pass a possibly-absent value without first stripping the
   *  key itself — same reasoning `MyBookingsProps.fetchMyBookings` states. */
  fetchAllBookings?: AllBookingsFetcher | undefined;
  /** Test seam for `GET /api/admin/desks` (US-014). Same `| undefined` reasoning as above. */
  fetchDesks?: DesksFetcher | undefined;
  /** Test seam, same reasoning as `fetchAllBookings` above. Defaults to the real
   *  `POST /api/admin/bookings/:id/cancel` call (US-015). */
  cancelBooking?: CancelBookingFetcher | undefined;
}

export function AllBookings({ fetchAllBookings, fetchDesks, cancelBooking }: AllBookingsProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it (same reasoning `MyBookings` states).
  if (!office) return null;

  return (
    <AllBookingsContent
      office={office}
      api={api}
      fetchAllBookings={fetchAllBookings}
      fetchDesks={fetchDesks}
      cancelBooking={cancelBooking}
    />
  );
}

function AllBookingsContent({
  office,
  api,
  fetchAllBookings,
  fetchDesks,
  cancelBooking,
}: {
  office: Office;
  api: ApiClient;
  fetchAllBookings: AllBookingsFetcher | undefined;
  fetchDesks: DesksFetcher | undefined;
  cancelBooking: CancelBookingFetcher | undefined;
}) {
  const location = useLocation();
  const [showToast] = useState(() => (location.state as { toast?: string } | null)?.toast === 'password-saved');

  // AC-08's receiving half — read ONCE on mount, never written back (design note §2.2). The
  // lazy initializer runs exactly once, on mount, regardless of later `location.search` changes —
  // matching "the URL seeds the initial filter state and nothing more".
  const [filters, setFilters] = useState<AllBookingsFilters>(() => parseFilters(location.search));

  const resolvedFetch = useMemo(() => fetchAllBookings ?? createFetchAllBookings(api), [fetchAllBookings, api]);
  const stableFetch = useCallback<AllBookingsFetcher>(
    (f, page, signal) => resolvedFetch(f, page, signal),
    [resolvedFetch],
  );
  const bookings = useAllBookings(stableFetch, filters);

  const resolvedFetchDesks = useMemo(() => fetchDesks ?? createFetchDesks(api), [fetchDesks, api]);
  const desksState = useDesks(resolvedFetchDesks);
  const desks: AdminDesk[] = desksState.status === 'ready' ? desksState.desks : [];

  const filteredView = isFiltered(filters);
  const deskLabel = filters.deskId !== undefined ? desks.find((d) => d.id === filters.deskId)?.deskNumber : undefined;

  // US-015/AC-05, AC-06, ST-11. A live in-page event, matching `MyBookings`'s own
  // `cancelledMessage` — set once a cancellation THIS screen performed succeeds. This is copy
  // only; no email is actually sent by this story (`decisions.md` D-03).
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);
  // ST-11's focus-return target — the id of the row that just left the DOM's set of cancellable
  // rows (its own Cancel button gone), so `ConfirmDialog`'s own focus-restore has nothing to
  // return to (design note §5.6).
  const [justCancelledId, setJustCancelledId] = useState<string | null>(null);

  const resolvedCancelBooking = useMemo(() => cancelBooking ?? createAdminCancelBooking(api), [cancelBooking, api]);
  const handleCancelled = useCallback(
    (item: AllBookingsListItem) => {
      bookings.markCancelled(item.id);
      setCancelledMessage(cancelledToast(item.deskNumber, formatOfficeDateLabel(item.date), item.employeeName));
      setJustCancelledId(item.id);
    },
    [bookings],
  );
  // US-015/AC-09. A 409 means the row exists and its status IS cancelled — the server just
  // asserted it, so this applies a known fact rather than guessing (design note §5.3). No toast:
  // ST-10's dialog message already told the administrator what happened.
  const handleAlreadyCancelled = useCallback(
    (item: AllBookingsListItem) => {
      bookings.markCancelled(item.id);
      setJustCancelledId(item.id);
    },
    [bookings],
  );
  const cancelDialog = useAdminCancelDialog(resolvedCancelBooking, handleCancelled, handleAlreadyCancelled);

  // Runs after the dialog has unmounted (its own focus-restore effect's cleanup fires first,
  // since React tears down a child's effects before a parent's in the same commit — design note
  // §5.6). Refocuses the row via BOTH rendered trees; `.focus()` on the one CSS has hidden is a
  // silent no-op, so only the visible one actually takes focus.
  useEffect(() => {
    if (cancelDialog.dialog || justCancelledId === null) return;
    const rows = document.querySelectorAll<HTMLElement>(`[data-booking-row="${justCancelledId}"]`);
    rows.forEach((row) => row.focus());
    setJustCancelledId(null);
  }, [cancelDialog.dialog, justCancelledId]);

  return (
    <>
      {showToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}
      {cancelledMessage ? <Toast>{cancelledMessage}</Toast> : null}

      <div className="all-bookings__header">
        <h1>All bookings</h1>
        <p className="all-bookings__timezone">{OFFICE_TIME(office.timezone)}</p>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        desks={desks}
        desksDisabled={desksState.status !== 'ready'}
        today={office.today}
      />

      {bookings.status === 'loading' ? (
        <span className="all-bookings__count all-bookings__count--skeleton" aria-hidden="true" />
      ) : null}

      {bookings.status === 'ready' ? (
        <p className="all-bookings__count" role="status">
          {countLine(bookings.total, formatOfficeDateLabel(filters.from ?? bookings.today), {
            ...(deskLabel !== undefined && { deskLabel }),
            ...(filters.to !== undefined && { toLabel: formatOfficeDateLabel(filters.to) }),
            ...(filters.status !== undefined && { statusLabel: statusLabel(filters.status) }),
          })}
        </p>
      ) : null}

      {bookings.status === 'loading' ? (
        <>
          <table className="admin-bookings-table" aria-hidden="true">
            <AdminBookingsTableHead />
            <tbody>
              {Array.from({ length: 3 }, (_, i) => (
                <AdminSkeletonRow key={i} layout="table" />
              ))}
            </tbody>
          </table>
          <ul className="admin-bookings-cards" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <AdminSkeletonRow key={i} layout="card" />
            ))}
          </ul>
        </>
      ) : null}

      {bookings.status === 'error' ? (
        <Alert
          tone="danger"
          live="assertive"
          actions={
            <Button variant="secondary" onClick={bookings.retry}>
              Try again
            </Button>
          }
        >
          {LOAD_FAILED}
        </Alert>
      ) : null}

      {bookings.status === 'ready' ? (
        <AllBookingsReady
          items={bookings.items}
          nextPage={bookings.nextPage}
          loadingMore={bookings.loadingMore}
          onLoadMore={bookings.loadMore}
          filteredView={filteredView}
          onClearFilters={() => setFilters({})}
          onCancel={cancelDialog.open}
        />
      ) : null}

      {/* US-015, ST-08–ST-10. Rendered as an overlay sibling of the list, the same pattern
          `MyBookings` already uses for the identical dialog on SCR-002. */}
      {cancelDialog.dialog ? (
        <ConfirmDialog
          title={cancelDialogTitle(cancelDialog.dialog.item.employeeName)}
          body={cancelDialogBody(
            cancelDialog.dialog.item.deskNumber,
            formatOfficeDateLabel(cancelDialog.dialog.item.date),
            cancelDialog.dialog.item.employeeName,
          )}
          confirmLabel={cancelDialog.dialog.outcome === 'retryable' ? CANCEL_RETRY_LABEL : CANCEL_CONFIRM_LABEL}
          cancelLabel={cancelDialog.dialog.outcome === 'already_cancelled' ? CANCEL_CLOSE_LABEL : CANCEL_KEEP_LABEL}
          singleAction={cancelDialog.dialog.outcome === 'already_cancelled'}
          busy={cancelDialog.dialog.busy}
          error={
            cancelDialog.dialog.outcome === 'already_cancelled'
              ? alreadyCancelledMessage(cancelDialog.dialog.item.employeeName)
              : cancelDialog.dialog.outcome === 'retryable'
                ? CANCEL_FAILED_RETRYABLE
                : undefined
          }
          onConfirm={cancelDialog.confirm}
          onCancel={cancelDialog.dismiss}
        />
      ) : null}
    </>
  );
}

function AllBookingsReady({
  items,
  nextPage,
  loadingMore,
  onLoadMore,
  filteredView,
  onClearFilters,
  onCancel,
}: {
  items: AllBookingsResponse['items'];
  nextPage: number | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** US-014/AC-06's discriminator — browser state, never a wire field (design note §5, §7.1). */
  filteredView: boolean;
  onClearFilters: () => void;
  /** US-015/AC-01. Opens the cancel dialog for the given row. */
  onCancel: (item: AllBookingsListItem) => void;
}) {
  if (items.length === 0) {
    // AC-06. Distinct copy for "nothing matches the filter" (ST-04) vs "the system holds no
    // bookings whatsoever" (ST-03, US-013/AC-08) — an administrator must be able to tell them
    // apart, and the discriminator is whether any filter is active, not the count alone.
    return filteredView ? (
      <EmptyState
        title={EMPTY_FILTERED_TITLE}
        body={EMPTY_FILTERED_BODY}
        actions={
          <Button variant="secondary" onClick={onClearFilters}>
            {CLEAR_FILTERS}
          </Button>
        }
      />
    ) : (
      <EmptyState title={EMPTY_NO_BOOKINGS_TITLE} />
    );
  }

  return (
    <>
      <table className="admin-bookings-table">
        <AdminBookingsTableHead />
        <tbody>
          {items.map((item) => (
            <AdminBookingRow key={item.id} item={item} layout="table" onCancel={onCancel} />
          ))}
        </tbody>
      </table>
      <ul className="admin-bookings-cards">
        {items.map((item) => (
          <AdminBookingRow key={item.id} item={item} layout="card" onCancel={onCancel} />
        ))}
      </ul>

      {nextPage !== null ? (
        <div className="all-bookings__show-more">
          <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore} busy={loadingMore}>
            {SHOW_MORE}
          </Button>
        </div>
      ) : null}
    </>
  );
}
