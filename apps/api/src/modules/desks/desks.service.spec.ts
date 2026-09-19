import { describe, expect, it } from 'vitest';
import { createDesksService } from './desks.service.js';
import type { DesksRepository, InsertDeskOutcome, UpdateDeskOutcome } from './desks.repository.js';

const TODAY = '2026-09-19';
const NOW_MS = Date.parse(`${TODAY}T12:00:00Z`);

interface StubOptions {
  rows: Array<{ id: string; desk_number: string; is_active: boolean }>;
  /** desk ids of confirmed, upcoming bookings — one entry per booking, matching the repository's
   *  own one-row-per-booking shape (US-016 design note §2.2). */
  upcomingDeskIds?: string[];
  insertResult?: InsertDeskOutcome;
  updateResult?: UpdateDeskOutcome;
}

function stubRepository({ rows, upcomingDeskIds = [], insertResult, updateResult }: StubOptions): {
  repository: DesksRepository;
  calls: Array<{ status: string; from: string }>;
  insertCalls: string[];
  updateCalls: Array<{ id: string; deskNumber: string; updatedAt: Date }>;
  upcomingCallCount: () => number;
} {
  const calls: Array<{ status: string; from: string }> = [];
  const insertCalls: string[] = [];
  const updateCalls: Array<{ id: string; deskNumber: string; updatedAt: Date }> = [];
  return {
    calls,
    insertCalls,
    updateCalls,
    upcomingCallCount: () => calls.length,
    repository: {
      async listAllDesks() {
        return rows;
      },
      async listUpcomingConfirmedDeskIds(status, from) {
        calls.push({ status, from });
        return upcomingDeskIds;
      },
      async insertDesk(deskNumber) {
        insertCalls.push(deskNumber);
        return insertResult ?? { kind: 'ok', desk: { id: 'new', desk_number: deskNumber, is_active: true } };
      },
      async updateDeskNumber(id, deskNumber, updatedAt) {
        updateCalls.push({ id, deskNumber, updatedAt });
        return updateResult ?? { kind: 'ok', desk: { id, desk_number: deskNumber, is_active: true } };
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

describe('createDesksService.createDesk (US-017/AC-01, AC-04)', () => {
  it('maps a successful insert to an AdminDesk with bookedAhead: 0 (US-017/AC-01)', async () => {
    const { repository } = stubRepository({
      rows: [],
      insertResult: { kind: 'ok', desk: { id: 'new-id', desk_number: 'A-07', is_active: true } },
    });

    const result = await service(repository).createDesk('A-07');

    expect(result).toEqual({
      kind: 'ok',
      desk: { id: 'new-id', deskNumber: 'A-07', isActive: true, bookedAhead: 0 },
    });
  });

  it('passes the desk number through to the repository unchanged (US-017/AC-03 — normalisation is the caller\'s)', async () => {
    const { repository, insertCalls } = stubRepository({ rows: [] });

    await service(repository).createDesk('A-07');

    expect(insertCalls).toEqual(['A-07']);
  });

  it('reports a duplicate outcome without mapping a desk (US-017/AC-04)', async () => {
    const { repository } = stubRepository({ rows: [], insertResult: { kind: 'duplicate' } });

    const result = await service(repository).createDesk('A-01');

    expect(result).toEqual({ kind: 'duplicate' });
  });
});

describe('createDesksService.renameDesk (US-018/AC-01, AC-02, AC-03, AC-05, AC-07)', () => {
  it('maps a successful rename to a desk WITHOUT bookedAhead (US-018/AC-01)', async () => {
    const { repository } = stubRepository({
      rows: [],
      updateResult: { kind: 'ok', desk: { id: 'a', desk_number: 'B-05', is_active: true } },
    });

    const result = await service(repository).renameDesk('a', 'B-05');

    expect(result).toEqual({ kind: 'ok', desk: { id: 'a', deskNumber: 'B-05', isActive: true } });
    expect(result.kind === 'ok' && 'bookedAhead' in result.desk).toBe(false);
  });

  it('passes the desk number through to the repository unchanged, and the injected clock as updatedAt (US-018/AC-02)', async () => {
    const { repository, updateCalls } = stubRepository({ rows: [] });

    await service(repository).renameDesk('a', 'B-05');

    expect(updateCalls).toEqual([{ id: 'a', deskNumber: 'B-05', updatedAt: new Date(NOW_MS) }]);
  });

  it('renames a desk with upcoming bookings with NO call to listUpcomingConfirmedDeskIds — nothing gates it (US-018/AC-03)', async () => {
    const { repository, upcomingCallCount } = stubRepository({ rows: [] });

    const result = await service(repository).renameDesk('a', 'B-05');

    expect(result.kind).toBe('ok');
    expect(upcomingCallCount()).toBe(0);
  });

  it('reports a duplicate outcome without mapping a desk (US-018/AC-02)', async () => {
    const { repository } = stubRepository({ rows: [], updateResult: { kind: 'duplicate' } });

    const result = await service(repository).renameDesk('a', 'A-01');

    expect(result).toEqual({ kind: 'duplicate' });
  });

  it('reports a not_found outcome without mapping a desk', async () => {
    const { repository } = stubRepository({ rows: [], updateResult: { kind: 'not_found' } });

    const result = await service(repository).renameDesk('missing', 'A-01');

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('renaming to the current value succeeds — it is not treated as a duplicate (US-018/AC-07)', async () => {
    const { repository } = stubRepository({
      rows: [],
      updateResult: { kind: 'ok', desk: { id: 'a', desk_number: 'A-01', is_active: true } },
    });

    const result = await service(repository).renameDesk('a', 'A-01');

    expect(result.kind).toBe('ok');
  });

  it('produces exactly one repository interaction and nothing else — the structural half of AC-05, nothing here can send a notification (US-018/AC-05)', async () => {
    const { repository, insertCalls, updateCalls, upcomingCallCount } = stubRepository({ rows: [] });

    await service(repository).renameDesk('a', 'B-05');

    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(0);
    expect(upcomingCallCount()).toBe(0);
  });
});
