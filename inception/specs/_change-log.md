# Spec change log — Simple tier

Changes too small to own a spec package: a docs edit, a user-facing string, a constant. One row each. Anything with a spec folder logs in that folder's own `change-log.md` instead.

| Date | Change | Why | Story or issue |
| ---- | ------ | --- | -------------- |
| 2026-09-17 | Rewrote `ai/standards/` (coding, api, security, testing, task-surfaces) for React + Express + Supabase; added `ai/project-context.md`; scaffolded `apps/api`, `apps/ui`, `supabase/migrations`, npm workspaces, ESLint import boundaries, product CI | `ai/standards/` described NestJS/Angular/TypeORM/Nx, so every Gate 2 review would have cited rules that do not apply to this system | `inception/architecture/app-architecture.md` §7 items 1–2 |
| 2026-09-19 | Corrected `inception/specs/index.md` Status column for US-001–US-006 and US-008 from `planned`/`approved` to `implemented` | Each story's PR had already merged into `main` (PRs #27, #28, #29, #30, #31, #35, #38), but the index row was never bumped, so it read as unbuilt work that was actually shipped | US-001, US-002, US-003, US-004, US-005, US-006, US-008 |
