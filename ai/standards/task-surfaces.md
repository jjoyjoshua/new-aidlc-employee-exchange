# Project task surfaces

Extends [`ai/context/task-classification.md`](../context/task-classification.md) with the surfaces **this codebase** has. The framework file names the five boundaries every AI-DLC project shares; this one names them in our files and adds what our stack has that the generic list doesn't.

**This file is project-owned**, not in `ai/framework-lock.json`, so the team edits it freely. Two rules: you may **add** surfaces and **named** Medium carve-outs; you may **not** remove or demote a framework surface (open a `change-request` issue upstream instead).

> **Seed — rewrite this.** The entries below describe the framework's own reference stack (Nx, NestJS, Angular). Replace them with yours on the first story; delete any section your project doesn't have.

## Protected paths — always Complex

Any change under these is Complex regardless of diff size:

- `libs/api/client/**` — generated from OpenAPI; never hand-edited
- `apps/api/src/**/migrations/**` — schema history
- `.github/workflows/**`, `ai/framework-lock.json` — gate machinery
- `inception/design/tokens.css` — the design system's single source
- `<e2e-root>/playwright.config.ts` — its `testDir` is the only record of where browser tests live
- `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `opencode.json` — which MCP servers every teammate's assistant loads

## Backend (`apps/api`)

**Complex** — a new controller route or a new `@Post/@Put/@Patch/@Delete`; a new or changed **required** DTO field; a new or changed TypeORM entity/column/migration; anything touching guards, strategies, or `@nestjs/config` validation; a new module registered in `AppModule`.

**Medium** — a change inside an existing service; a new optional DTO field where the column exists; a new `@Get` reusing an existing entity and repository; a repository query rewrite with no migration.

## UI (`apps/ui`)

**Complex** — the inputs/outputs of a component in `shared/`; a new lazy route; a new service in `core/`; a new signal store or a change to shared state shape; token changes in `styles.scss`.

**Medium** — a change inside one `features/<name>/` component that keeps its inputs and outputs; a new component private to one feature; styling that uses existing tokens.

**Also Complex regardless of location:** rendering unsanitized input, or bypassing the generated API client with a raw `HttpClient` call.

## Scripts & jobs

**Complex** — a new script under `tools/`; a change to a job's schedule, retry, or idempotency behavior; any script that reads or writes production data, holds a production credential, or performs a bulk/destructive operation (backfill, purge, re-index); a change to a script's CLI arguments or exit codes when something else calls it.

**Medium** — internals of an existing script with the same schedule, inputs, outputs, and blast radius.

## Medium carve-outs

Work our stack over-tiers. Each must be *named*. A general "use judgement" clause is not a carve-out:

- Adding a field to an existing DTO **and** its entity in the same PR, where the migration is generated (not hand-written) and the field is nullable — Medium, not Complex
- A new `@Get` lookup endpoint following the existing read-only pattern, reusing entity + repository + response DTO — Medium
- Nx generator output committed unmodified (a scaffolded module or component with no logic yet) — Medium

## Escalate, don't decide

Surfaces where the persona stops and asks the human even at Medium: adding a dependency, changing anything under `env/`, and any migration that is not additive.
