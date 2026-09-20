/**
 * One case per ILIKE/PostgREST metacharacter (design note §2.3, plan Step 3). This proves the
 * STRING this function produces; it cannot prove PostgREST parses that string as one `ilike` over
 * a literal substring — that is `admin.concurrency.spec.ts`'s gated real-Postgres case
 * (design note A2).
 */
import { describe, expect, it } from 'vitest';
import { buildSearchFilter } from './search-filter.js';

describe('buildSearchFilter (US-020/AC-04)', () => {
  it('builds an ordinary term with no metacharacters', () => {
    expect(buildSearchFilter('dana')).toBe('full_name.ilike."%dana%",email.ilike."%dana%"');
  });

  it('escapes a literal underscore so it does not act as an ILIKE single-character wildcard', () => {
    expect(buildSearchFilter('a_b')).toBe(
      "full_name.ilike.\"%a\\\\_b%\",email.ilike.\"%a\\\\_b%\"",
    );
  });

  it('escapes a literal percent so it does not act as an ILIKE wildcard', () => {
    expect(buildSearchFilter('a%b')).toBe(
      "full_name.ilike.\"%a\\\\%b%\",email.ilike.\"%a\\\\%b%\"",
    );
  });

  it('does not need ILIKE escaping for a dot, but still quotes the value for PostgREST\'s filter grammar — every email search runs this path', () => {
    expect(buildSearchFilter('a.b')).toBe('full_name.ilike."%a.b%",email.ilike."%a.b%"');
  });

  it('does not need ILIKE escaping for a comma, but still quotes the value — an unquoted comma would split the .or() clause', () => {
    expect(buildSearchFilter('a,b')).toBe('full_name.ilike."%a,b%",email.ilike."%a,b%"');
  });

  it('escapes a literal double quote for PostgREST\'s quoted-value grammar', () => {
    expect(buildSearchFilter('a"b')).toBe(
      "full_name.ilike.\"%a\\\"b%\",email.ilike.\"%a\\\"b%\"",
    );
  });

  it('escapes a literal backslash for BOTH layers — once for ILIKE, once for the PostgREST quote', () => {
    expect(buildSearchFilter('a\\b')).toBe(
      "full_name.ilike.\"%a\\\\\\\\b%\",email.ilike.\"%a\\\\\\\\b%\"",
    );
  });

  it('produces the same quoted value for both the full_name and email clauses — one function, so they cannot diverge', () => {
    const result = buildSearchFilter('a"b');
    const [fullNameClause, emailClause] = result.split(',');
    const fullNameValue = fullNameClause?.slice('full_name.ilike.'.length);
    const emailValue = emailClause?.slice('email.ilike.'.length);
    expect(fullNameValue).toBe(emailValue);
  });
});
