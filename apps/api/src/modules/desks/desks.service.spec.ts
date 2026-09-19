import { describe, expect, it } from 'vitest';
import { createDesksService } from './desks.service.js';
import type { DesksRepository } from './desks.repository.js';

function stubRepository(rows: Array<{ id: string; desk_number: string; is_active: boolean }>): DesksRepository {
  return { async listAllDesks() { return rows; } };
}

describe('createDesksService.listAllDesks (US-014/AC-03)', () => {
  it('maps a mixed active/inactive fixture to adminDeskSchema rows in the same order', async () => {
    const service = createDesksService({
      desks: stubRepository([
        { id: 'a', desk_number: 'A-01', is_active: true },
        { id: 'b', desk_number: 'A-02', is_active: false },
      ]),
    });

    const result = await service.listAllDesks();

    expect(result).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true },
      { id: 'b', deskNumber: 'A-02', isActive: false },
    ]);
  });

  it('returns an empty list rather than throwing when the repository has none', async () => {
    const service = createDesksService({ desks: stubRepository([]) });
    expect(await service.listAllDesks()).toEqual([]);
  });
});
