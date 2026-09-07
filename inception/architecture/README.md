# Architecture

The Architect's **Gate 1 deliverable**: the shape the whole build shares, written
once requirements are frozen and before any code exists. Two documents:

| File                 | Contains                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `db-design.md`       | Entities, their relationships and cardinality, keys, the shape the data takes, and why        |
| `app-architecture.md` | Services/modules, their boundaries, how they talk, where shared logic sits, and why           |

## What goes in `db-design.md`

1. **Entities** — one section each: what it represents in the business, its fields
   with types and nullability, and which `REQ-###` put it there
2. **Relationships** — cardinality and direction, stated as sentences a
   non-engineer can check ("one shipment has many legs; a leg belongs to exactly
   one shipment")
3. **Keys and constraints** — primary keys, uniqueness, and the business rule each
   one enforces. A constraint with no rule behind it is a guess
4. **Lifecycle** — what is created, updated, soft-deleted, or never deleted, and
   what that means for history and audit
5. **Open questions** — anything the requirements do not settle. Do **not** invent
   a rule; an unanswered question here is a BA question, and saying so is the job

## What goes in `app-architecture.md`

1. **Modules** — one per business capability, what each owns
2. **Boundaries** — what may import what, and which rules are enforced in tooling
   rather than by agreement
3. **Flows** — the two or three paths that matter, request to persistence
4. **Cross-cutting** — auth, validation, error shape, logging, configuration
5. **Open questions** — same rule as above

## Three rules

- **It gates nothing.** Stories and screens do not wait on it; `aidlc-check` never
  fails for its absence. It runs in parallel and informs the build
- **It needs only approved requirements.** Every entity traces to a `REQ-###`
- **It is a design, not a second copy of the code.** Once migrations and the
  OpenAPI document exist, **they** are the source of truth and this becomes
  history — not a document to keep in sync

Written by the Architect persona (`/architect`), landed through its own reviewed
PR. Tailor this README to your project; it is yours from here.
