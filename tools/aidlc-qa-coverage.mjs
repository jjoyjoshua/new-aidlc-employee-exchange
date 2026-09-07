#!/usr/bin/env node
// aidlc-qa-coverage — carries browser-test evidence ACROSS repositories.
//
//   node tools/aidlc-qa-coverage.mjs                       playwright-report.json -> e2e-coverage.json
//   node tools/aidlc-qa-coverage.mjs --out -               print it instead of writing
//   node tools/aidlc-qa-coverage.mjs --report r.json --sha 9f2c1ab --run-url https://…
//
// Only needed when the e2e tests live in a DIFFERENT repository from the stories
// they prove. Same-repo tests need none of this: their path goes in the story's
// tests[] and aidlc-check proves the criterion directly.
//
// The honest limit, stated here because it is easy to forget at the far end: the
// product repo cannot see a test in another repo. Check 15 validates the FORM of
// a claim and that the criterion exists — never that an assertion ran. That is
// why run_url is mandatory for a pass, and why the same-repo topology is the
// default in ai/standards/testing-standards.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COVERAGE_SCHEMA = 'aidlc-e2e-coverage/1';

// The citation must be in the test's own title — same rule aidlc-check applies to
// in-repo tests, so a title that proves a criterion here proves it there too.
const CITATION = /(US-\d{3})\/(AC-\d{2})/;

function* walkSpecs(suite) {
  for (const spec of suite.specs ?? []) yield spec;
  for (const child of suite.suites ?? []) yield* walkSpecs(child);
}

const statuses = (spec) =>
  (spec.tests ?? []).flatMap((t) => (t.results ?? []).map((r) => r.status));

/** Playwright JSON report -> the coverage document check 15 reads. */
export function coverageFromReport(
  report,
  { sourceRepo, productSha, runUrl, generatedAt } = {},
) {
  const results = [];
  for (const suite of report.suites ?? []) {
    for (const spec of walkSpecs(suite)) {
      const m = CITATION.exec(spec.title ?? '');
      if (!m) continue; // not a claim about a criterion — omitted, never guessed at
      const ran = statuses(spec);
      // A skipped test is not proof (ai/standards/testing-standards.md), so it is
      // absent from the evidence rather than present as a weaker kind of pass.
      // Neither is a test with no results at all (interrupted run, --max-failures):
      // Playwright's spec.ok is true for a test that never executed.
      if (!ran.length || ran.every((s) => s === 'skipped')) continue;
      results.push({
        story: m[1],
        ac: m[2],
        test: spec.title,
        file: spec.file ?? '',
        outcome: spec.ok ? 'pass' : 'fail',
      });
    }
  }
  return {
    schema: COVERAGE_SCHEMA,
    source_repo: sourceRepo ?? '',
    product_sha: productSha ?? '',
    run_url: runUrl ?? '',
    generated_at: generatedAt ?? new Date().toISOString(),
    results,
  };
}

/**
 * Validate a coverage document against the stories in THIS repo.
 * @param {object} doc parsed e2e-coverage.json
 * @param {Map<string, Set<string>>} storyAcs US-### -> the AC-## its story file defines
 * @param {(sha: string) => boolean} isKnownSha whether this repo has that commit
 */
export function validateCoverage(doc, storyAcs, isKnownSha) {
  const errors = [];
  const warnings = [];
  if (doc?.schema !== COVERAGE_SCHEMA) {
    errors.push(
      `unknown schema "${doc?.schema ?? ''}" — expected "${COVERAGE_SCHEMA}"`,
    );
    return { errors, warnings };
  }
  if (!Array.isArray(doc.results)) {
    errors.push('results is not an array');
    return { errors, warnings };
  }

  for (const r of doc.results) {
    const id = `${r.story}/${r.ac}`;
    const acs = storyAcs.get(r.story);
    if (!acs) {
      errors.push(
        `${r.story} is not a story in this repo — evidence cannot prove a criterion that does not exist here`,
      );
      continue;
    }
    if (!acs.has(r.ac)) {
      errors.push(`${r.story} has no ${r.ac} — evidence cites a criterion its story does not define`);
      continue;
    }
    // A red test is a finding, in any repo (ai/standards/testing-standards.md).
    if (r.outcome === 'fail') {
      errors.push(`${id} failed in ${doc.source_repo || 'the QA repo'} (${r.test || 'unnamed test'})`);
      continue;
    }
    if (r.outcome !== 'pass') {
      errors.push(`${id} has outcome "${r.outcome ?? ''}" — expected "pass" or "fail"`);
      continue;
    }
    // The product repo cannot see the test, so the run it came from IS the proof.
    if (!doc.run_url)
      errors.push(`${id} claims a pass with no run_url — a result nobody can trace back to a run is not evidence`);
    if (!r.test)
      errors.push(`${id} claims a pass with no test name — the citation is the identifier`);
  }

  if (!doc.product_sha)
    warnings.push('no product_sha — cannot tell which revision this evidence describes');
  else if (!isKnownSha(doc.product_sha))
    warnings.push(
      `product_sha ${doc.product_sha} is not a commit in this repo — evidence may predate the code under review`,
    );
  return { errors, warnings };
}

// ---- CLI (importable without side effects: aidlc-check imports this) --------
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const reportPath = flag('report', 'playwright-report.json');
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (e) {
    console.error(
      `aidlc-qa-coverage: cannot read ${reportPath}: ${e.message}\n` +
        "Run the suite first — the JSON reporter is configured in playwright.config.ts.",
    );
    process.exit(1);
  }
  const doc = coverageFromReport(report, {
    sourceRepo: flag('repo', process.env.GITHUB_REPOSITORY ?? ''),
    productSha: flag('sha', process.env.PRODUCT_SHA ?? ''),
    runUrl:
      flag('run-url', process.env.GITHUB_RUN_URL ?? '') ||
      (process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : ''),
    generatedAt: new Date().toISOString(),
  });
  const out = flag('out', 'e2e-coverage.json');
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  if (out === '-') process.stdout.write(text);
  else writeFileSync(out, text);
  if (!doc.run_url)
    console.error(
      'warning: no run_url — the product repo will reject a pass it cannot trace to a run',
    );
  console.error(
    `aidlc-qa-coverage: ${doc.results.length} claim(s)${out === '-' ? '' : ` -> ${out}`}`,
  );
}
