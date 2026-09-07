// aidlc-check — policy-as-code for the AI-DLC framework. Required CI status.
//
//   node tools/aidlc-check.mjs                validate (exit 1 on any error)
//   node tools/aidlc-check.mjs --write        also regenerate the generated views:
//                                             traceability-matrix.md and design/tokens.json
//   node tools/aidlc-check.mjs --delivery=US-002[,US-003]
//                                             force these stories to be treated as
//                                             in-delivery (normally derived from the branch)
//   node tools/aidlc-check.mjs --lock         regenerate ai/framework-lock.json
//                                             (framework maintainers only — an adopting
//                                             project never runs this)
//
// Validates what prose cannot enforce:
//   1. artifact IDs (REQ/NFR/RISK/US/AC/SCR/ST/ADR) are unique across the repo
//   2. knowledge/traceability/manifest.json links resolve, bidirectionally —
//      every requirement a story cites must itself be a node in the graph
//   3. story AC lists in the manifest match the AC headings in the story files
//   4. listed test files exist and cite every AC of their story (US-###/AC-##)
//      in the title of an ACTIVE test — citations in comments or skipped tests
//      (it.skip/xit/describe.skip) are not proof. For a story IN DELIVERY
//      (branch feat/US-###-*), having no tests at all is an error, not a warning.
//      Both 3 and 4 read manifest.stories, so the reverse edge is checked too: a
//      story FILE with no manifest entry is a warning while it is being drafted
//      and an error once its branch is in delivery — otherwise it would escape
//      the AC->test gate entirely. A branch naming a story that has no file at
//      all is always an error
//   5. spec files citing a US are listed in that story's manifest entry (no stale manifest)
//   6. product projects (api, ui, graph-engine) declare a test target
//   7. traceability-matrix.md matches what the manifest generates (no hand edits)
//   8. knowledge-graph edges resolve: story decisions[] -> defined ADRs,
//      lessons[] entries are well-formed and link to real artifacts
//   9. the distributable plugin payload matches its sources
//      (tools/aidlc-build-plugin.mjs --check)
//  10. every persona has a charter + skill + agent that agree, and personas
//      with no authority to change things (architect, manager) are read-only
//      by tooling — their agent must disallow Write and Edit
//  12. Jira ticket templates parse, use only known placeholders, and declare no
//      field that would forward approval or duplicate what Jira owns. Recorded
//      ticket keys are well-formed. Jira is a tracking mirror, so a MISSING key
//      is never an error — Jira going away must not break the build.
//  11. design is enforced, not conventional: a story with a UI section cites a
//      screen; a screen's ST-## states match its manifest entry; every screen
//      is reachable (entry, or another screen's links_to); text-on-surface
//      token pairs meet WCAG AA 4.5:1 (warning); inception/design/tokens.json
//      is generated from tokens.css (the designer's tool-agnostic export) and
//      never hand-edited. Frames live in the design tool (ADR-008)
//  13. the per-tool persona surfaces (Cursor, opencode, GitHub Copilot) match
//      their .claude/ sources (tools/aidlc-build-surfaces.mjs --check, ADR-005)
//  15. cross-repo e2e evidence (knowledge/traceability/e2e-coverage.json) is
//      validated when present and IGNORED when absent — a repo keeping its e2e
//      tests in-repo, or having none, is unaffected. It can never prove that a
//      remote assertion ran, only that the claim is well-formed and the criterion
//      exists, which is why a pass must carry the run it came from
//  16. a spec package present under inception/specs/ is internally honest:
//      every FR/NFR in spec.md has a traceability row, every cited path exists,
//      every US/AC it cites is real, it has an index row, and a Gate D1 approval
//      block is well-formed and matches the plan it approved. An ABSENT package
//      fails nothing — CI cannot know the tier, and Simple work has none.
//  14. framework-owned files match ai/framework-lock.json (SHA-256 per file).
//      Adopting teams edit only project-owned paths (ai/standards/,
//      ai/templates/jira/); an edited or deleted framework file fails the
//      build until reverted — framework changes go upstream as change requests
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// CRLF-normalized reads: Windows autocrlf checkouts must parse and compare like LF ones
function read(p) {
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const REPO = process.cwd();
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.'))
      continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}
// Always forward slashes: lock keys, manifest paths, and PROJECT_OWNED prefixes
// are written with '/', and path.relative returns '\' on Windows.
const rel = (p) => relative(REPO, p).split(sep).join('/');

// An AC counts as proven only when cited in the title of an active `it(`/`test(`
// (`.each` allowed) — a citation in a comment or a skipped test is not proof.
// Nested parens inside `.each(...)` args aren't parsed; cite in a plain test if hit.
const citesAc = (contents, us, ac) =>
  new RegExp(
    '(?<![\\w.])(?:it|test)(?:\\.each\\([^)]*\\))?\\s*\\(\\s*[`\'"][^`\'"\\n]*' +
      `${us}/${ac}`,
  ).test(contents);
const SKIPPED_TEST =
  /\b(?:describe|it|test)\.skip\s*\(|\bx(?:it|test|describe)\s*\(/;
// What counts as a test file, in any stack this framework might be installed in.
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
// ...except this repo's own tool self-tests. They build fixture repositories, so
// they legitimately contain synthetic US-###/AC-## text that is data, not a
// citation — reading it as one would make the framework fail its own check 5.
// They are never shipped to adopting repos (the payload lists tools explicitly),
// so this exclusion cannot hide a product spec anywhere else.
const SELF_TEST = /^tools\/aidlc-[^/]*\.test\.mjs$/;
const isProductSpec = (p) => TEST_FILE.test(p) && !SELF_TEST.test(p);

// Which stories are in delivery right now? Status lives on GitHub, not in files,
// so this is derived from the branch under review — GITHUB_HEAD_REF on a PR,
// otherwise the checked-out branch — against the documented Gate 2 convention
// `feat/US-###-<slug>`. On a delivery branch, "no tests yet" stops being an
// acceptable pre-delivery state and becomes a hard failure.
function deliveryStories() {
  const flag = process.argv.find((a) => a.startsWith('--delivery='));
  if (flag)
    return new Set(flag.slice('--delivery='.length).split(',').filter(Boolean));
  let ref = process.env.GITHUB_HEAD_REF || '';
  if (!ref) {
    try {
      ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      ref = ''; // not a git checkout — treat nothing as in-delivery
    }
  }
  const m = ref.match(/^feat\/(US-\d{3})\b/);
  return new Set(m ? [m[1]] : []);
}
const inDelivery = deliveryStories();

// ---- 1. collect ID definitions and reject duplicates -----------------------
const defs = new Map(); // id -> [files]
const define = (id, file) => defs.set(id, [...(defs.get(id) ?? []), file]);

for (const f of walk(join(REPO, 'inception', 'product'), (p) =>
  p.endsWith('.md'),
)) {
  const text = read(f);
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*((?:REQ|NFR|RISK)-\d{3})\s*\|/);
    if (m) define(m[1], rel(f));
  }
}
const storyFiles = walk(
  join(REPO, 'inception', 'stories', 'user-stories'),
  (p) => /US-\d{3}.*\.md$/.test(p),
);
const storyAcs = new Map(); // US-### -> Set(AC-##)
const storyHasUi = new Set(); // stories carrying a "## UI" section
for (const f of storyFiles) {
  const us = rel(f).match(/US-\d{3}/)[0];
  define(us, rel(f));
  const text = read(f);
  const acs = new Set(
    [...text.matchAll(/^###\s+(AC-\d{2})\b/gm)].map((m) => m[1]),
  );
  storyAcs.set(us, acs);
  for (const ac of acs) define(`${us}/${ac}`, rel(f));
  if (/^##\s+UI\b/m.test(text)) storyHasUi.add(us);
}
for (const f of walk(join(REPO, 'knowledge', 'decisions'), (p) =>
  /ADR-\d{3}.*\.md$/.test(p),
)) {
  define(rel(f).match(/ADR-\d{3}/)[0], rel(f));
}
// Screen specs: the UX persona's Gate 1 artifact. States (ST-##) are numbered
// per screen for the same reason ACs are numbered per story — an unnumbered
// state is one nobody notices is missing.
const screenFiles = walk(join(REPO, 'inception', 'design', 'screens'), (p) =>
  /SCR-\d{3}.*\.md$/.test(p),
);
const screenStates = new Map(); // SCR-### -> Set(ST-##)
for (const f of screenFiles) {
  const scr = rel(f).match(/SCR-\d{3}/)[0];
  define(scr, rel(f));
  const states = new Set(
    [...read(f).matchAll(/^###\s+(ST-\d{2})\b/gm)].map(
      (m) => m[1],
    ),
  );
  screenStates.set(scr, states);
  for (const st of states) define(`${scr}/${st}`, rel(f));
}
for (const [id, files] of defs) {
  if (files.length > 1)
    err(`duplicate ID ${id} defined in: ${files.join(', ')}`);
}

// ---- 2–4. manifest resolution, bidirectionality, AC/test coverage ----------
const manifestPath = join(REPO, 'knowledge', 'traceability', 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(read(manifestPath));
} catch (e) {
  err(`cannot read ${rel(manifestPath)}: ${e.message}`);
}

if (manifest) {
  const reqs = manifest.requirements ?? {};
  const stories = manifest.stories ?? {};

  for (const [req, entry] of Object.entries(reqs)) {
    if (!defs.has(req))
      err(`manifest requirement ${req} is not defined in any BRD`);
    for (const us of entry.stories) {
      if (!stories[us])
        err(`manifest: ${req} lists ${us}, which has no story entry`);
      else if (!stories[us].requirements.includes(req))
        err(
          `manifest not bidirectional: ${req} -> ${us}, but ${us} does not list ${req}`,
        );
    }
    // Reverse of the design-first edge: a screen may trace to a requirement
    // before any story exists (stories are drafted last, once scope locks), so
    // requirements carry an optional screens[] the screen must mirror.
    for (const scr of entry.screens ?? []) {
      const screenNodes = manifest.screens ?? {};
      if (!screenNodes[scr])
        err(`manifest: ${req} lists screen ${scr}, which has no screen entry`);
      else if (!(screenNodes[scr].requirements ?? []).includes(req))
        err(
          `manifest not bidirectional: ${req} -> ${scr}, but ${scr} does not list ${req} in requirements[]`,
        );
    }
    if (entry.stories.length === 0)
      warn(`${req} has no covering story (unscheduled scope)`);
  }

  // The reverse edge. Checks 3 and 4 iterate manifest.stories, so a story FILE
  // that nobody added to the manifest was invisible to both: its ACs were never
  // matched against the file, and no citing test was ever required. On a
  // delivery branch that meant a green build with zero tests — the precise
  // outcome check 4 exists to prevent. Escalates like every other incomplete
  // artifact here (ai/AI-DLC.md): a warning while the story is still being
  // drafted, a hard error once its own branch is in delivery.
  for (const us of storyAcs.keys()) {
    if (stories[us]) continue;
    if (inDelivery.has(us))
      err(
        `${us} is in delivery (branch feat/${us}-*) but has no entry in ${rel(manifestPath)} — add it with its acs[] and tests[], or the AC->test gate cannot see this story at all`,
      );
    else
      warn(
        `${us} has a story file but no entry in ${rel(manifestPath)} — untraced until the stories PR adds it`,
      );
  }
  // A branch can also name a story that does not exist in the first place.
  for (const us of inDelivery) {
    if (!storyAcs.has(us))
      err(
        `branch is delivering ${us}, which has no story file in inception/stories/user-stories/ — check the branch name against the approved story`,
      );
  }

  for (const [us, entry] of Object.entries(stories)) {
    if (!defs.has(us))
      err(
        `manifest story ${us} has no story file in inception/stories/user-stories/`,
      );
    if (entry.artifact && !existsSync(join(REPO, entry.artifact)))
      err(`manifest: ${us} artifact path missing: ${entry.artifact}`);
    if (entry.requirements.length === 0)
      err(`${us} traces to no requirement (orphan story)`);
    for (const req of entry.requirements) {
      if (!defs.has(req)) err(`${us} references undefined requirement ${req}`);
      // A requirement absent from manifest.requirements is a one-way edge: it
      // never appears in the matrix and never gets coverage accounting. NFRs
      // used to slip through here — every cited requirement must be a node.
      if (!reqs[req])
        err(
          `${us} cites ${req}, which is not a node in manifest.requirements — add "${req}": { "stories": ["${us}"] } so the edge is bidirectional and ${req} appears in the matrix`,
        );
      else if (!reqs[req].stories.includes(us))
        err(
          `manifest not bidirectional: ${us} -> ${req}, but ${req} does not list ${us}`,
        );
    }
    for (const adr of entry.decisions ?? []) {
      if (!defs.has(adr))
        err(`${us}: decisions lists ${adr}, which is not a defined ADR`);
    }
    const fileAcs = storyAcs.get(us);
    if (fileAcs) {
      const manifestAcs = new Set(entry.acs);
      for (const ac of manifestAcs)
        if (!fileAcs.has(ac))
          err(
            `${us}: manifest lists ${ac}, story file has no "### ${ac}" heading`,
          );
      for (const ac of fileAcs)
        if (!manifestAcs.has(ac))
          err(`${us}: story file defines ${ac}, missing from manifest acs`);
    }
    if (entry.tests.length === 0) {
      if (inDelivery.has(us))
        err(
          `${us} is in delivery (branch feat/${us}-…) but lists no tests — each of its AC needs a test citing "${us}/AC-##" in the same PR (ai/gates/delivery.md)`,
        );
      else warn(`${us} has no tests yet (pre-delivery)`);
    } else {
      const contents = entry.tests
        .map((t) => {
          if (!existsSync(join(REPO, t))) {
            err(`${us}: listed test file missing: ${t}`);
            return '';
          }
          const text = read(join(REPO, t));
          if (SKIPPED_TEST.test(text))
            err(
              `${us}: ${t} contains skipped tests (it.skip/xit/describe.skip) — skipped tests cannot serve as AC proof (testing-standards: a red test is never skipped)`,
            );
          return text;
        })
        .join('\n');
      for (const ac of entry.acs) {
        if (!citesAc(contents, us, ac))
          err(
            `${us}: no listed test cites "${us}/${ac}" in an active test title — AC unproven`,
          );
      }
    }
  }

  // ---- 11. design edges: story <-> screen <-> state, screen -> screen -------
  // The design phase is only "enforced" if a missing screen, an unlisted
  // state, or an unreachable screen can fail a build. Frames live in the
  // design tool (ADR-008), so this is what the repo can still prove. Same
  // shape as the AC/test rule: incomplete is a warning before delivery and an
  // error once the story is on its feat/ branch, the last cheap moment.
  const screens = manifest.screens ?? {};
  const screenInDelivery = (entry) =>
    (entry.stories ?? []).some((us) => inDelivery.has(us));

  for (const [scr, entry] of Object.entries(screens)) {
    if (!defs.has(scr))
      err(
        `manifest screen ${scr} has no spec file in inception/design/screens/`,
      );
    if (entry.artifact && !existsSync(join(REPO, entry.artifact)))
      err(`manifest: ${scr} artifact path missing: ${entry.artifact}`);

    // Design comes before stories: a screen is drawn from an approved
    // requirement and only gains its story edge once scope locks. So a screen
    // is an orphan only when it traces to neither — a screen that traces to
    // *something* is a brief, not decoration.
    if (
      (entry.stories ?? []).length === 0 &&
      (entry.requirements ?? []).length === 0
    )
      err(
        `${scr} traces to neither a story nor a requirement (orphan screen) — a screen that traces to nothing is decoration`,
      );
    for (const us of entry.stories ?? []) {
      if (!stories[us])
        err(`manifest: ${scr} lists ${us}, which has no story entry`);
      else if (!(stories[us].screens ?? []).includes(scr))
        err(
          `manifest not bidirectional: ${scr} -> ${us}, but ${us} does not list ${scr} in screens[]`,
        );
    }
    for (const req of entry.requirements ?? []) {
      if (!reqs[req])
        err(
          `manifest: ${scr} cites ${req}, which is not a node in manifest.requirements — add "${req}": { "stories": [], "screens": ["${scr}"] } so the edge is bidirectional`,
        );
      else if (!(reqs[req].screens ?? []).includes(scr))
        err(
          `manifest not bidirectional: ${scr} -> ${req}, but ${req} does not list ${scr} in screens[]`,
        );
    }

    // states in the manifest match the ST-## headings in the spec
    const fileStates = screenStates.get(scr);
    if (fileStates) {
      const manifestStates = new Set(entry.states ?? []);
      for (const st of manifestStates)
        if (!fileStates.has(st))
          err(
            `${scr}: manifest lists ${st}, spec file has no "### ${st}" heading`,
          );
      for (const st of fileStates)
        if (!manifestStates.has(st))
          err(`${scr}: spec defines ${st}, missing from manifest states`);
      if (fileStates.size === 0)
        err(
          `${scr} enumerates no states — every screen has at least a default state (ai/templates/screen-spec.md)`,
        );
    }

  }

  // reverse edge: a story with UI must name the screen that serves it
  for (const [us, entry] of Object.entries(stories)) {
    for (const scr of entry.screens ?? []) {
      if (!screens[scr])
        err(
          `${us} cites ${scr}, which is not a node in manifest.screens — add it so the edge is bidirectional`,
        );
      else if (!(screens[scr].stories ?? []).includes(us))
        err(
          `manifest not bidirectional: ${us} -> ${scr}, but ${scr} does not list ${us}`,
        );
    }
    if (storyHasUi.has(us) && (entry.screens ?? []).length === 0) {
      const msg = `${us} has a "## UI" section but cites no screen — UI would ship undesigned (/ux owns inception/design/screens/)`;
      if (inDelivery.has(us)) err(msg);
      else warn(`${msg} (pre-delivery)`);
    }
  }

  // flow edges: links_to targets resolve, and every screen is reachable.
  // Vertical traceability (REQ -> SCR -> state) cannot see a screen no other
  // screen leads to — it passes every check and no user ever finds it.
  {
    const entries = Object.entries(screens);
    const linksOf = new Map(
      entries.map(([scr, e]) => {
        const raw = e.links_to ?? [];
        if (Array.isArray(raw)) return [scr, raw];
        err(
          `${scr}: "links_to" must be an array of SCR-### ids, got ${JSON.stringify(raw)}`,
        );
        return [scr, []];
      }),
    );
    for (const [scr, targets] of linksOf)
      for (const t of targets)
        if (!screens[t])
          err(`${scr} links_to ${t}, which is not a node in manifest.screens`);

    const flag = (msg, delivering) =>
      delivering ? err(msg) : warn(`${msg} (pre-delivery)`);
    const roots = entries.filter(([, e]) => e.entry).map(([scr]) => scr);
    if (entries.length > 0 && roots.length === 0)
      flag(
        `no screen is marked "entry": true — the flow has no root the user lands on (inception/design/ia.md)`,
        entries.some(([, e]) => screenInDelivery(e)),
      );
    // Reachability is a walk from the entry set, not "has an inbound edge":
    // a cluster that only links to itself would otherwise pass.
    const seen = new Set(roots);
    const queue = [...roots];
    while (queue.length)
      for (const t of linksOf.get(queue.shift()) ?? [])
        if (screens[t] && !seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
    if (roots.length > 0)
      for (const [scr, e] of entries)
        if (!seen.has(scr))
          flag(
            `${scr} is unreachable from any entry screen — no path of links_to leads to it (inception/design/ia.md)`,
            screenInDelivery(e),
          );
  }

  // token contrast: WCAG AA 4.5:1 for text-on-surface pairs, per theme block.
  // ponytail: pairs are picked by token-name heuristic (text* vs surface/bg*,
  // skipping disabled/placeholder/inverse/overlay/hover); move to explicit
  // pair annotations in tokens.css if real palettes make this too noisy.
  const tokensCssPath = join(REPO, 'inception', 'design', 'tokens.css');
  if (existsSync(tokensCssPath)) {
    // Same light/dark split as the tokens.json export: everything before the
    // first @media is the light theme, the @media block overrides it.
    const css = read(tokensCssPath).replace(/\/\*[\s\S]*?\*\//g, '');
    const cut = css.indexOf('@media');
    const light = cssProps(cut === -1 ? css : css.slice(0, cut));
    const themes = [['light', light]];
    if (cut !== -1) themes.push(['dark', { ...light, ...cssProps(css.slice(cut)) }]);
    const luminance = (hexColor) => {
      let h = hexColor.slice(1);
      if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
      const [r, g, b] = [0, 2, 4].map((i) => {
        const v = parseInt(h.slice(i, i + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const [theme, map] of themes) {
      const resolve = (name, depth = 0) => {
        const v = map[name];
        if (!v || depth > 8) return null;
        const ref = v.match(/var\(\s*(--[\w-]+)/);
        if (ref) return resolve(ref[1], depth + 1);
        return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(v) ? v : null;
      };
      const names = Object.keys(map);
      const texts = names.filter(
        (n) => /text/.test(n) && !/disabled|placeholder|inverse/.test(n),
      );
      const surfaces = names.filter(
        (n) =>
          /(surface|bg|background)/.test(n) &&
          !/inverse|overlay|hover/.test(n),
      );
      // Silence must be visible: a colour the check cannot read is reported,
      // not skipped, or the rule vanishes exactly when real palettes arrive.
      const unreadable = [...texts, ...surfaces].filter((n) => !resolve(n));
      if (unreadable.length)
        warn(
          `tokens.css (${theme}): contrast not checked for ${unreadable.join(', ')} — only 3/6-digit hex (or var() chains ending in one) can be measured`,
        );
      for (const t of texts)
        for (const s of surfaces) {
          const tc = resolve(t);
          const sc = resolve(s);
          if (!tc || !sc) continue;
          const [hi, lo] = [luminance(tc), luminance(sc)].sort(
            (x, y) => y - x,
          );
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < 4.5)
            warn(
              `tokens.css (${theme}): ${t} on ${s} is ${ratio.toFixed(2)}:1 — below WCAG AA 4.5:1`,
            );
        }
    }
  }

  // ---- 8. lessons-learned edges are well-formed and resolve ----------------
  for (const [i, lesson] of (manifest.lessons ?? []).entries()) {
    if (!lesson.date || !lesson.insight)
      err(`lessons[${i}] needs both "date" and "insight"`);
    for (const link of lesson.links ?? []) {
      if (/^#\d+$/.test(link)) continue; // GitHub issue ref — lives on GitHub
      if (!defs.has(link) && !stories[link])
        err(`lessons[${i}] links to unknown artifact "${link}"`);
    }
  }

  // ---- 5. reverse link: spec citations must be in the manifest -------------
  // Test files are found by asking git, not by assuming a layout: Nx puts them
  // under apps/ and libs/, a flat repo under src/ or test/, and an e2e layer
  // wherever `--profile e2e --root` put it. Anything git tracks and names like a
  // test is a candidate; anything untracked was never the repo's to validate.
  let specs;
  try {
    specs = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1 << 26,
    })
      .toString()
      .split('\0')
      .filter((p) => p && isProductSpec(p))
      .map((p) => join(REPO, p))
      // the index also lists tracked files deleted from the working tree
      .filter((p) => existsSync(p));
  } catch {
    // not a git checkout (a scaffold run before `git init`) — walk instead
    specs = walk(REPO, (p) => isProductSpec(rel(p)));
  }
  for (const spec of specs) {
    const cited = new Set(
      [...read(spec).matchAll(/US-\d{3}/g)].map((m) => m[0]),
    );
    for (const us of cited) {
      if (!stories[us])
        err(`${rel(spec)} cites ${us}, which is not in the manifest`);
      else if (!stories[us].tests.includes(rel(spec)))
        err(
          `stale manifest: ${rel(spec)} cites ${us} but is not listed in its tests[]`,
        );
    }
  }

  // ---- 7. matrix view is generated, not hand-edited ------------------------
  const view = generateMatrix(reqs, stories);
  const matrixPath = join(
    REPO,
    'knowledge',
    'traceability',
    'traceability-matrix.md',
  );
  if (process.argv.includes('--write')) {
    writeFileSync(matrixPath, view);
    console.log(`wrote ${rel(matrixPath)}`);
  } else if (
    !existsSync(matrixPath) ||
    read(matrixPath) !== view
  ) {
    err(
      `traceability-matrix.md is stale or hand-edited — run: node tools/aidlc-check.mjs --write`,
    );
  }
}

// ---- 11b. tokens.json is generated from tokens.css --------------------------
// The designer's half of the handoff. tokens.css is canonical because that is
// what actually renders; tokens.json is the same set in W3C Design Tokens
// (DTCG) form, which Figma (Tokens Studio), Penpot and others import. Deriving
// it means the palette a designer draws with cannot drift from the palette the
// product ships — which is the whole reason the export is worth having.
const TOKEN_GROUPS = [
  ['c-', 'color', 'color'],
  ['fw-', 'fontWeight', 'fontWeight'],
  ['f-', 'fontFamily', 'fontFamily'],
  ['t-', 'fontSize', 'dimension'],
  ['lh-', 'lineHeight', 'number'],
  ['ls-', 'letterSpacing', 'dimension'],
  ['s-', 'spacing', 'dimension'],
  ['r-', 'radius', 'dimension'],
  ['shadow-', 'shadow', null],
  ['motion-', 'motion', null],
  ['control-', 'control', 'dimension'],
  ['icon-', 'icon', 'dimension'],
];

// `--name: value;` pairs of a CSS chunk, as { '--name': 'value' }.
function cssProps(css) {
  return Object.fromEntries(
    [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].replace(/\s+/g, ' ').trim(),
    ]),
  );
}

function tokensFrom(css, base = {}) {
  const own = cssProps(css);
  const all = { ...base, ...own };
  // Aliases are resolved so the design tool gets a value it can bind to;
  // --p-* primitives are tokens.css-internal (ADR-008) and are not exported,
  // so nothing in the tool can bind to one.
  const resolve = (v, depth = 0) => {
    const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (!ref || depth > 8 || all[ref[1]] === undefined) return v;
    return resolve(all[ref[1]], depth + 1);
  };
  const out = {};
  for (const [cssName, value] of Object.entries(own)) {
    const name = cssName.slice(2);
    if (name.startsWith('p-')) continue;
    const hit = TOKEN_GROUPS.find(([prefix]) => name.startsWith(prefix));
    const [prefix, group, type] = hit ?? [null, 'other', null];
    const key = prefix ? name.slice(prefix.length) : name;
    out[group] ??= {};
    out[group][key] = {
      ...(type ? { $type: type } : {}),
      $value: resolve(value),
      $extensions: { 'css.variable': cssName },
    };
  }
  return out;
}

function generateTokens(css) {
  // The dark set is the @media (prefers-color-scheme: dark) override block —
  // deliberately partial, exactly like the stylesheet it comes from. It
  // resolves against the light set so a dark alias to a light primitive works.
  const cut = css.indexOf('@media');
  const lightCss = cut === -1 ? css : css.slice(0, cut);
  const light = tokensFrom(lightCss);
  const dark = cut === -1 ? {} : tokensFrom(css.slice(cut), cssProps(lightCss));
  return (
    JSON.stringify(
      {
        $description:
          'GENERATED from inception/design/tokens.css by tools/aidlc-check.mjs --write — do not edit. W3C DTCG format for import into design tools (Figma/Tokens Studio, Penpot, …). "dark" holds only the tokens the dark theme overrides, as in the stylesheet.',
        light,
        dark,
      },
      null,
      2,
    ) + '\n'
  );
}

const tokensCss = join(REPO, 'inception', 'design', 'tokens.css');
if (existsSync(tokensCss)) {
  const tokensJson = join(REPO, 'inception', 'design', 'tokens.json');
  const generated = generateTokens(read(tokensCss));
  if (process.argv.includes('--write')) {
    writeFileSync(tokensJson, generated);
    console.log(`wrote ${rel(tokensJson)}`);
  } else if (
    !existsSync(tokensJson) ||
    read(tokensJson) !== generated
  ) {
    err(
      `inception/design/tokens.json is stale or hand-edited — it is generated from tokens.css so the designer's import cannot drift from what ships. Run: node tools/aidlc-check.mjs --write`,
    );
  }
}

function generateMatrix(reqs, stories) {
  let out =
    '# Traceability matrix\n\n> GENERATED from manifest.json by tools/aidlc-check.mjs --write — do not edit.\n\n| Requirement | Stories | AC proven | Status |\n|---|---|---|---|\n';
  for (const [req, entry] of Object.entries(reqs)) {
    const usList = entry.stories.join(', ') || '—';
    let proven = 0,
      total = 0,
      delivered = true;
    for (const us of entry.stories) {
      const s = stories[us];
      if (!s) continue;
      total += s.acs.length;
      if (s.tests.length === 0) {
        delivered = false;
        continue;
      }
      const contents = s.tests
        .filter((t) => existsSync(join(REPO, t)))
        .map((t) => read(join(REPO, t)))
        .join('\n');
      proven += s.acs.filter((ac) => citesAc(contents, us, ac)).length;
    }
    const status =
      entry.stories.length === 0
        ? 'unscheduled'
        : total > 0 && proven === total && delivered
          ? 'delivered'
          : proven > 0
            ? 'in progress'
            : 'planned';
    out += `| ${req} | ${usList} | ${total ? `${proven}/${total}` : '—'} | ${status} |\n`;
  }
  return out;
}

// ---- 6. product projects declare test targets -------------------------------
const targets = [
  [
    'api',
    'apps/api/package.json',
    (j) => j.nx?.targets?.test || j.scripts?.test,
  ],
  ['ui', 'apps/ui/project.json', (j) => j.targets?.test],
  [
    'graph-engine',
    'libs/graph-engine/package.json',
    (j) => j.nx?.targets?.test || j.scripts?.test,
  ],
];
for (const [name, file, get] of targets) {
  try {
    if (!get(JSON.parse(read(join(REPO, file)))))
      err(
        `project "${name}" has no test target (${file}) — untestable product code`,
      );
  } catch (e) {
    // The target list describes the reference project; repos without a listed
    // project (the framework repo itself, adopting repos with other layouts)
    // skip it — story tests are still enforced per-AC by check 4.
    if (e.code === 'ENOENT')
      warn(`project "${name}" not present (${file}) — test-target check skipped`);
    else err(`cannot check test target for "${name}": ${e.message}`);
  }
}

// ---- 10. persona surfaces are complete and authority limits hold ------------
// Each persona exists three times: a charter (the contract), a skill (human
// invokes it), and an agent (delegated to). They must agree. Personas whose
// charter grants NO authority to change things must be read-only *by tooling*,
// not by good intentions — so their agent has to disallow the write tools.
const PERSONAS = ['ba', 'ux', 'architect', 'dev', 'qa', 'devops', 'manager'];
const READ_ONLY = {
  architect: 'its review is advisory — the human review is the authority',
  manager: 'it holds no gate authority; status is derived, never authored',
};
for (const p of PERSONAS) {
  const charter = join(REPO, 'ai', 'roles', `${p}.md`);
  const skill = join(REPO, '.claude', 'skills', p, 'SKILL.md');
  const agent = join(REPO, '.claude', 'agents', `aidlc-${p}.md`);
  if (!existsSync(charter))
    err(`persona "${p}" has no charter at ai/roles/${p}.md`);
  if (!existsSync(skill))
    err(`persona "${p}" has no skill at .claude/skills/${p}/SKILL.md`);
  if (!existsSync(agent)) {
    err(`persona "${p}" has no agent at .claude/agents/aidlc-${p}.md`);
    continue;
  }
  const text = read(agent);
  const fm = text.split('---')[1] ?? '';
  const declared = fm.match(/^name:\s*(\S+)/m)?.[1];
  if (declared !== `aidlc-${p}`)
    err(
      `.claude/agents/aidlc-${p}.md declares name "${declared}" — must be "aidlc-${p}" or delegation resolves the wrong agent`,
    );
  if (!text.includes(`ai/roles/${p}.md`))
    err(
      `.claude/agents/aidlc-${p}.md never points at its charter (ai/roles/${p}.md) — the agent would drift from the contract`,
    );
  if (READ_ONLY[p]) {
    const dis = fm.match(/^disallowedTools:\s*(.+)$/m)?.[1] ?? '';
    for (const tool of ['Write', 'Edit']) {
      if (!new RegExp(`\\b${tool}\\b`).test(dis))
        err(
          `.claude/agents/aidlc-${p}.md must disallow ${tool}: ${READ_ONLY[p]}. Add it to disallowedTools`,
        );
    }
  }
}

// ---- 12. Jira templates are safe and recorded keys are well-formed ----------
// The templates are client-visible and the tool that fills them is the only
// writer, so the rules live in one place (tools/aidlc-jira.mjs) and are asserted
// here. Nothing in this block can fail because Jira is unreachable — by design.
if (existsSync(join(REPO, 'ai', 'templates', 'jira'))) {
  try {
    const { validateTemplates } = await import(
      pathToFileURL(join(REPO, 'tools', 'aidlc-jira.mjs')).href
    );
    for (const p of validateTemplates()) err(p);
  } catch (e) {
    err(`cannot validate Jira templates: ${e.message}`);
  }

  const KEY = /^[A-Z][A-Z0-9]+-\d+$/;
  const project = process.env.JIRA_PROJECT_KEY;
  for (const [bucket, label] of [
    [manifest?.stories ?? {}, 'story'],
    [manifest?.epics ?? {}, 'epic'],
  ]) {
    for (const [id, entry] of Object.entries(bucket)) {
      if (entry.jira === undefined) continue;
      if (typeof entry.jira !== 'string' || !KEY.test(entry.jira))
        err(
          `${label} ${id}: jira key "${entry.jira}" is not a Jira issue key (expected e.g. "LOG-142")`,
        );
      else if (project && !entry.jira.startsWith(`${project}-`))
        warn(
          `${label} ${id}: jira key ${entry.jira} is not in JIRA_PROJECT_KEY (${project}) — tracking a ticket in another project?`,
        );
    }
  }
}

// ---- 9. plugin payload matches its sources ----------------------------------
if (existsSync(join(REPO, 'packages', 'aidlc-plugin'))) {
  try {
    execFileSync(
      'node',
      [join(REPO, 'tools', 'aidlc-build-plugin.mjs'), '--check'],
      { stdio: 'pipe' },
    );
  } catch (e) {
    err(`plugin drift: ${e.stderr?.toString().trim() || e.message}`);
  }
}

// ---- 13. per-tool persona surfaces match their sources -----------------------
// Cursor/opencode/Copilot wrappers are generated from .claude/skills and
// .claude/agents (ADR-005). Skipped where the builder is absent — an installed
// repo without multi-tool surfaces is not broken.
if (existsSync(join(REPO, 'tools', 'aidlc-build-surfaces.mjs'))) {
  try {
    execFileSync(
      'node',
      [join(REPO, 'tools', 'aidlc-build-surfaces.mjs'), '--check'],
      { stdio: 'pipe' },
    );
  } catch (e) {
    err(`tool-surface drift: ${e.stderr?.toString().trim() || e.message}`);
  }
}

// ---- 14. framework-owned files match the shipped lock ------------------------
// The ownership split of the shared framework: adopting teams own what init
// generates for them (ai/standards/, ai/templates/jira/, the manifest, CI
// wiring) and never edit the framework itself (gates, roles, quality, context,
// the artifact templates, the aidlc-* tools). That rule is enforced the only
// way rules survive here — by CI: ai/framework-lock.json records a SHA-256 per
// framework-owned file, and any edit or deletion goes red until reverted.
// Wanting a different gate rule is legitimate — it goes upstream as a
// change-request against the framework, not a local edit.
//
// The lock regenerates via --lock only, deliberately NOT via --write: --write
// is routine (matrix, tokens) and would silently re-bless local edits.
const LOCK_PATH = join(REPO, 'ai', 'framework-lock.json');
// ai/project-context.md is generated per-project by /aidlc-init's interview —
// it exists only in adopting repos and is theirs, like the standards.
const PROJECT_OWNED = [
  'ai/standards/',
  'ai/templates/jira/',
  'ai/project-context.md',
];
const FRAMEWORK_TOOLS = [
  'aidlc-check.mjs',
  'aidlc-jira.mjs',
  'aidlc-build-plugin.mjs',
  'aidlc-build-surfaces.mjs',
  'aidlc-scaffold.mjs',
  // Locked for the same reason as aidlc-jira: this file is IMPORTED by check 15
  // above, so an unlocked copy would let a local edit weaken the gate that reads
  // it while check 14 reported nothing.
  'aidlc-qa-coverage.mjs',
];
// read() is CRLF-normalized, so a Windows autocrlf checkout doesn't read as tampering
const hashFile = (p) => createHash('sha256').update(read(p)).digest('hex');

function frameworkLockedFiles() {
  const acc = [];
  for (const f of walk(join(REPO, 'ai'), () => true)) {
    const r = rel(f);
    if (r === rel(LOCK_PATH)) continue;
    if (PROJECT_OWNED.some((d) => r.startsWith(d))) continue;
    acc.push(r);
  }
  for (const t of FRAMEWORK_TOOLS) {
    if (existsSync(join(REPO, 'tools', t))) acc.push(`tools/${t}`);
  }
  return acc.sort();
}

if (process.argv.includes('--lock')) {
  const files = {};
  for (const r of frameworkLockedFiles()) files[r] = hashFile(join(REPO, r));
  writeFileSync(
    LOCK_PATH,
    JSON.stringify(
      {
        $description:
          'GENERATED by tools/aidlc-check.mjs --lock (framework maintainers only) — SHA-256 per framework-owned file. Adopting projects never edit these files or this lock; project-specific rules live in ai/standards/ and ai/templates/jira/. To change the framework, open a change-request issue upstream.',
        // Stamped from the framework repo's package.json at lock time, not read at
        // check time — in an adopting repo, package.json is the team's own.
        version: JSON.parse(read(join(REPO, 'package.json'))).version,
        files,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`wrote ${rel(LOCK_PATH)} (${Object.keys(files).length} files)`);
} else if (!existsSync(LOCK_PATH)) {
  warn(
    'ai/framework-lock.json missing — framework files are unprotected (installed from a pre-lock payload?). A framework maintainer generates it with: node tools/aidlc-check.mjs --lock',
  );
} else {
  let lockedEntries = {};
  try {
    lockedEntries = JSON.parse(read(LOCK_PATH)).files ?? {};
  } catch (e) {
    err(`cannot read ${rel(LOCK_PATH)}: ${e.message}`);
  }
  for (const [r, hash] of Object.entries(lockedEntries)) {
    const p = join(REPO, r);
    if (!existsSync(p)) {
      // Framework tools are optional per installation (e.g. the plugin builder
      // exists only in the framework repo); framework docs and charters are not.
      if (!r.startsWith('tools/'))
        err(
          `framework file deleted: ${r} — restore it; framework content cannot be removed per-project (to drop it from the framework, open a change-request upstream)`,
        );
      continue;
    }
    if (hashFile(p) !== hash)
      err(
        `${r} was modified but is framework-owned — revert it. Project-specific rules belong in ai/standards/ or ai/templates/jira/; to change the framework itself, open a change-request issue upstream. Framework maintainers regenerate the lock with: node tools/aidlc-check.mjs --lock`,
      );
  }
  for (const r of frameworkLockedFiles()) {
    if (!(r in lockedEntries))
      err(
        `${r} is not in ai/framework-lock.json — framework-owned paths only hold files the framework ships. Project files belong in ai/standards/ or ai/templates/jira/. Framework maintainers add new framework files with: node tools/aidlc-check.mjs --lock`,
      );
  }
}

// ---- 15. cross-repo e2e evidence, if any was published ----------------------
// Absent file → silent. Not a warning, not a config flag, no requirement: a repo
// whose e2e tests live in-repo (or that has none) must be entirely unaffected by
// this check existing. Present → validated strictly, because a file nobody
// verifies is just somewhere to write green ticks nobody earned.
//
// No network, ever: the evidence is a committed file reviewed in a PR, not a
// fetch. A gate that fails because someone else's artifact host was down is a
// gate the team learns to re-run instead of read.
const COVERAGE_PATH = join(
  REPO,
  'knowledge',
  'traceability',
  'e2e-coverage.json',
);
// whether this repo has that commit — checks 15 and 16 both verify claims by SHA
const reachableSha = (sha) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: REPO,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};
if (existsSync(COVERAGE_PATH)) {
  try {
    const { validateCoverage } = await import(
      pathToFileURL(join(REPO, 'tools', 'aidlc-qa-coverage.mjs')).href
    );
    const { errors: e, warnings: w } = validateCoverage(
      JSON.parse(read(COVERAGE_PATH)),
      storyAcs,
      reachableSha,
    );
    for (const m of e) err(`e2e-coverage.json: ${m}`);
    for (const m of w) warn(`e2e-coverage.json: ${m}`);
  } catch (e) {
    err(`cannot validate e2e-coverage.json: ${e.message}`);
  }
}

// ---- 16. development spec packages are internally honest ---------------------
// Absent package -> silent, for the same reason as check 15: CI cannot know the
// task's tier, and a Simple-tier change legitimately has no package. Present ->
// validated, because a traceability table nobody verifies is a place to write
// requirement IDs that were never implemented.
const SPECS_DIR = join(REPO, 'inception', 'specs');
if (existsSync(SPECS_DIR)) {
  const indexText = existsSync(join(SPECS_DIR, 'index.md'))
    ? read(join(SPECS_DIR, 'index.md'))
    : '';
  // `| FR-01 | ...` — the ID in the first cell of a table row, the same shape
  // check 1 uses for REQ/NFR/RISK rows in inception/product. Any digit width:
  // a spec written FR-1 or FR-100 must be traced, not silently exempted.
  const rowIds = (text, kinds) => {
    const ids = new Set();
    for (const line of text.split('\n')) {
      const m = line.match(new RegExp(`^\\|\\s*((?:${kinds})-\\d+)\\s*\\|`));
      if (m) ids.add(m[1]);
    }
    return ids;
  };
  // A shallow clone genuinely cannot see an old commit; a full clone that cannot
  // see it is looking at an approval that never happened here.
  const shallowRepo = (() => {
    try {
      return (
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          cwd: REPO,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() === 'true'
      );
    } catch {
      return true; // not a git checkout — cannot verify either way, stay a warning
    }
  })();

  for (const name of readdirSync(SPECS_DIR)) {
    const pkgDir = join(SPECS_DIR, name);
    if (name.startsWith('.') || !statSync(pkgDir).isDirectory()) continue;
    const specPath = join(pkgDir, 'spec.md');
    if (!existsSync(specPath)) {
      err(
        `${rel(pkgDir)}: no spec.md — a spec package's requirements live there`,
      );
      continue;
    }
    const at = `${rel(pkgDir)}:`;
    const specText = read(specPath);

    // 1. every FR/NFR in spec.md appears in traceability.md
    const declared = rowIds(specText, 'FR|NFR');
    const tracePath = join(pkgDir, 'traceability.md');
    const traceText = existsSync(tracePath) ? read(tracePath) : '';
    if (!traceText && declared.size)
      err(
        `${at} declares ${declared.size} requirement(s) but has no traceability.md`,
      );
    const traced = rowIds(traceText, 'FR|NFR');
    for (const id of declared)
      if (!traced.has(id))
        err(
          `${at} ${id} is in spec.md but not in traceability.md — every requirement gets a row, even one with status "not started"`,
        );

    // 2. every path cited in the traceability TABLE resolves. Table rows only:
    // prose (and a freshly copied template) legitimately mentions paths that are
    // not claims — `path/to/f.ts` placeholders and globs are not claims either.
    for (const line of traceText.split('\n')) {
      if (!line.trimStart().startsWith('|')) continue;
      for (const m of line.matchAll(/`([^`\s]+\.[a-z0-9]+)`/gi)) {
        const cited = m[1];
        if (cited.startsWith('http') || !cited.includes('/')) continue;
        if (cited.includes('*') || cited.startsWith('path/to/')) continue;
        if (!existsSync(join(REPO, cited)))
          err(
            `${at} traceability.md cites \`${cited}\` which does not exist — a table pointing at a deleted file is a lie, not a record`,
          );
      }
    }

    // 3. every US/AC cited in spec.md resolves
    for (const us of new Set(
      [...specText.matchAll(/US-\d{3}/g)].map((x) => x[0]),
    )) {
      if (!storyAcs.has(us))
        err(
          `${at} spec.md cites ${us} which is not a story in inception/stories/user-stories/`,
        );
    }
    // A bare AC-## is a claim about this package's own story; a qualified
    // US-###/AC-## is a claim about that story — each is checked against the
    // story it actually names (same pair format qa-coverage's CITATION parses).
    const storyOfPkg = name.match(/^US-\d{3}/)?.[0];
    const seenAc = new Set();
    for (const m of specText.matchAll(/(?:(US-\d{3})\/)?\b(AC-\d{2})\b/g)) {
      const owner = m[1] ?? storyOfPkg;
      if (!owner || !storyAcs.has(owner)) continue; // unknown US already erred above
      const key = `${owner}/${m[2]}`;
      if (seenAc.has(key)) continue;
      seenAc.add(key);
      if (!storyAcs.get(owner).has(m[2]))
        err(`${at} spec.md cites ${m[2]} which ${owner} does not define`);
    }

    // Jira is a mirror, never load-bearing (ADR-002): where the integration is
    // installed, a spec package whose story carries no ticket key gets a
    // warning — a client following the board cannot see this work — and never
    // an error: Jira going away must not break the build.
    const storyEntry = storyOfPkg && manifest?.stories?.[storyOfPkg];
    if (
      existsSync(join(REPO, 'ai', 'templates', 'jira')) &&
      storyEntry &&
      !storyEntry.jira
    )
      warn(
        `${at} ${storyOfPkg} has no jira key in the manifest — a client following the board cannot see this work`,
      );

    // 4. the package has a row in the index
    if (!indexText.includes(name))
      err(
        `${at} no row in inception/specs/index.md — the catalog is how the next developer finds an existing package instead of writing a second one`,
      );

    // 5-6. the Gate D1 approval block, when the plan carries one. A near-miss —
    // a heading or Status cell that ALMOST matches — is an error, not a skip: a
    // gate that silently disables itself on a hand-edit is no gate.
    const planPath = join(pkgDir, 'implementation-plan.md');
    if (!existsSync(planPath)) continue;
    const planText = read(planPath);
    const APPROVAL_HEAD = /^##\s+Approval\s+—\s+Gate D1\s*$/m;
    if (!APPROVAL_HEAD.test(planText)) {
      if (/^##.*\bapproval\b.*gate\s*d1/im.test(planText))
        err(
          `${at} implementation-plan.md has an approval-like heading that is not exactly "## Approval — Gate D1" (em dash) — the audit cannot see it, fix the heading`,
        );
      continue;
    }
    // Fields come from the approval section only — a "| Status |" cell in some
    // earlier step table must not stand in for the approval's.
    const section =
      planText.split(/^(?=##\s)/m).find((s) => APPROVAL_HEAD.test(s)) ?? '';
    const field = (label) =>
      section.match(
        new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|`, 'm'),
      )?.[1] ?? '';
    const status = field('Status');
    if (!/^approved$/i.test(status)) {
      if (/^approved\b/i.test(status))
        err(
          `${at} implementation-plan.md approval Status "${status}" is not exactly "approved" — a decorated cell disables the audit, so it is an error`,
        );
      continue;
    }
    const by = field('Approved by');
    const on = field('Approved on');
    const sha = field('Plan commit approved');
    if (!/@/.test(by))
      err(
        `${at} implementation-plan.md is approved but names no approver with an email — Gate D1 records name and email from git config, or asks the human`,
      );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on))
      err(
        `${at} implementation-plan.md approval date "${on}" is not an ISO date (YYYY-MM-DD)`,
      );
    if (!/^[0-9a-f]{7,40}$/.test(sha)) {
      err(
        `${at} implementation-plan.md approval records no plan commit — that SHA is what makes the approval verifiable`,
      );
    } else if (!reachableSha(sha)) {
      // Fail closed on a full clone: there, an unreachable SHA is an approval
      // this repository never saw. CI fetches full history (fetch-depth: 0)
      // precisely so this branch can be an error rather than a shrug.
      const msg = `${at} approved plan commit ${sha} is not reachable here — cannot verify the plan is unchanged since approval`;
      if (shallowRepo) warn(`${msg} (shallow clone — fetch full history to verify)`);
      else err(msg);
    } else {
      let approvedPlan = '';
      try {
        approvedPlan = execFileSync(
          'git',
          ['show', `${sha}:${rel(planPath)}`],
          { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).replace(/\r\n/g, '\n');
      } catch {
        warn(
          `${at} implementation-plan.md did not exist at ${sha} — the approved SHA should be the commit the human read`,
        );
      }
      // Compare the plan WITHOUT its approval block: stamping the approval is
      // itself a change to the file, so a naive diff always differs. Splitting on
      // headings (rather than a lookahead) keeps this correct when the approval
      // block is the last section in the file.
      const strip = (t) =>
        t
          .split(/^(?=##\s)/m)
          .filter((sec) => !/^##\s+Approval\s+—\s+Gate D1/.test(sec))
          .join('');
      if (approvedPlan && strip(approvedPlan) !== strip(planText)) {
        const logPath = join(pkgDir, 'change-log.md');
        const logText = existsSync(logPath) ? read(logPath) : '';
        // Only a row dated on/after the approval covers a post-approval edit —
        // one old row must not license every future edit.
        const logged = [
          ...logText.matchAll(/^\|\s*(\d{4}-\d{2}-\d{2})/gm),
        ].some((x) => x[1] >= on);
        if (!logged)
          err(
            `${at} implementation-plan.md changed after its Gate D1 approval (${sha}) with no change-log.md row dated ${on} or later — see it with: git diff ${sha} -- ${rel(planPath)}`,
          );
      }
    }
  }
}

// ---- report ------------------------------------------------------------------
for (const w of warnings) console.log(`warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\naidlc-check: ${errors.length} error(s)`);
  process.exit(1);
}
// The framework version is stamped into the lock, so it reports what this repo
// actually runs — visible on every CI run without anyone having to try an update.
const stampedVersion = existsSync(LOCK_PATH)
  ? JSON.parse(read(LOCK_PATH)).version
  : undefined;
console.log(
  `aidlc-check: OK (framework ${stampedVersion ?? 'version unknown'}, ${defs.size} IDs, ${warnings.length} warnings)`,
);
