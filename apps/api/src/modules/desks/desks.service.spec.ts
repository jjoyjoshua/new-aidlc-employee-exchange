import { describe, expect, it } from 'vitest';
import { createDesksService } from './desks.service.js';
import type { DesksRepository } from './desks.repository.js';

const TODAY = '2026-09-19';
const NOW_MS = Date.parse(`${TODAY}T12:00:00Z`);

interface StubOptions {
  rows: Array<{ id: string; desk_number: string; is_active: boolean }>;
  /** desk ids of confirmed, upcoming bookings — one entry per booking, matching the repository's
   *  own one-row-per-booking shape (US-016 design note §2.2). */
  upcomingDeskIds?: string[];
}

function stubRepository({ rows, upcomingDeskIds = [] }: StubOptions): {
  repository: DesksRepository;
  calls: Array<{ status: string; from: string }>;
} {
  const calls: Array<{ status: string; from: string }> = [];
  return {
    calls,
    repository: {
      async listAllDesks() {
        return rows;
      },
      async listUpcomingConfirmedDeskIds(status, from) {
        calls.push({ status, from });
        return upcomingDeskIds;
      },
    },
  };
}

function service(repository: DesksRepository, nowMs: () => number = () => NOW_MS) {
  return createDesksService({ desks: repository, nowMs, officeTimezone: 'Asia/Kolkata' });
}

describe('createDesksService.listAllDesks — mapping (US-014/AC-03, US-016/AC-01)', () => {
  it('maps a mixed active/inactive fixture to adminDeskSchema rows in the same order', async () => {
    const { repository } = stubRepository({
      rows: [
        { id: 'a', desk_number: 'A-01', is_active: true },
        { id: 'b', desk_number: 'A-02', is_active: false },
      ],
    });

    const result = await service(repository).listAllDesks();

    expect(result).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
      { id: 'b', deskNumber: 'A-02', isActive: false, bookedAhead: 0 },
    ]);
  });

  it('returns an empty list rather than throwing when the repository has none', async () => {
    const { repository } = stubRepository({ rows: [] });
    expect(await service(repository).listAllDesks()).toEqual([]);
  });
});

describe('createDesksService.listAllDesks — the booked-ahead count (US-016/AC-04, AC-05, BR-001.9)', () => {
  it('tallies three confirmed upcoming bookings on one desk to bookedAhead: 3', async () => {
    const { repository } = stubRepository({
      rows: [{ id: 'a', desk_number: 'A-01', is_active: true }],
      upcomingDeskIds: ['a', 'a', 'a'],
    });

    const result = await service(repository).listAllDesks();

    expect(result).toEqual([{ id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 }]);
  });

  it('does not let one desk’s bookings leak into another’s count', async () => {
    const { repository } = stubRepository({
      rows: [
        { id: 'a', desk_number: 'A-01', is_active: true },
        { id: 'b', desk_number: 'A-02', is_active: true },
      ],
      upcomingDeskIds: ['a', 'a', 'b'],
    });

    const result = await service(repository).listAllDesks();

    expect(result).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 2 },
      { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 1 },
    ]);
  });

  it('AC-05: a desk with no matching bookings reports 0, never undefined or omitted', async () => {
    const { repository } = stubRepository({
      rows: [{ id: 'a', desk_number: 'A-01', is_active: true }],
      upcomingDeskIds: [],
    });

    const result = await service(repository).listAllDesks();

    expect(result[0]?.bookedAhead).toBe(0);
    expect(Object.keys(result[0] ?? {})).toContain('bookedAhead');
  });

  it('borrows the predicate for ‘confirmed’ as-of today — never writes the rule literally', async () => {
    const { repository, calls } = stubRepository({
      rows: [{ id: 'a', desk_number: 'A-01', is_active: true }],
    });

    await service(repository).listAllDesks();

    expect(calls).toEqual([{ status: 'confirmed', from: TODAY }]);
  });

  it('reads the clock exactly once per call, even with multiple desks', async () => {
    let calls = 0;
    const nowMs = () => {
      calls += 1;
      return NOW_MS;
    };
    const { repository } = stubRepository({
      rows: [
        { id: 'a', desk_number: 'A-01', is_active: true },
        { id: 'b', desk_number: 'A-02', is_active: false },
      ],
    });

    await service(repository, nowMs).listAllDesks();

    expect(calls).toBe(1);
  });
});
