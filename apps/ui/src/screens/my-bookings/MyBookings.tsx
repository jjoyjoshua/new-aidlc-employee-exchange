/**
 * SCR-002 — My bookings. US-010 builds ST-01 through ST-06 (this file); US-011 (cancellation,
 * ST-07–ST-10) and US-012 (refresh on focus, REQ-036) build on top of it later.
 *
 * US-004/AC-07 and US-007/AC-03, AC-04 already put two `Toast`s here, carried on the navigation
 * that lands an employee on this screen — both preserved unchanged below.
 *
 * **Sectioning is `status`, never a date comparison** (design note §4.1, §7.1): `status ===
 * 'confirmed'` is Upcoming (or TODAY, if `date === data.today`); everything else — Completed,
 * and a Cancelled row whatever its date — is Past. A Cancelled booking dated next week still
 * belongs in Past (ST-10): the wire's own invariant (a `confirmed` item's date is never before
 * `today`) is what makes `status` alone sufficient.
 *
 * `data.today` — the payload's own today — is the ONLY "today" this screen uses (design note
 * §7.2). `office.today` from the auth context is used for nothing but the page header's
 * timezone; it can go stale across an office midnight with the tab open, which this list, unlike
 * `book-a-desk`, cannot accept (US-012's focus refresh depends on that not happening).
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';
import { Button } from '../../components/button/Button.js';
import { Alert } from '../../components/alert/Alert.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { SkeletonRow } from '../../components/skeleton-row/SkeletonRow.js';
import { BookingRow } from './BookingRow.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useMyBookings, type MyBookingsFetcher } from './use-my-bookings.js';
import { createFetchMyBookings } from './fetch-my-bookings.js';
import { formatOfficeDateLong } from '../../lib/format-office-date.js';
import {
  LOADING_ANNOUNCEMENT,
  LOAD_FAILED,
  NEVER_BOOKED,
  NOTHING_UPCOMING,
  OFFICE_TIME,
  PAST_BOOKINGS_HEADING,
  readyAnnouncement,
  SHOW_MORE,
  SHOW_MORE_ARIA_LABEL,
  TODAY_EYEBROW,
  UPCOMING_HEADING,
} from './copy.js';
import type { MyBookingListItem, OfficeDate, Office } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import './my-bookings.css';

interface BookingConfirmationState {
  deskNumber: string;
  dateLabel: string;
  confirmationEmail: string;
}

export interface MyBookingsProps {
  /** Test seam. Defaults to the real `GET /api/bookings` call over the authenticated client
   *  from `useAuth()` (US-010). `| undefined` (not just `?`) so a caller under
   *  `exactOptionalPropertyTypes` may pass a possibly-absent value without first stripping the
   *  key itself — same reasoning `EmptyStateProps.body` states. */
  fetchMyBookings?: MyBookingsFetcher | undefined;
}

export function MyBookings({ fetchMyBookings }: MyBookingsProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it (same reasoning `BookADesk` states).
  if (!office) return null;

  return <MyBookingsContent office={office} api={api} fetchMyBookings={fetchMyBookings} />;
}

function MyBookingsContent({
  office,
  api,
  fetchMyBookings,
}: {
  office: Office;
  api: ApiClient;
  fetchMyBookings: MyBookingsFetcher | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { toast?: string; bookingConfirmation?: BookingConfirmationState } | null;
  const [showPasswordToast] = useState(() => state?.toast === 'password-saved');
  const [bookingConfirmation] = useState(() => state?.bookingConfirmation);

  const resolvedFetch = useMemo(() => fetchMyBookings ?? createFetchMyBookings(api), [fetchMyBookings, api]);
  const stableFetch = useCallback<MyBookingsFetcher>((before, signal) => resolvedFetch(before, signal), [resolvedFetch]);
  const bookings = useMyBookings(stableFetch);

  const goBookADesk = () => navigate('/book');

  return (
    <div className="my-bookings">
      {showPasswordToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}
      {bookingConfirmation ? (
        <Toast>
          {bookingConfirmation.deskNumber} booked for {bookingConfirmation.dateLabel}. Confirmation emailed to{' '}
          {bookingConfirmation.confirmationEmail}.
        </Toast>
      ) : null}

      <div className="my-bookings__header">
        <h1>My bookings</h1>
        <p className="my-bookings__timezone">{OFFICE_TIME(office.timezone)}</p>
      </div>

      {/* AC-08. One role="status" node, always mounted, whose CONTENT changes — the same
          mechanism AvailabilityCount uses (US-006 design note §4.3) — never a region that
          unmounts and remounts per state, which announces twice or not at all. */}
      <div className="my-bookings__visually-hidden" role="status">
        {bookings.status === 'loading' ? LOADING_ANNOUNCEMENT : null}
        {bookings.status === 'ready'
          ? readyAnnouncement(bookings.items.filter((item) => item.status === 'confirmed').length)
          : null}
      </div>

      {bookings.status === 'loading' ? (
        <div className="my-bookings__skeleton-list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
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
        <MyBookingsReady
          today={bookings.today}
          items={bookings.items}
          nextBefore={bookings.nextBefore}
          loadingOlder={bookings.loadingOlder}
          onLoadOlder={bookings.loadOlder}
          onBookADesk={goBookADesk}
        />
      ) : null}
    </div>
  );
}

function MyBookingsReady({
  today,
  items,
  nextBefore,
  loadingOlder,
  onLoadOlder,
  onBookADesk,
}: {
  today: OfficeDate;
  items: MyBookingListItem[];
  nextBefore: OfficeDate | null;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onBookADesk: () => void;
}) {
  // AC-06. Both halves of "never booked" — an empty page with nowhere older to look either.
  const neverBooked = items.length === 0 && nextBefore === null;

  const todayItem = items.find((item) => item.status === 'confirmed' && item.date === today);
  const upcoming = items
    .filter((item) => item.status === 'confirmed' && item.date > today)
    .slice()
    .reverse(); // the wire is DESC throughout; this is AC-01's one ascending slice
  // Everything that is NOT an upcoming Confirmed row is Past — Completed, and a Cancelled row
  // whatever its date (design note §4.1). Already DESC, straight from the wire.
  const past = items.filter((item) => item.status !== 'confirmed');

  // AC-07. No Confirmed row at all — including today's — and either there IS something to show
  // in Past or there is somewhere older to look (design note §4.2's third case: all of the
  // caller's history is older than the 30-day floor).
  const nothingUpcoming = !todayItem && upcoming.length === 0 && !neverBooked;
  const showPastSection = past.length > 0 || nextBefore !== null;

  if (neverBooked) {
    return (
      <EmptyState
        title={NEVER_BOOKED.title}
        body={NEVER_BOOKED.body}
        actions={
          <Button variant="primary" onClick={onBookADesk}>
            Book a desk
          </Button>
        }
      />
    );
  }

  return (
    <>
      {todayItem ? (
        <div className="my-bookings__today-card">
          <p className="my-bookings__today-eyebrow">{TODAY_EYEBROW}</p>
          <BookingRow deskNumber={todayItem.deskNumber} date={todayItem.date} status={todayItem.status} emphasis />
        </div>
      ) : null}

      {nothingUpcoming ? (
        <EmptyState
          title={NOTHING_UPCOMING.title}
          actions={
            <Button variant="primary" onClick={onBookADesk}>
              Book a desk
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section className="my-bookings__section">
              <h2 className="my-bookings__section-heading">{UPCOMING_HEADING}</h2>
              <div className="my-bookings__card">
                {upcoming.map((item, i) => (
                  <Fragment key={item.id}>
                    {i > 0 ? <div className="my-bookings__divider" /> : null}
                    <BookingRow deskNumber={item.deskNumber} date={item.date} status={item.status} />
                  </Fragment>
                ))}
              </div>
            </section>
          ) : null}

          <Button variant="primary" onClick={onBookADesk}>
            Book a desk
          </Button>
        </>
      )}

      {showPastSection ? (
        <details className="my-bookings__section my-bookings__past" open>
          <summary className="my-bookings__section-heading my-bookings__past-toggle">{PAST_BOOKINGS_HEADING}</summary>
          {past.length > 0 ? (
            <div className="my-bookings__card">
              {past.map((item, i) => (
                <Fragment key={item.id}>
                  {i > 0 ? <div className="my-bookings__divider" /> : null}
                  <BookingRow deskNumber={item.deskNumber} date={item.date} status={item.status} />
                </Fragment>
              ))}
            </div>
          ) : null}
          {nextBefore !== null ? (
            <Button
              variant="secondary"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              busy={loadingOlder}
              aria-label={SHOW_MORE_ARIA_LABEL(formatOfficeDateLong(nextBefore))}
            >
              {SHOW_MORE}
            </Button>
          ) : null}
        </details>
      ) : null}
    </>
  );
}
