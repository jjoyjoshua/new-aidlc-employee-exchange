# US-011 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered. A Medium-tier change to an existing package appends a row here.

| Date       | Change                                 | Why                    | Requirements affected        |
| ---------- | --------------------------------------- | ----------------------- | ----------------------------- |
| 2026-09-19 | Added `apps/ui/src/screens/my-bookings/use-cancel-dialog.ts` (+ `.spec.ts`), not named in `implementation-plan.md`'s Step 10 file list at Gate D1 approval | The cleanest place to hold the cancel dialog's open/busy/outcome state machine and its AC-07 double-submit guard, mirroring `book-a-desk/use-book-desk.ts`'s existing pattern, rather than inlining that state directly into `MyBookings.tsx` | No FR or AC changed — additive implementation detail only |
