/*
 * BookADesk — SCR-003. US-005 built the date controls (ST-01, ST-02, ST-03); US-006 added the
 * count line, the zone list, and the loading/empty/error states below them. US-007 adds
 * selection, the confirm action, and every remaining state: ST-07 (selected), ST-08 (booking in
 * progress), ST-09 (desk taken while looking), ST-10 (already booked that date), ST-12 (booking
 * failed) — ST-11 (booked) is the navigation to My bookings, rendered there.
 *
 * `--desk-row-height` is defined once, here, and read by both `DeskRow` and `SkeletonRow` — the
 * single shared source that keeps loading from shifting the layout (US-006/AC-07).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OfficeDate } from '@desk-booking/contracts';
import { nextBookableDate } from '@desk-booking/contracts';
import { useAuth } from '../../lib/auth/auth-context.js';
import { DateStrip } from '../../components/date-strip/DateStrip.js';
import { DatePicker } from '../../components/date-picker/DatePicker.js';
import { Button } from '../../components/button/Button.js';
import { Alert } from '../../components/alert/Alert.js';
import { AvailabilityCount } from '../../components/availability-count/AvailabilityCount.js';
import { ZoneGroup } from '../../components/zone-group/ZoneGroup.js';
import { ConfirmBookingBar } from '../../components/confirm-booking-bar/ConfirmBookingBar.js';
import { ExistingBookingState } from '../../components/existing-booking-state/ExistingBookingState.js';
import { createCancelBooking } from '../../components/existing-booking-state/cancel-booking.js';
import type { CancelBookingFetcher } from '../../components/existing-booking-state/cancel-booking.js';
import { SkeletonRow } from '../../components/skeleton-row/SkeletonRow.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { useAvailability, type AvailabilityFetcher } from './use-availability.js';
import { createFetchAvailability } from './fetch-availability.js';
import { useBookDesk, type CreateBookingFetcher } from './use-book-desk.js';
import { createCreateBooking } from './create-booking.js';
import { groupByZone } from './zones.js';
import { NO_DESKS_EXIST, AVAILABILITY_LOAD_FAILED, DESK_JUST_TAKEN, BOOKING_UNCERTAIN } from './copy.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import './book-a-desk.css';

export interface BookADeskProps {
  /** Test seam. Defaults to the real `GET /api/bookings/availability` call over the
   *  authenticated client from `useAuth()` (US-006). */
  fetchAvailability?: AvailabilityFetcher;
  /** Test seam. Defaults to the real `POST /api/bookings` call (US-007). */
  createBooking?: CreateBookingFetcher;
  /** Test seam. Defaults to the real `POST /api/bookings/:id/cancel` call (US-007/AC-07). */
  cancelBooking?: CancelBookingFetcher;
}

export function BookADesk({ fetchAvailability, createBooking, cancelBooking }: BookADeskProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it. Guarded here only so the type is honest.
  if (!office) return null;

  return (
    <BookADeskContent
      office={office}
      api={api}
      fetchAvailability={fetchAvailability}
      createBooking={createBooking}
      cancelBooking={cancelBooking}
    />
  );
}

function BookADeskContent({
  office,
  api,
  fetchAvailability,
  createBooking,
  cancelBooking,
}: {
  office: NonNullable<ReturnType<typeof useAuth>['office']>;
  api: ReturnType<typeof useAuth>['api'];
  fetchAvailability: AvailabilityFetcher | undefined;
  createBooking: CreateBookingFetcher | undefined;
  cancelBooking: CancelBookingFetcher | undefined;
}) {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<OfficeDate>(() => nextBookableDate(office.today));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDeskId, setSelectedDeskId] = useState<string | undefined>(undefined);
  // US-007/AC-08, AC-10. `undefined` — no failure shown; `'taken'` — ST-09; `'generic'` — ST-12.
  const [confirmFailure, setConfirmFailure] = useState<'taken' | 'generic' | undefined>(undefined);

  const resolvedFetch = useMemo(() => fetchAvailability ?? createFetchAvailability(api), [fetchAvailability, api]);
  const stableFetch = useCallback<AvailabilityFetcher>(
    (date, signal) => resolvedFetch(date, signal),
    [resolvedFetch],
  );
  const availability = useAvailability(selectedDate, stableFetch);

  const resolvedCreateBooking = useMemo(() => createBooking ?? createCreateBooking(api), [createBooking, api]);
  const { busy, confirm } = useBookDesk(resolvedCreateBooking);
  const resolvedCancelBooking = useMemo(() => cancelBooking ?? createCancelBooking(api), [cancelBooking, api]);

  const alertRef = useRef<HTMLDivElement>(null);
  // US-007/AC-05, design note §4. Set the instant a `user_conflict` triggers a refetch, together
  // with a snapshot of the `ready` data on screen at that moment (or `undefined` if the previous
  // fetch hadn't resolved yet). Consumed — and cleared — once availability comes back `ready`
  // with a DIFFERENT data object than the snapshot, so focus lands on the explanation only once
  // the REFETCHED response is actually on screen.
  //
  // Earlier this waited to *observe* an intermediate `loading` render before trusting the next
  // `ready` one — React is free to coalesce that intermediate render away when the mocked (or
  // fast-resolving) fetch settles inside the same batch as `retry()`'s own state update, which
  // left the flag never set and focus never moving. Comparing object identity against a captured
  // snapshot does not depend on any particular number of renders happening in between.
  const awaitingRaceFocus = useRef(false);
  const raceRefetchBaseline = useRef<unknown>(undefined);

  useEffect(() => {
    if (confirmFailure === 'taken') alertRef.current?.focus();
  }, [confirmFailure]);

  useEffect(() => {
    if (!awaitingRaceFocus.current) return;
    if (availability.status !== 'ready' || availability.data === raceRefetchBaseline.current) return;

    awaitingRaceFocus.current = false;
    raceRefetchBaseline.current = undefined;
    if (availability.data.myBooking) {
      // The heading `ExistingBookingState` renders — `getElementById` rather than a ref bridged
      // down two components, since this screen does not otherwise need a handle on that child.
      document.getElementById('existing-booking-state-heading')?.focus();
    }
    // A `null` myBooking here (the conflicting booking was itself cancelled in the interim)
    // falls back to the ordinary desk list with nothing further to do — the render below
    // already does that whenever `myBooking` is null.
  }, [availability]);

  const selectDate = (date: OfficeDate) => {
    if (busy) return; // FR-15 — the date control is read-only while a confirm is in flight.
    setSelectedDate(date);
    setPickerOpen(false);
    setSelectedDeskId(undefined); // FR-09 — any desk selection clears on a date change.
    setConfirmFailure(undefined);
  };

  const selectDesk = (deskId: string) => {
    if (busy) return; // FR-15 — desk rows are read-only while a confirm is in flight.
    setSelectedDeskId(deskId);
    setConfirmFailure(undefined);
  };

  const handleConfirm = async () => {
    if (!selectedDeskId) return;
    const outcome = await confirm({ date: selectedDate, deskId: selectedDeskId });
    if (!outcome) return; // FR-15 — a request was already in flight; this activation did nothing.

    if (outcome.kind === 'ok') {
      // FR-10, AC-03, AC-04. The destination reads this and renders a dismiss-free banner
      // naming the desk, the date and the confirmation email verbatim from the response — no
      // client-side reconstruction of the address.
      navigate('/bookings', {
        state: {
          bookingConfirmation: {
            deskNumber: outcome.booking.deskNumber,
            dateLabel: formatOfficeDateLabel(outcome.booking.date),
            confirmationEmail: outcome.booking.confirmationEmail,
          },
        },
      });
      return;
    }

    if (outcome.kind === 'desk_conflict') {
      // AC-08. Alert, refresh, clear selection, confirm returns to disabled (a consequence of
      // clearing the selection, not a separate flag) — no booking created.
      setSelectedDeskId(undefined);
      setConfirmFailure('taken');
      availability.retry();
      return;
    }

    if (outcome.kind === 'user_conflict') {
      // AC-05's race variant (design note §4). No data to render the existing-booking state
      // with yet — refetch for the same date, then render from the refetched `myBooking` once
      // it arrives (the effect above moves focus once that refetch resolves).
      setConfirmFailure(undefined);
      raceRefetchBaseline.current = availability.status === 'ready' ? availability.data : undefined;
      awaitingRaceFocus.current = true;
      availability.retry();
      return;
    }

    // AC-10. Retains the desk selection — deliberately not cleared.
    setConfirmFailure('generic');
  };

  const dateLabel = formatOfficeDateLabel(selectedDate);

  return (
    <div className="book-a-desk">
      <div className="book-a-desk__header">
        <h1>Book a desk</h1>
        <p className="book-a-desk__timezone">Office time ({office.timezone})</p>
      </div>

      <DateStrip
        today={office.today}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onOpenPicker={() => {
          if (!busy) setPickerOpen((open) => !open);
        }}
      />

      {pickerOpen ? (
        // Figma's "Popover anchor" (node 44:4385) — the calendar is centred under the
        // full-width strip, not left-aligned in the flex column (SCR-003 ST-03).
        <div className="book-a-desk__picker-anchor">
          <DatePicker today={office.today} selectedDate={selectedDate} onSelectDate={selectDate} />
        </div>
      ) : null}

      {availability.status === 'loading' ? (
        <>
          <AvailabilityCount status="loading" date={selectedDate} />
          <div className="book-a-desk__skeleton-list" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </>
      ) : null}

      {availability.status === 'error' ? (
        <Alert
          tone="danger"
          live="assertive"
          actions={
            <Button variant="secondary" onClick={availability.retry}>
              Try again
            </Button>
          }
        >
          {AVAILABILITY_LOAD_FAILED(dateLabel)}
        </Alert>
      ) : null}

      {availability.status === 'ready' ? (
        availability.data.myBooking ? (
          // FR-11, AC-06. Before any desk row, before the confirm action — the wasted choice
          // never happens.
          <ExistingBookingState
            bookingId={availability.data.myBooking.id}
            deskNumber={availability.data.myBooking.deskNumber}
            dateLabel={dateLabel}
            cancelBooking={resolvedCancelBooking}
            onCancelled={availability.retry}
          />
        ) : availability.data.desks.length === 0 ? (
          // AC-09, checked FIRST — US-009's fully-booked branch (US-009 owns "every desk is
          // taken") slots in AFTER this one, never before it (design note §2.6).
          <EmptyState title={NO_DESKS_EXIST.title} body={NO_DESKS_EXIST.body} />
        ) : (
          <>
            <AvailabilityCount
              status="ready"
              date={availability.data.date}
              freeCount={availability.data.desks.filter((d) => d.status === 'available').length}
              totalCount={availability.data.desks.length}
            />

            {confirmFailure === 'taken' ? (
              <div ref={alertRef} tabIndex={-1}>
                <Alert tone="danger" live="assertive">
                  {DESK_JUST_TAKEN}
                </Alert>
              </div>
            ) : null}

            {confirmFailure === 'generic' ? (
              <Alert
                tone="danger"
                live="assertive"
                actions={
                  <>
                    <Button variant="primary" onClick={() => navigate('/bookings')}>
                      Check my bookings
                    </Button>
                    <Button variant="secondary" onClick={() => void handleConfirm()}>
                      Try again
                    </Button>
                  </>
                }
              >
                {BOOKING_UNCERTAIN}
              </Alert>
            ) : null}

            <div className="book-a-desk__zones" role="radiogroup" aria-label="Choose a desk">
              {groupByZone(availability.data.desks).map((zone) => (
                <ZoneGroup
                  key={zone.letter}
                  letter={zone.letter}
                  desks={zone.desks}
                  selectedDeskId={selectedDeskId}
                  onSelectDesk={selectDesk}
                />
              ))}
            </div>

            <ConfirmBookingBar
              deskNumber={availability.data.desks.find((d) => d.id === selectedDeskId)?.deskNumber}
              dateLabel={dateLabel}
              busy={busy}
              onConfirm={() => void handleConfirm()}
            />
          </>
        )
      ) : null}
    </div>
  );
}
