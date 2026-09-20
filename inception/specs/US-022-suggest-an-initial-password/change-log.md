# US-022 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered.

| Date       | Change                                 | Why                    | Requirements affected        |
| ---------- | --------------------------------------- | ------------------------ | ------------------------------- |
| 2026-09-20 | Created the package; added `US-022/AC-0#` citations to the tests already proving this behavior under US-021, plus four new assertions (checklist-all-met after Suggest, re-suggest differs in the UI, post-suggest editability, submission-payload equivalence) — no production code changed | The generator and the Suggest button were built ahead of schedule while delivering US-021 (its own AC-04 anticipates "whether typed or generated (US-022)"), so the behavior existed before this story's own traceability did; `knowledge/traceability/manifest.json`'s `US-022` entry had all six ACs listed with `tests: []` | AC-01 through AC-06, all covered |
