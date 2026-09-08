# Input — 2026-09-08 — accessibility requirement (NFR-008)

**Source:** Joy Joshua (PO/BA), in session with `/ba`.
**Vehicle:** GitHub issue [#7](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/7), labelled `change-request` + `accessibility`.

## How this arose

Not from a customer request. It surfaced while correcting a traceability error
introduced by PR #6, which had linked six screens to NFR-003 on the basis that
their specs cited "NFR-003". Those specs were citing **"NFR-003 of the design
standard"** — a different document, for the non-colour-signalling rule — while
BRD-001's NFR-003 is *"Sign-in credentials are protected in transit (HTTPS)"*.

Chasing the citation established that **no design standard document exists in
this repository.** Seven of the ten screen specs cite one by name; all ten apply
its rule (each carries a `Non-colour signalling` section). So the accessibility
commitment the entire approved design rests on traced to nothing approved.

## The instruction, verbatim

> For Issue 7, let's stick with the rules present in the plugin

Asked to clarify whether that meant codifying the plugin's wording as a BRD
requirement, or leaving the rule as a framework standard with the specs pointing
at it, the PO chose:

> Plugin wording as a BRD requirement

## What "the rules present in the plugin" are, verbatim

Four files in the AI-DLC framework (v0.5.0) state the rule. None of them is a
BRD, and none is reachable from a requirement:

| File | Text |
| --- | --- |
| `ai/roles/ux.md` | "**Colour is never the only signal** (NFR-003): feasible/infeasible and every status pair with an icon or a label. Keyboard operability and visible focus are specified per screen, not assumed." |
| `ai/templates/screen-spec.md` | "**Non-colour signalling:** every status carries an icon or label, never colour alone (NFR-003)" |
| `ai/quality/review-checklist.md` | "Keyboard reachable, focus visible, labels/ARIA present, contrast at least 4.5:1 (WCAG AA; `aidlc-check` …)" |
| `seed/design-README.md` | "Text-on-surface token pairs meet WCAG AA 4.5:1 (warning, both themes)" |

## Two things that could not be carried over, and why

1. **The number.** The plugin numbers this rule `NFR-003` throughout, because its
   own example project does. In BRD-001 that number is taken by the HTTPS
   requirement. `NFR-008` is the next free number. This is the root cause of the
   original mis-citation, and it is worth knowing that any future project seeded
   from this plugin will hit the same collision unless its NFR-003 happens to be
   accessibility.
2. **The 3:1 non-text contrast figure.** The plugin commits only to **4.5:1
   text-on-surface**, which is what `aidlc-check` enforces. Pass 2b additionally
   introduced `--c-border-control` at 3:1 to satisfy WCAG 1.4.11 for form-field
   boundaries. Sticking to the plugin's wording means that token is design going
   **beyond** the requirement rather than being required by it. Not a conflict,
   and not removed — but NFR-008 does not oblige it, and a future screen could
   drop it without failing anything.

## Evidence that the rule is load-bearing, not decorative

Measured during pass 2b, on the approved palette:

- Taken vs Available desk fills (SCR-003): **ΔE 9.5** normally, **ΔE 2.2** under
  deuteranopia simulation — indistinguishable. The icon carries the state.
- Clay "yours" vs blocked red was accepted at **ΔE 26.8** partly *because* the
  icon rule was assumed to hold.
- Available vs blocked fill: **ΔE 9.5** normally, **ΔE 2.2** colour-blind.

Without a requirement, none of this is testable at Gate 2: QA has nothing to
derive a test from, and a developer who drops an icon breaks nothing CI can see.

## Scope of the change

Records a rule the design already follows. **No screen, state, or flow changes.**
