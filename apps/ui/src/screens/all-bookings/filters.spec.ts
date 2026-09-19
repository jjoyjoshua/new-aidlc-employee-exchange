import { describe, expect, it } from 'vitest';
import { isFiltered, NO_FILTERS, parseFilters, toQueryString, type AllBookingsFilters } from './filters.js';

const VALID_DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('isFiltered (US-014/AC-05, AC-06)', () => {
  it('is false for NO_FILTERS', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });

  it.each<[string, AllBookingsFilters]>([
    ['from', { from: '2026-09-01' }],
    ['to', { to: '2026-09-30' }],
    ['status', { status: 'confirmed' }],
    ['deskId', { deskId: VALID_DESK_ID }],
  ])('is true when %s is set', (_name, filters) => {
    expect(isFiltered(filters)).toBe(true);
  });

  it('is the ST-04/ST-03 discriminator a component reads to pick its empty-state copy (US-014/AC-06)', () => {
    expect(isFiltered({ status: 'confirmed' })).toBe(true);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });
});

describe('parseFilters (US-014/AC-08)', () => {
  it('parses the screen query string on mount, the receiving half of US-014/AC-08', () => {
    expect(parseFilters(`?deskId=${VALID_DESK_ID}&status=confirmed`)).toEqual({
      deskId: VALID_DESK_ID,
      status: 'confirmed',
    });
  });

  it('returns NO_FILTERS for an empty query string', () => {
    expect(parseFilters('')).toEqual({});
  });

  it('parses a well-formed deskId + status query — the exact shape US-019 must construct', () => {
    expect(parseFilters(`?deskId=${VALID_DESK_ID}&status=confirmed`)).toEqual({
      deskId: VALID_DESK_ID,
      status: 'confirmed',
    });
  });

  it('parses from/to together', () => {
    expect(parseFilters('?from=2026-09-01&to=2026-09-30')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('round-trips toQueryString\'s own output', () => {
    const filters: AllBookingsFilters = { from: '2026-09-01', to: '2026-09-30', status: 'completed', deskId: VALID_DESK_ID };
    expect(parseFilters(toQueryString(filters, 1))).toEqual(filters);
  });

  it('drops a malformed date rather than throwing', () => {
    expect(parseFilters('?from=not-a-date')).toEqual({});
  });

  it('drops an unknown status word rather than throwing', () => {
    expect(parseFilters('?status=archived')).toEqual({});
  });

  it('drops a non-uuid deskId rather than throwing', () => {
    expect(parseFilters('?deskId=not-a-uuid')).toEqual({});
  });

  it('ignores page — paging is never read as a filter', () => {
    expect(parseFilters('?page=3&status=confirmed')).toEqual({ status: 'confirmed' });
  });
});

describe('toQueryString', () => {
  it('is empty for NO_FILTERS and page 1', () => {
    expect(toQueryString(NO_FILTERS, 1)).toBe('');
  });

  it('includes page only when greater than 1', () => {
    expect(toQueryString(NO_FILTERS, 2)).toBe('?page=2');
  });

  it('includes every set filter', () => {
    const qs = toQueryString({ from: '2026-09-01', to: '2026-09-30', status: 'confirmed', deskId: VALID_DESK_ID }, 1);
    const params = new URLSearchParams(qs);
    expect(params.get('from')).toBe('2026-09-01');
    expect(params.get('to')).toBe('2026-09-30');
    expect(params.get('status')).toBe('confirmed');
    expect(params.get('deskId')).toBe(VALID_DESK_ID);
  });
});
