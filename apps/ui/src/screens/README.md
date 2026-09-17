# screens

One folder per approved screen spec, named after it: `scr-001-sign-in/`, `scr-002-book-a-desk/`,
and so on through SCR-010. The specs live in
[`inception/design/screens/`](../../../../inception/design/screens/) and enumerate every
`ST-##` state the screen must handle — those states are what the component tests assert.

A new screen folder that only composes existing shared components and tokens is Medium; a new
route is Complex (`ai/standards/task-surfaces.md`).
