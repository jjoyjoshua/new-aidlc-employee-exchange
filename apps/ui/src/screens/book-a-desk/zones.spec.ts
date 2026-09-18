import { describe, expect, it } from 'vitest';
import { groupByZone } from './zones.js';
import type { DeskAvailability } from '@desk-booking/contracts';

const desk = (deskNumber: string, status: 'available' | 'taken' = 'available'): DeskAvailability => ({
  id: deskNumber,
  deskNumber,
  status,
});

describe('groupByZone (US-006/AC-05)', () => {
  it('groups a shuffled array into zones, in zone-letter order, sorted within each zone', () => {
    // Deliberately shuffled and NOT computed from the function under test — expectations are
    // written as literals, the established convention for boundary tests in this codebase.
    const shuffled = [desk('B-01'), desk('A-10'), desk('C-01'), desk('A-02'), desk('A-01'), desk('B-02')];

    const zones = groupByZone(shuffled);

    expect(zones).toEqual([
      { letter: 'A', desks: [desk('A-01'), desk('A-02'), desk('A-10')] },
      { letter: 'B', desks: [desk('B-01'), desk('B-02')] },
      { letter: 'C', desks: [desk('C-01')] },
    ]);
  });

  it('sorts A-02 before A-10 — the fixed-width property the desk_number format guarantees', () => {
    const zones = groupByZone([desk('A-10'), desk('A-02')]);

    expect(zones).toEqual([{ letter: 'A', desks: [desk('A-02'), desk('A-10')] }]);
  });

  it('returns an empty array for no desks', () => {
    expect(groupByZone([])).toEqual([]);
  });

  it('is total for a single zone', () => {
    const zones = groupByZone([desk('A-01', 'taken'), desk('A-02')]);

    expect(zones).toEqual([{ letter: 'A', desks: [desk('A-01', 'taken'), desk('A-02')] }]);
  });
});
