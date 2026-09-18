/**
 * SCR-003 — Book a desk. **US-005's slice only**: the date controls (ST-01, ST-02, ST-03).
 *
 * The desk list, its zones, and the confirm action are US-006's and US-007's, built on top of
 * this screen's date state and `fetchAvailability` seam (design note §4). Nothing here decides
 * which desks are free or takes one.
 */
import { useCallback, useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';
import { nextBookableDate } from '@desk-booking/contracts';
import { useAuth } from '../../lib/auth/auth-context.js';
import { DateStrip } from '../../components/date-strip/DateStrip.js';
import { DatePicker } from '../../components/date-picker/DatePicker.js';
import { useAvailability, type AvailabilityFetcher } from './use-availability.js';
import './book-a-desk.css';

export interface BookADeskProps {
  /** Test seam. Production has no default yet — US-006 supplies the real
   *  `GET /api/bookings/availability?date=` call (design note §4). */
  fetchAvailability?: AvailabilityFetcher;
}

const noAvailabilityYet: AvailabilityFetcher = async () => undefined;

export function BookADesk({ fetchAvailability = noAvailabilityYet }: BookADeskProps) {
  const { office } = useAuth();

  // Behind RequireSession, `office` is always present by the time this screen renders — the
  // guard on the session-check response guarantees it. Guarded here only so the type is honest.
  if (!office) return null;

  return <BookADeskContent office={office} fetchAvailability={fetchAvailability} />;
}

function BookADeskContent({
  office,
  fetchAvailability,
}: {
  office: NonNullable<ReturnType<typeof useAuth>['office']>;
  fetchAvailability: AvailabilityFetcher;
}) {
  const [selectedDate, setSelectedDate] = useState<OfficeDate>(() => nextBookableDate(office.today));
  const [pickerOpen, setPickerOpen] = useState(false);

  const stableFetch = useCallback<AvailabilityFetcher>(
    (date, signal) => fetchAvailability(date, signal),
    [fetchAvailability],
  );
  useAvailability(selectedDate, stableFetch);

  const selectDate = (date: OfficeDate) => {
    setSelectedDate(date);
    setPickerOpen(false);
  };

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
    </div>
  );
}
