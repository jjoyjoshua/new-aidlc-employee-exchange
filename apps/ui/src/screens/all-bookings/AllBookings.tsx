/**
 * SCR-005 — All bookings. US-013 builds the list itself: ST-01 (default), ST-02 (loading),
 * ST-03 (empty — no bookings at all) and ST-05 (load error). Filters (ST-04, ST-06, ST-12) are
 * US-014's; cancellation (ST-07–ST-11) is US-015's — neither is built here (design note, this
 * story's folder in `inception/specs/`).
 *
 * US-004/AC-07 already puts the password-saved `Toast` here, carried on the navigation that
 * lands an admin on this screen after a forced password change — preserved unchanged below.
 */
import { useLocation } from 'react-router-dom';
import { useCallback, useMemo, useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';
import { Button } from '../../components/button/Button.js';
import { Alert } from '../../components/alert/Alert.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { AdminBookingRow, AdminBookingsTableHead } from './AdminBookingRow.js';
import { AdminSkeletonRow } from './AdminSkeletonRow.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useAllBookings, type AllBookingsFetcher } from './use-all-bookings.js';
import { createFetchAllBookings } from './fetch-all-bookings.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import { countLine, EMPTY_NO_BOOKINGS_TITLE, LOAD_FAILED, OFFICE_TIME, SHOW_MORE } from './copy.js';
import type { AllBookingsResponse, Office } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import './all-bookings.css';

export interface AllBookingsProps {
  /** Test seam. Defaults to the real `GET /api/admin/bookings` call over the authenticated
   *  client from `useAuth()`. `| undefined` (not just `?`) so a caller under
   *  `exactOptionalPropertyTypes` may pass a possibly-absent value without first stripping the
   *  key itself — same reasoning `MyBookingsProps.fetchMyBookings` states. */
  fetchAllBookings?: AllBookingsFetcher | undefined;
}

export function AllBookings({ fetchAllBookings }: AllBookingsProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it (same reasoning `MyBookings` states).
  if (!office) return null;

  return <AllBookingsContent office={office} api={api} fetchAllBookings={fetchAllBookings} />;
}

function AllBookingsContent({
  office,
  api,
  fetchAllBookings,
}: {
  office: Office;
  api: ApiClient;
  fetchAllBookings: AllBookingsFetcher | undefined;
}) {
  const location = useLocation();
  const [showToast] = useState(() => (location.state as { toast?: string } | null)?.toast === 'password-saved');

  const resolvedFetch = useMemo(() => fetchAllBookings ?? createFetchAllBookings(api), [fetchAllBookings, api]);
  const stableFetch = useCallback<AllBookingsFetcher>((page, signal) => resolvedFetch(page, signal), [resolvedFetch]);
  const bookings = useAllBookings(stableFetch);

  return (
    <>
      {showToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}

      <div className="all-bookings__header">
        <h1>All bookings</h1>
        <p className="all-bookings__timezone">{OFFICE_TIME(office.timezone)}</p>
      </div>

      {bookings.status === 'loading' ? (
        <span className="all-bookings__count all-bookings__count--skeleton" aria-hidden="true" />
      ) : null}

      {bookings.status === 'ready' ? (
        <p className="all-bookings__count" role="status">
          {countLine(bookings.total, formatOfficeDateLabel(bookings.today))}
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
}: {
  items: AllBookingsResponse['items'];
  nextPage: number | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  // AC-08. The system holds no bookings whatsoever — distinct from "nothing matches the filter",
  // which is US-014's state and does not exist in this story (there are no filters yet).
  if (items.length === 0) {
    return <EmptyState title={EMPTY_NO_BOOKINGS_TITLE} />;
  }

  return (
    <>
      <table className="admin-bookings-table">
        <AdminBookingsTableHead />
        <tbody>
          {items.map((item) => (
            <AdminBookingRow key={item.id} item={item} layout="table" />
          ))}
        </tbody>
      </table>
      <ul className="admin-bookings-cards">
        {items.map((item) => (
          <AdminBookingRow key={item.id} item={item} layout="card" />
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
