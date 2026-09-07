# Task classification — tier the work before you touch it

**What this is:** the first thing a delivery persona does with an incoming task, before loading the context chain, before writing code. It answers one question: *how much machinery does this task actually need?*

**Honest classification:** the tiering itself is guidance. Nothing verifies which tier a persona picked. What the tier _routes to_ is enforced: `aidlc-check`, required statuses, and branch protection don't care how a task was labelled. The value here is not ceremony; it is (a) not running the full Gate 1→2 path for a docs edit, and (b) not sliding a schema change through as a "quick fix".

Read [`context-loading.md`](context-loading.md) next. The tier sets the context budget.

---

## Step 1 — Parse the task

Extract, using `<unknown>` where the task doesn't say:

| Field           | Examples                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| **Intent**      | question · explain · docs · bugfix · implement · review · refactor             |
| **Scope**       | single file · one module · one story · one feature · cross-cutting             |
| **Contracts**   | none · internal function · public API request/response · persisted schema · auth |
| **Story state** | none · draft story · approved story (`US-###`, Gate 1 baseline) · in-flight PR |
| **Risk flags**  | schema migration · secrets/env · new dependency · external integration          |

If a `US-###` or `REQ-###` appears, resolve it against `knowledge/traceability/manifest.json` before tiering.

---

## Step 2 — Tier by surface (highest surface wins)

Do **not** add up points, and do **not** tier by diff size. A one-line change to a required request field outranks a 300-line docs edit. Find the **riskiest architectural surface** the task touches; that surface sets the tier. Walk Complex → Medium → Simple and stop at the first match.

The five surfaces below are stack-neutral on purpose. A product is rarely only a backend. Each names the boundary in the abstract, then what it looks like in the kinds of code most projects hold.

### Complex — crosses a contract, persistence, trust, dependency, or operational boundary (any one)

**1. Contract** — something outside this change can break on it

- Backend: a new endpoint or a new **write** operation; a new or changed **required** request field; a changed response shape
- UI: the public props/inputs or events of a **shared** component; a new route; a new global/shared state slice; a change to design tokens
- Scripts & jobs: the CLI arguments, input file format, or output/exit-code contract another system consumes

**2. Persistence** — the shape or lifetime of stored data changes

- A new or changed entity, table, column, or index; any migration
- A destructive or bulk data operation (backfill, purge, re-index), whatever runs it
- A new or changed cache key shape, or persisted client-side state

**3. Trust** — auth, authz, session, secrets, or the blast radius of running something

- Token verification, role/permission checks, credential or PII handling
- UI: a route guard, permission-gated rendering, or anything that renders unsanitized input
- Scripts & jobs: a script that runs against production data or holds a production credential

**4. Dependency & integration**

- A **new dependency**, or a **major** version bump of an existing one
- A new **external integration** — third-party API, storage, mail, queue, or SDK

**5. Operational surface**

- A new scheduled job, background worker, realtime endpoint, or file-upload target
- A newly required env/config value
- New or changed cross-cutting middleware, interceptor, or global error handling
- A change to a job's **schedule, retry, or idempotency** behavior

**Plus, at any tier:** production code requested with **no approved story** (Gate 1 not passed) is Complex.

### Medium — behavior inside an existing contract

No new contract, no schema change, no trust surface.

- Bugfix inside an existing module, service, component, or script
- Add or change an **optional** request field where the persisted column already exists
- A new **read-only** endpoint reusing an existing model and service
- Extend an existing service, repository, or helper
- UI: a change inside one component that keeps its props and events; styling that uses existing tokens; a new component private to one feature
- Scripts & jobs: a change to a job's internals with the same schedule, inputs, outputs, and blast radius
- Implement a slice of an **already-approved** story
- Query rewrite with no migration and no new raw-SQL surface
- **Patch or minor** version bump of an existing dependency

### Simple — no behavior change; leaf artifacts only

- Question · explain · read-only review of a diff or PR
- Docs, comments, or markdown with no contract change
- A user-facing string or constant edit with no contract impact

**Boundary rule:** a task that looks Medium but touches *any* Complex surface is **Complex**. When genuinely unsure which side of a boundary a change sits on, take the higher tier and say so (`Confidence: Medium` or `Low`).

**Carve-out precedence:** when a task matches a Complex catch-all *and* a specific Medium bullet (an optional field on an existing write endpoint; a read-only GET reusing an existing model), the Medium bullet wins. It exists to stop well-scoped work being over-tiered. The boundary rule still governs everything the carve-outs don't name.

### Project extensions — `ai/standards/task-surfaces.md`

The five surfaces above are framework-owned and hash-locked: every AI-DLC project tiers by the same boundaries, so the workflow reads the same wherever you work. What a boundary is *called in this codebase* is not something the framework can know. That is the project's to write.

**Read [`ai/standards/task-surfaces.md`](../standards/task-surfaces.md) after this file, and apply both.** It is project-owned (excluded from `ai/framework-lock.json`) and the team edits it freely, naming their real files, modules, protected paths, and the surfaces their stack has that this list doesn't.

Two rules keep the extension honest:

- A project may **add** surfaces at any tier, and may add **named** Medium carve-outs for well-scoped work its stack over-tiers.
- A project may **not remove or demote** a framework surface. The lock makes this structural rather than a promise. A project cannot edit the list above, only extend it. A team that believes a framework surface is wrong opens a `change-request` issue upstream.

If the file is absent, classify on the framework surfaces alone and say so in the block (`Signals:` names the framework surface). Its absence is not a reason to stall.

### Hard overrides (force the tier regardless of surface)

| Condition                                                        | Force                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| The human says "question only" / "don't change code"             | **Simple**                                                                     |
| Production code requested before an approved story exists        | **Complex + STOP** — route to `/ba`; a story and Gate 1 approval come first    |
| Schema migration, secrets/env change, or a new dependency needed | **Complex + STOP-and-ask** — surface the need to the human; never decide it alone |
| Approved story, human asks to implement its listed scope only    | **Medium** (not Complex) — verify the story is merged/approved before applying |

A forced **Complex** is never silently downgraded because the human called it a quick fix. Say the surface out loud and let them decide.

The no-story override is about **product** code: it exists so a feature can't skip Gate 1. A repository with no product scope — tooling, infrastructure, the framework's own repo — has no Gate 1 to pass, so there the human's request is the authority. Still tier it, still present the block; just don't route to `/ba` for a story that was never going to exist.

---

## Step 3 — Confirm the surface before locking the tier

The Step 2 tier is **provisional**: it came from the task's words, not the code. List every **load-bearing fact** the tier and the plan rest on, and resolve each one. Nothing is assumed.

| Fact type                        | Examples                                                                             | Resolve by                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Codebase fact** (checkable)    | Does the column / route / service / type already exist? What's the existing pattern? | A **targeted** grep or read — one entity, not a full context load. Cite `file:line`. Never ask what you can check. |
| **Decision or intent** (not checkable) | Nullable? Which role may call it? Cascade on delete? A business rule?           | **Ask the human and wait.** Never pick a default on a decision that isn't yours.                                  |

If a check changes the surface — the column turns out not to exist, so a migration is needed — **re-tier up** and go back to Step 2.

A fact that is neither **verified** (with `file:line`) nor **asked** blocks Step 4. Writing "verified: none" while a real fact sits unchecked is the failure this step exists to prevent.

---

## Step 4 — Present the tier, then stop

Run Steps 1–3 internally. Then, **before loading the full context chain, creating files, or editing code**, print this block and stop for the human.

**Exception — no gate needed:** question · explain · read-only review. Nothing changes, so answer and stop.

```
TASK CLASSIFICATION
───────────────────
Tier:            Simple | Medium | Complex
Confidence:      High | Medium | Low
Task:            <one sentence>
Signals:         <the surface(s) that set the tier>
Story:           US-### (approved | draft) | none
Design needed:   ADR-### | design note | none
Context budget:  Minimal | Standard | Full   (see context-loading.md)
Next action:     <first concrete step>

PLANNED CHANGES
- Files to create / modify: <paths confirmed by reading>
- Approach: <2–4 bullets — the concrete change intended>
- Verified: <each load-bearing fact checked in Step 3, with file:line>
- Open questions: <what could NOT be verified by reading — never a guess>
```

At **Medium and Complex** tier the plan is a **file**, not a chat block: write the spec package into `inception/specs/US-###-<slug>/` first (Step 5), then let `PLANNED CHANGES` point at `implementation-plan.md` rather than restate it. The human reads the file; the block tells them where it is.

If **Open questions** is non-empty, ask them and stop. A plan built on unanswered questions is a guess with formatting. Only when every load-bearing fact is verified or answered do you write: **"Reply `go` to proceed, or tell me what to change."**

If **Confidence: Low**, ask one multiple-choice question *before* presenting the plan. You can't plan changes for a tier you haven't confirmed:

- A) Question or docs only (Simple)
- B) A narrow fix or an approved story slice (Medium)
- C) New capability, or a contract / schema / auth change (Complex)

---

## Step 5 — What each tier costs

The tier decides which existing framework machinery is mandatory, and how much of the spec package the work carries. It introduces no new gate. Discovery, Delivery and Release are unchanged ([`ai/AI-DLC.md`](../AI-DLC.md)).

| Tier        | Story                                                | Spec package                                                                                                                                                                                        | Architect                                                          | QA                                        | PR                                                                 |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| **Simple**  | none                                                 | none — one row in `inception/specs/_change-log.md`                                                                                                                                                    | none                                                               | none                                      | none, or a `docs/` branch PR                                        |
| **Medium**  | approved `US-###`                                    | update the existing package: `traceability.md` + `change-log.md`; add `implementation-plan.md` when the change spans more than one file                                                                | advisory review of the diff                                        | tests derived from the AC before the diff | one story PR — `feat/US-###-<slug>`                                 |
| **Complex** | approved `US-###`; split it if one PR can't carry it | full package in `inception/specs/US-###-<slug>/` — `spec.md`, `implementation-plan.md`, `impact-analysis.md`, `decisions.md`, `traceability.md`, `change-log.md`                                       | **design note before code**; ADR-### when there's a real trade-off | same, plus negative and boundary cases    | one story PR; Architect findings resolved or rebutted before merge  |

The package is what the human reads at **Gate D1** ([`ai/gates/delivery.md`](../gates/delivery.md)). It introduces no third gate: D1 _is_ the `go` that Step 4 below already asks for, now backed by a written plan instead of a chat block that vanishes with the session. `aidlc-check` check 16 validates any package that exists; whether one is required at all is this table's job, and the human's at D1.

Complex is the only tier that blocks on design: implementing a contract, schema, or trust-boundary change without a written design note is how a story PR becomes an architecture argument in a review thread.

---

## Step 6 — Re-tier on scope creep

Re-run this when:

- The human expands scope ("also add an endpoint", "this needs a new column")
- Implementation reveals a schema change, an auth surface, or a missing story
- A Simple task turns out to touch a contract

On an upgrade (Simple → Medium, Medium → Complex), say so explicitly, then **stop and re-present** the block from Step 4 before continuing. Do not carry on under an undersized context set or an un-approved scope.

---

## Cheat sheet

| Simple                    | Medium                                    | Complex                                      |
| ------------------------- | ----------------------------------------- | -------------------------------------------- |
| How does X work?          | Fix a bug in an existing service          | New write endpoint or vertical               |
| Docs or comment edit      | Add an optional field (column exists)     | New or changed entity / column / migration   |
| Constant or string edit   | New read-only endpoint reusing a model    | Auth, permissions, or secrets change         |
| Read-only PR review       | Implement an approved story slice         | New external integration or dependency       |
| Explain a diff            | Dependency patch/minor bump               | Any production code with no approved story   |
