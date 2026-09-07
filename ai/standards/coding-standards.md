# Coding standards

Applies to all code in `apps/` and `libs/`. Personas load this when implementing or reviewing code (Gate 2).

## General (all TypeScript)

- TypeScript strict; no `any` unless justified with a comment
- Small, single-purpose functions; SOLID, DRY, KISS, but no speculative abstraction
- Names say what, comments say why; comment density matches surrounding code
- No dead code, no commented-out code in commits
- Errors: throw typed errors; never swallow exceptions silently
- All tasks run through Nx: `npm run nx -- <target> <project>` (never raw tsc/ng/webpack)

## NestJS (`apps/api`)

- One module per domain (`modules/<domain>/`): controller, service, DTOs, entities co-located
- DTOs: TS classes + class-validator decorators. **No `@ApiProperty`** — the swagger CLI plugin introspects types/JSDoc
- Services own logic; controllers stay thin (validate → delegate → shape response)
- Config through `@nestjs/config` with env validation, never `process.env` in feature code
- DB via TypeORM repositories; schema changes only through migrations
- Logging via nestjs-pino (structured); no `console.log`

## Angular (`apps/ui`)

- Standalone components, signals for state, lazy-loaded feature routes (existing pattern)
- Features in `features/<name>/`; shared UI in `shared/`; cross-cutting services in `core/`
- API access only through the generated client (`libs/api/client`) or a facade service — no raw `HttpClient` in components
- SCSS with shared design tokens (global styles in `apps/ui/src/styles.scss`), no magic values
- Templates: keep logic out; computed signals over template expressions

## graph-engine (`libs/graph-engine`)

- Pure TypeScript: **zero** framework/IO dependencies (enforced by review)
- Deterministic functions; algorithm complexity documented in JSDoc
- Every algorithm ships with unit tests incl. edge cases (empty graph, unreachable node, ties)
