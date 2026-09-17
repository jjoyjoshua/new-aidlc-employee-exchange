# domain — the rules, without the plumbing

Pure functions. No database, no network, no `Date.now()`, no `process.env`. Every input
arrives as an argument, **including today's date**.

That constraint is the reason most acceptance criteria in this project are provable as plain
unit tests with no database and no clock mocking. The rules that live here:

- Is this date bookable? (REQ-006's 30-day window, BR-001.3's weekday rule, in office time)
- Is this desk number valid, and what is its normalized form? (BR-001.4, BR-001.8)
- Is this booking cancellable by this person right now? (BR-001.6)
- Does this password satisfy V-12, and V-18 for a generated one? (REQ-033)
- What should this notification say? (BR-001.20)
- Which status does this booking read as today? (BR-001.5, REQ-028)

## Conventions

- One rule per file, named after the rule: `is-date-bookable.ts`, `normalize-desk-number.ts`
- The file cites the requirement it implements in a comment (`BR-001.3`, `REQ-006`, `V-12`)
- Its spec sits beside it and cites the acceptance criteria it proves (`US-005/AC-04`)

If a rule seems to need a database, a clock or configuration, the plumbing belongs in the
calling service — move the plumbing, not the rule. `eslint.config.mjs` enforces the boundary,
including `Date.now` and `process`.
