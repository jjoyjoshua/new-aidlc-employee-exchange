# ADR-014 — A generated credential's alphabet is chosen by how it is delivered, not by one global rule

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | accepted                                                                 |
| **Date**    | 2026-09-20                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-022, US-027; REQ-021, REQ-033, BR-001.12, V-12, V-18, RISK-005        |

## Context

This system generates a password in two places, for two different acts.

**The create path (US-022, REQ-033).** `apps/ui/src/lib/generate-password.ts` runs in the browser
and fills a field an administrator can see, edit and retype before submitting. It excludes
`1`, `l`, `I`, `0` and `O`, because **V-18 requires it** (`BRD-001:281`). Its docblock (`:10-12`)
gives the reasoning: "the value is dictated or read from a screen, never emailed, so a glyph a
listener cannot tell apart from another turns one account creation into an avoidable reset."

**The reset path (US-027, REQ-021).** The password is generated **server-side** — the story's own
API-impacts section requires it — and returned once, in one response, shown in SCR-008 ST-11's
credential field and never again. It traces to V-12 and **not** to V-18.

V-18's scope is narrower than it first reads. Its text says "a generated **initial** password" and
it traces to REQ-033, which opens "When creating a user…" (`BRD-001:84`). It does not reach
REQ-021. US-027's own edge-case list spotted this and refused to close it silently:

> "Whether it should also exclude the ambiguous characters V-18 requires on the create path
> (US-022) is not stated — this password is read aloud in exactly the same way. The walkthrough
> asks; do not silently apply V-18 here."

So the question was put to the decider, and the answer came back **no exclusion on the reset path**,
on evidence from the approved design. SCR-008's own handoff record (`SCR-008-people.md:281-285`):

> "ST-11 was drawn as this handoff asked. The credential sits in `mono/regular` at `--t-mono`
> (20px — already the largest size in the ramp) and the sample is deliberately `q4Lm1I0oTz8v`: it
> carries `1`, `I`, `0` and `o`, the four glyphs this state exists to disambiguate."

That is a design that chose typography over exclusion, deliberately, and built a component
(`Credential field`, used on this screen only, `SCR-008-people.md:219`) to carry it.

**Three things make this worth a decision record rather than a line in one story's
`decisions.md`.**

1. **The two generators will sit side by side with opposite rules, permanently.** US-027's D-04
   already refuses to unify them, partly *because* of this divergence. The two decisions lock each
   other in place, and neither file explains the other.
2. **A shipped docblock already contradicts it, and cites the wrong screen.**
   `generate-password.ts:10-12` attributes its exclusion set to "SCR-008 ST-10's own reasoning,
   reused here verbatim" — SCR-008 is the **reset** screen, and ST-10 (`SCR-008-people.md:164`)
   contains no glyph reasoning at all. The actual source is decision B2 in
   `2026-09-10-uncodified-design-decisions.md`. Left alone, a future author reads a create-path
   generator justifying itself by citing the very screen that declines the rule, and concludes one
   of them is a bug.
3. **A third generator is already foreseeable.** BRD-001 §10 defers self-service password reset to a
   later release. When it lands, its author will face this question a third time, and ADR-010's own
   standing advice — minted at the *second* occurrence, on US-016's "write it now rather than at
   the third one" — applies here unchanged.

## Decision

**A generated credential's alphabet is a function of how that credential is delivered to a human,
and each generation site declares its own, with the delivery it serves stated in the same
docblock.** There is no project-wide exclusion set, and no shared, parameterised generator.

Concretely:

1. **Every generator satisfies V-12**, and proves it by self-checking against
   `evaluatePasswordPolicy` (`libs/contracts/src/password.ts:25-33`) before returning — never by a
   second regex. That part is not negotiable and is not what varies.
2. **The create path keeps V-18's exclusions** (`1`, `l`, `I`, `0`, `O`). V-18 is an approved
   validation rule and this ADR does not touch it. Changing it is a Gate 1 `change-request`.
3. **The reset path excludes no alphanumeric glyph.** It is delivered through one purpose-built
   component — SCR-008's `Credential field`, monospace at `--t-mono`, the largest size in the ramp,
   on a screen whose whole job is to make the value readable aloud once. Legibility is carried by
   typography there, which the create path's editable form field does not provide.
4. **Every generator excludes characters that break *dictation or transport*, whatever its glyph
   policy.** No space, quote, backtick, backslash or non-ASCII character. `evaluatePasswordPolicy`
   defines "special" as "any character outside `A-Z`/`a-z`/`0-9`, deliberately open"
   (`password.ts:28-31`) and will not stop any of them. The shared special set is
   `!@#$%^&*-_=+?`. This clause is **not** a legibility rule and is not subject to (3): no font
   disambiguates a trailing space.
5. **Each generator's docblock states the delivery it serves, and points at the other one.** The
   reader of either file learns the divergence is designed, from that file, without finding this
   ADR first.
6. **A test asserts alphabet membership**, not merely policy compliance, across a few hundred
   samples — so a future widening of the alphabet fails a test rather than shipping.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Apply V-18's exclusions to the reset path too** | One rule, one set, no divergence to explain; nobody ever mishears a reset password read aloud | Contradicts the approved ST-11 design, whose sample password "deliberately" carries all four glyphs and which built a component to make them legible (`SCR-008-people.md:281-285`); reduces the alphabet on the path with the **shortest** exposure and the least chance to correct a mistype; silently widens an approved validation rule beyond its own stated scope ("initial", REQ-033) | **The decider's call, on the design's own evidence.** Also the option the story's edge-case list explicitly forbade taking silently |
| **One shared generator parameterised by `excludeAmbiguous: boolean`** | No duplication; one alphabet definition; one self-check | The two sites already differ in *where they run* — `apps/ui/src/lib` versus `apps/api/src/domain`, on opposite sides of the boundary `eslint.config.mjs` exists to enforce. A shared generator would have to live in `libs/contracts`, which would put credential minting in the package the **browser bundles** | **Rejected: it would move credential generation into browser-reachable code** to remove a duplication neither site is harmed by. US-027/D-04 reached the same conclusion for the narrower reason (speculative generality for two call sites) |
| **Raise a Gate 1 change-request to widen V-18 to cover REQ-021** | Puts the rule where rules live; one authority | V-18 does not *need* widening — it already says what it means. The reset path's answer is *no exclusion*, so widening V-18 would be a change-request to reach the **opposite** of the decision actually made | **Answers a question nobody asked.** If the decider had chosen exclusion, no change-request would be needed either: the story could simply have applied it |
| **Leave it in US-027's `decisions.md` (D-01) and add nothing** | No ceremony; the charter's default; one fewer document | The divergence outlives the story that created it, spans two packages, and is currently **contradicted in a shipped docblock that cites the wrong screen**. `decisions.md` is scoped to "choices made while implementing one story" and a future author closing the divergence would not find it | **The live option if the decider prefers.** Its cost, named: US-027's design-note §5.3 cross-file correction becomes the only record, and it must still land |
| **Drop the shared special set too, and let each site pick** | Maximum locality | Nothing in the product varies by site there, and `evaluatePasswordPolicy`'s open definition means an unconstrained site can emit a space or a backtick without failing anything | **Rejected: it would make a real defect representable** to gain consistency of form |

## Consequences

**Easier.** Each generation site is readable on its own: the alphabet and the reason sit together,
and the reason is about a delivery mechanism a reader can see on screen. The reset path can use the
full alphanumeric range, which is a slightly larger keyspace at the same length. A future
self-service reset path has a rule to apply rather than an argument to re-run, and clause (4) gives
it a floor it cannot fall below by accident.

**Harder.** Two generators, two alphabets, two tests, and a reviewer who must check the *right*
one — which is exactly why clause (5) requires each docblock to name its delivery and point at its
sibling. Clause (4) is the subtle one: it is easy to read (3) as "no exclusions on the reset path"
and quietly admit a space. The alphabet-membership test in (6) is what makes that fail loudly, and
**it is the single highest-value thing to check in review of any diff touching either generator.**

**Follow-up work created.**

1. **`apps/ui/src/lib/generate-password.ts:10-12` must be corrected in US-027's PR.** Its exclusion
   set is justified by citing "SCR-008 ST-10's own reasoning, reused here verbatim"; ST-10
   contains no such reasoning and SCR-008 is the screen this ADR exempts. Cite **REQ-033 / V-18 and
   decision B2** instead, and state that the reset path deliberately differs under this ADR.
2. **US-027/D-04 cites this ADR** as the reason the two generators are not unified, rather than
   re-deriving it.
3. **`libs/contracts/src/password.ts` gains one line** beside `evaluatePasswordPolicy`'s "special
   is deliberately open" note, recording that openness is a **policy** decision and that clause (4)
   constrains **generators** — the two are not in tension, and the next reader should not have to
   work that out.
4. **The deferred self-service reset path (BRD-001 §10) applies this ADR by name** when it lands,
   and declares its own alphabet against its own delivery — which will be neither of the two
   described here.
