# US-### — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-###-<slug>.md` |
| **Updated** | YYYY-MM-DD                                       |

## Requirement to code

| Req    | File            | Symbol / location | Proven by           | Status      |
| ------ | --------------- | ----------------- | ------------------- | ----------- |
| FR-01  | `path/to/f.ts`  | `functionName`    | `path/to/f.spec.ts` | implemented |
| NFR-01 | `path/to/c.ts`  | `TIMEOUT_MS`      | TC-01               | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                            | Location            |
| --------------------------------- | ------------------- |
| `<name a reviewer will grep for>` | `path/to/file.ts`   |
