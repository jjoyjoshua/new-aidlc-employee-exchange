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
import { ConfirmDialog } from '../../components/confirm-dialog/ConfirmDialog.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { SkeletonRow } from '../../components/skeleton-row/SkeletonRow.js';
import { BookingRow } from './BookingRow.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { useFocusRefresh } from '../../lib/data-refresh.js';
import { useMyBookings, type MyBookingsFetcher } from './use-my-bookings.js';
import { useCancelDialog } from './use-cancel-dialog.js';
import { createFetchMyBookings } from './fetch-my-bookings.js';
import { createCancelBooking, type CancelBookingFetcher } from '../../lib/cancel-booking.js';
import { formatOfficeDateLabel, formatOfficeDateLong } from '../../lib/format-office-date.js';
import {
  CANCEL_ALREADY_CANCELLED,
  CANCEL_CLOSE_LABEL,
  CANCEL_CONFIRM_LABEL,
  CANCEL_DIALOG_TITLE,
  CANCEL_FAILED_RETRYABLE,
  CANCEL_KEEP_LABEL,
  cancelDialogBody,
  cancelledToast,
  LOADING_ANNOUNCEMENT,
  LOAD_FAILED,
  NEVER_BOOKED,
  NOTHING_UPCOMING,
  OFFICE_TIME,
  PAST_BOOKINGS_HEADING,
  QUIET_REFRESH_FAILED,
  readyAnnouncement,
  SHOW_MORE,
  SHOW_MORE_ARIA_LABEL,
  TODAY_EYEBROW,
  UPCOMING_HEADING,
} from './copy.js';
import type { AuthenticatedUser, MyBookingListItem, OfficeDate, Office } from '@desk-booking/contracts';
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
  /** Test seam, same reasoning as `fetchMyBookings` above. Defaults to the real
   *  `POST /api/bookings/:id/cancel` call (US-011). */
  cancelBooking?: CancelBookingFetcher | undefined;
}

export function MyBookings({ fetchMyBookings, cancelBooking }: MyBookingsProps) {
  const { office, api, user } = useAuth();

  // Behind RequireSession, `office` and `user` are always present by the time this screen
  // renders — the guard on the session-check response guarantees it (same reasoning `BookADesk`
  // states for `office`).
  if (!office || !user) return null;

  return <MyBookingsContent office={office} api={api} user={user} fetchMyBookings={fetchMyBookings} cancelBooking={cancelBooking} />;
}

function MyBookingsContent({
  office,
  api,
  user,
  fetchMyBookings,
  cancelBooking,
}: {
  office: Office;
  api: ApiClient;
  user: AuthenticatedUser;
  fetchMyBookings: MyBookingsFetcher | undefined;
  cancelBooking: CancelBookingFetcher | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { toast?: string; bookingConfirmation?: BookingConfirmationState } | null;
  const [showPasswordToast] = useState(() => state?.toast === 'password-saved');
  const [bookingConfirmation] = useState(() => state?.bookingConfirmation);
  // US-011/AC-05, ST-10. A live in-page event, not navigation state — set once a cancellation
  // this screen itself performed succeeds. `null` until then; `Toast` has no dismiss, matching
  // its own "one message per page visit" rule (design note §5.3).
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  const resolvedFetch = useMemo(() => fetchMyBookings ?? createFetchMyBookings(api), [fetchMyBookings, api]);
  const stableFetch = useCallback<MyBookingsFetcher>((before, signal) => resolvedFetch(before, signal), [resolvedFetch]);
  const bookings = useMyBookings(stableFetch);

  const resolvedCancelBooking = useMemo(() => cancelBooking ?? createCancelBooking(api), [cancelBooking, api]);
  const handleCancelled = useCallback(
    (item: MyBookingListItem) => {
      if (bookings.status === 'ready') bookings.markCancelled(item.id);
      setCancelledMessage(cancelledToast(item.deskNumber, formatOfficeDateLabel(item.date), user.email));
    },
    [bookings, user.email],
  );
  const cancelDialog = useCancelDialog(resolvedCancelBooking, handleCancelled, bookings.retry);

  // US-012/AC-05: suppressed while the cancel dialog is open, so a regain can never pull the row
  // out from under a confirmation (US-012/D-05) — the shared listener itself lives in
  // `lib/data-refresh.ts` (ADR-008), not here.
  useFocusRefresh(bookings.refreshQuietly, { enabled: cancelDialog.dialog === undefined });

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
      {cancelledMessage ? <Toast>{cancelledMessage}</Toast> : null}

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

      {/* US-012/AC-04. Sits above the still-showing list — never replaces it, unlike the
          status === 'error' Alert below, which has no list left to sit above. */}
      {bookings.status === 'ready' && bookings.quietRefreshFailed ? (
        <Alert
          tone="warning"
          live="assertive"
          actions={
            <Button variant="secondary" onClick={bookings.refreshQuietly}>
              Try again
            </Button>
          }
        >
          {QUIET_REFRESH_FAILED}
        </Alert>
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
          onCancelRow={cancelDialog.open}
        />
      ) : null}

      {/* US-011, ST-07–ST-10. Rendered as an overlay sibling of the list, the same pattern
          `ExistingBookingState` already uses for the identical dialog on SCR-003. */}
      {cancelDialog.dialog ? (
        <ConfirmDialog
          title={CANCEL_DIALOG_TITLE}
          body={cancelDialogBody(cancelDialog.dialog.item.deskNumber, formatOfficeDateLabel(cancelDialog.dialog.item.date))}
          confirmLabel={CANCEL_CONFIRM_LABEL}
          cancelLabel={cancelDialog.dialog.outcome === 'already_cancelled' ? CANCEL_CLOSE_LABEL : CANCEL_KEEP_LABEL}
          singleAction={cancelDialog.dialog.outcome === 'already_cancelled'}
          busy={cancelDialog.dialog.busy}
          error={
            cancelDialog.dialog.outcome === 'already_cancelled'
              ? CANCEL_ALREADY_CANCELLED
              : cancelDialog.dialog.outcome === 'retryable'
                ? CANCEL_FAILED_RETRYABLE
                : undefined
          }
          onConfirm={cancelDialog.confirm}
          onCancel={cancelDialog.dismiss}
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
  onCancelRow,
}: {
  today: OfficeDate;
  items: MyBookingListItem[];
  nextBefore: OfficeDate | null;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onBookADesk: () => void;
  /** US-011/AC-01. Passed only to rows this screen renders as cancellable — the TODAY row and
   *  Upcoming rows, never Past — by ADR-007's wire invariant (`status === 'confirmed'`). */
  onCancelRow: (item: MyBookingListItem) => void;
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
          <BookingRow
            deskNumber={todayItem.deskNumber}
            date={todayItem.date}
            status={todayItem.status}
            emphasis
            onCancel={() => onCancelRow(todayItem)}
          />
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
                    <BookingRow
                      deskNumber={item.deskNumber}
                      date={item.date}
                      status={item.status}
                      onCancel={() => onCancelRow(item)}
                    />
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
