/**
 * US-020/AC-04 (design note §2.3, A1). ONE named pure function building the `.or()` filter
 * string `users.repository.ts`'s `listAccounts` passes to PostgREST — so the two `ilike` clauses
 * (`full_name`, `email`) cannot diverge, and so this is the one place either escaping rule can be
 * fixed.
 *
 * Two independent escaping layers, applied in this order:
 *
 * 1. **ILIKE pattern escaping.** `%` and `_` are ILIKE wildcards; `\` is the default LIKE escape
 *    character. A literal `\`, `%` or `_` in the search term must be escaped so the pattern
 *    matches the term literally rather than as a wildcard — `\` FIRST, or escaping `%`/`_`
 *    afterwards would double-escape the backslashes just introduced.
 * 2. **PostgREST filter-grammar quoting.** `.or()` takes a raw string PostgREST parses into
 *    `column.operator.value` triples. The value is always double-quoted here (unconditionally —
 *    simpler and no less correct than quoting only when "necessary"), and PostgREST's own escape
 *    hatch inside a quoted value is `\"` and `\\`. This layer operates on layer 1's OUTPUT, so a
 *    backslash layer 1 already inserted is itself doubled here — correct, because PostgREST
 *    un-escapes this layer before Postgres's ILIKE ever sees the string, and Postgres must then
 *    find layer 1's escaping intact.
 *
 * Unescaped, `_` alone is a silent correctness bug (AC-04's literal-substring requirement — `a_b`
 * would match `axb`), and an unescaped `.`/`,`/`"` in an email search term is not a corner case —
 * it is every email search anyone will run. A recording-fake test can only prove THIS function
 * produces THIS string; whether PostgREST parses that string as one `ilike` over a literal
 * substring is proven only by the gated real-Postgres case in `admin.concurrency.spec.ts`
 * (design note §2.3, A2) — this function cannot be trusted on unit tests alone.
 */

function escapeForIlike(term: string): string {
  // Order matters: backslash first, or the backslashes this step introduces for % and _ would
  // themselves be escaped again on the next replace.
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function quoteForPostgrest(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `full_name.ilike."%term%",email.ilike."%term%"`, `term` escaped and quoted per the two layers
 *  above. `q` arrives already bounded by `adminUsersQuerySchema`'s `.max(100)` (design note A15). */
export function buildSearchFilter(q: string): string {
  const quoted = quoteForPostgrest(`%${escapeForIlike(q)}%`);
  return `full_name.ilike.${quoted},email.ilike.${quoted}`;
}
