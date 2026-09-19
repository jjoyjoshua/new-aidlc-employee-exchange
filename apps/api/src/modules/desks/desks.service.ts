/**
 * US-014's slice — `GET /api/admin/desks`. A pure mapping, no clock read (design note §3.3).
 */
import type { AdminDesk } from '@desk-booking/contracts';
import type { DesksRepository } from './desks.repository.js';

export interface DesksServiceDeps {
  desks: DesksRepository;
}

export function createDesksService({ desks }: DesksServiceDeps) {
  return {
    /** US-014/AC-03. Maps the repository's rows to the wire shape, preserving order. */
    async listAllDesks(): Promise<AdminDesk[]> {
      const rows = await desks.listAllDesks();
      return rows.map((row) => ({ id: row.id, deskNumber: row.desk_number, isActive: row.is_active }));
    },
  };
}

export type DesksService = ReturnType<typeof createDesksService>;
