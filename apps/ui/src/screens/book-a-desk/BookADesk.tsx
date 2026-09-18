/**
 * SCR-003 — Book a desk. US-005 built the date controls (ST-01, ST-02, ST-03); **this story
 * (US-006) adds the availability list** — the count line, the zone groups, and the loading,
 * empty-office and load-failure states (ST-01, ST-02, ST-05, ST-06).
 *
 * Selection, the confirm action, and every other state (ST-04, ST-07–ST-12) are US-007's and
 * US-009's, built on top of this screen's date state and the `useAvailability` seam.
 */
import { useCallback, useMemo, useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';
import { nextBookableDate } from '@desk-booking/contracts';
import { useAuth } from '../../lib/auth/auth-context.js';
import { DateStrip } from '../../components/date-strip/DateStrip.js';
import { DatePicker } from '../../components/date-picker/DatePicker.js';
import { Button } from '../../components/button/Button.js';
import { Alert } from '../../components/alert/Alert.js';
import { AvailabilityCount } from '../../components/availability-count/AvailabilityCount.js';
import { ZoneGroup } from '../../components/zone-group/ZoneGroup.js';
import { SkeletonRow } from '../../components/skeleton-row/SkeletonRow.js';
import { EmptyState } from '../../components/empty-state/EmptyState.js';
import { useAvailability, type AvailabilityFetcher } from './use-availability.js';
import { createFetchAvailability } from './fetch-availability.js';
import { groupByZone } from './zones.js';
import { NO_DESKS_EXIST, AVAILABILITY_LOAD_FAILED } from './copy.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import './book-a-desk.css';

export interface BookADeskProps {
  /** Test seam. Defaults to the real `GET /api/bookings/availability` call over the
   *  authenticated client from `useAuth()` (US-006). */
  fetchAvailability?: AvailabilityFetcher;
}

export function BookADesk({ fetchAvailability }: BookADeskProps) {
  const { office, api } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it. Guarded here only so the type is honest.
  if (!office) return null;

  return <BookADeskContent office={office} api={api} fetchAvailability={fetchAvailability} />;
}

function BookADeskContent({
  office,
  api,
  fetchAvailability,
}: {
  office: NonNullable<ReturnType<typeof useAuth>['office']>;
  api: ReturnType<typeof useAuth>['api'];
  fetchAvailability: AvailabilityFetcher | undefined;
}) {
  const [selectedDate, setSelectedDate] = useState<OfficeDate>(() => nextBookableDate(office.today));
  const [pickerOpen, setPickerOpen] = useState(false);

  const resolvedFetch = useMemo(() => fetchAvailability ?? createFetchAvailability(api), [fetchAvailability, api]);
  const stableFetch = useCallback<AvailabilityFetcher>(
    (date, signal) => resolvedFetch(date, signal),
    [resolvedFetch],
  );
  const availability = useAvailability(selectedDate, stableFetch);

  const selectDate = (date: OfficeDate) => {
    setSelectedDate(date);
    setPickerOpen(false);
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
        onOpenPicker={() => setPickerOpen((open) => !open)}
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
        availability.data.desks.length === 0 ? (
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
            <div className="book-a-desk__zones">
              {groupByZone(availability.data.desks).map((zone) => (
                <ZoneGroup key={zone.letter} letter={zone.letter} desks={zone.desks} />
              ))}
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
