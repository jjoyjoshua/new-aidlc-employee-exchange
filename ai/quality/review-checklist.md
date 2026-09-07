# Review checklist

Used by DEV for self-review and by the Architect persona for advisory review, both inside Gate 2 (Delivery). Order matters — stop-the-line items first.

## 1. Correctness

- [ ] Each AC re-derived from the diff (not trusted from the description)
- [ ] Edge cases from the story handled
- [ ] Error paths return the standard error shape; nothing swallowed

## 2. Architecture

- [ ] Files where the story's design note/ADR placed them; Nx project boundaries respected
- [ ] No new dependency without ADR + human approval
- [ ] graph-engine stays pure (no framework/IO imports)

## 3. Security

- [ ] All new input validated at the boundary; no trust in client data
- [ ] No secrets, no leaked internals in errors/logs
- [ ] AuthZ on every new protected route

## 4. Performance

- [ ] No N+1 queries, unbounded result sets, or accidental O(n²) on hot paths
- [ ] NFR budgets respected where defined

## 5. Accessibility (UI diffs)

- [ ] Keyboard reachable, focus visible, labels/ARIA present, contrast at least 4.5:1 (WCAG AA; `aidlc-check` warns on failing token pairs)

## 6. Framework practice

- [ ] Angular: standalone + signals idioms, facade for API access, no logic in templates
- [ ] NestJS: thin controller, DTO validation, config service, structured logging

## 7. Clean code

- [ ] Names truthful; functions single-purpose; no dead/commented code
- [ ] DRY without over-abstraction; matches surrounding style

## 8. Tests & docs

- [ ] Tests assert behavior, are deterministic, cover negative + boundary
- [ ] Proven at the lowest sufficient level (unit < integration < API < e2e) — a criterion pushed to a browser test that a unit test could prove is a finding
- [ ] Browser tests: generated from a plan that was reviewed first, locators verified against the real DOM, no retry or timeout hiding a real failure
- [ ] Docs updated (JSDoc / README / architecture)

**Ratings:** `blocker` (correctness/security) · `major` (arch/perf/coverage) · `minor` (practice) · `nit` (style).
