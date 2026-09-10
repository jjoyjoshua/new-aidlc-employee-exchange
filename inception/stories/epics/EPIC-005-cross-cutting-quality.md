# EPIC-005 — Cross-cutting quality

> Approval = Gate 1 review of this file's PR, alongside the stories it groups.

|               |                                                              |
| ------------- | ------------------------------------------------------------ |
| **Traces to** | NFR-002, NFR-004, NFR-005, NFR-007, NFR-008                  |
| **Stories**   | US-033, US-034                                               |
| **Screens**   | all ten (US-033)                                             |
| **Priority**  | Must                                                         |

## Goal

Two commitments that belong to no single screen or feature, and would therefore be nobody's job. Both are stated as requirements, so both need somewhere to be proven.

## Stories

| Story  | Title                                                                       | Priority | Traces to                 |
| ------ | --------------------------------------------------------------------------- | -------- | ------------------------- |
| US-033 | Every screen holds up at three widths and never signals by colour alone     | Must     | NFR-002, NFR-004, NFR-008 |
| US-034 | Transactional email is configured, not hard-coded, and failures are logged  | Must     | NFR-005, NFR-007          |

## Why these are stories and not a checklist

`aidlc-check` warns on any requirement no story covers. NFR-004 and NFR-008 are cited by all ten approved screens; NFR-005 and NFR-007 are cited by none, because email has no screen. Left as a checklist, they would be verified at whatever moment somebody happened to remember them. As stories they are scheduled, estimated, and tested.

US-033 is deliberately **verification, not build** — each screen's own story builds its states, and this one proves the three widths and the non-colour rule across all ten in a single sweep. That sweep is also the only thing that catches an inconsistency *between* screens. It therefore lands last in the release, and every screen-bearing story is a dependency.
