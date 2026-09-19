/**
 * SCR-005 — All bookings. US-013 built the list itself: ST-01 (default), ST-02 (loading),
 * ST-03 (empty — no bookings at all) and ST-05 (load error). US-014 adds the filter bar itself:
 * ST-04 (empty — nothing matches the filter), ST-06 (filtered results) and ST-12 (the 360px
 * collapsed panel, inside `FilterBar`). Cancellation (ST-07–ST-11) is US-015's — not built here.
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
import { FilterBar } from './FilterBar.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useAllBookings, type AllBookingsFetcher } from './use-all-bookings.js';
import { createFetchAllBookings } from './fetch-all-bookings.js';
import { useDesks, type DesksFetcher } from './use-desks.js';
import { createFetchDesks } from './fetch-desks.js';
import { isFiltered, parseFilters, type AllBookingsFilters } from './filters.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import {
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
import type { AdminDesk, AllBookingsResponse, Office } from '@desk-booking/contracts';
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
}

export function AllBookings({ fetchAllBookings, fetchDesks }: AllBookingsProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it (same reasoning `MyBookings` states).
  if (!office) return null;

  return <AllBookingsContent office={office} api={api} fetchAllBookings={fetchAllBookings} fetchDesks={fetchDesks} />;
}

function AllBookingsContent({
  office,
  api,
  fetchAllBookings,
  fetchDesks,
}: {
  office: Office;
  api: ApiClient;
  fetchAllBookings: AllBookingsFetcher | undefined;
  fetchDesks: DesksFetcher | undefined;
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

  return (
    <>
      {showToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}

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
}: {
  items: AllBookingsResponse['items'];
  nextPage: number | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** US-014/AC-06's discriminator — browser state, never a wire field (design note §5, §7.1). */
  filteredView: boolean;
  onClearFilters: () => void;
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
