// Builds the per-tool persona surfaces (Cursor, opencode, GitHub Copilot)
// from this repo's single sources of truth: the persona skills in
// .claude/skills/ and the persona agents in .claude/agents/ (hand-edited
// source, which themselves defer to the charters in ai/roles/).
//
// Output is a build artifact — never hand-edit the generated files:
//   .cursor/skills|commands|agents, .opencode/skills|commands|agents,
//   .github/skills|prompts|agents  (persona files only; the Nx-generated
//   files sharing those directories are not touched).
//
//   node tools/aidlc-build-surfaces.mjs           rebuild the surfaces
//   node tools/aidlc-build-surfaces.mjs --check   exit 1 on drift (CI, check 13)
//
// Enforcement parity is uneven and deliberate (ADR-005): opencode agents keep
// the read-only guarantee at tool level (write/edit denied); Cursor and
// Copilot have no per-agent tool restriction, so their read-only personas get
// an explicit charter notice injected instead. In the framework source repo a
// removed persona's generated files are swept (and --check flags them); in
// adopting repos the shared directories are never swept wholesale.
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

// CRLF-normalized reads: Windows autocrlf checkouts must parse and compare like LF ones
function read(p) {
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const REPO = process.cwd();
const PERSONAS = [
  'aidlc',
  'ba',
  'ux',
  'architect',
  'dev',
  'qa',
  'devops',
  'manager',
];
const AGENT_PERSONAS = PERSONAS.filter((p) => p !== 'aidlc'); // router is a command only
const READ_ONLY = ['architect', 'manager'];

const READ_ONLY_NOTE =
  '> **Read-only persona.** This tool cannot restrict your tools, so the charter rule stands on you: never create or edit repository files. Draft any content (ADRs, reports) into your reply for a writable persona or the human to land through a reviewed PR.';

function parse(path) {
  const text = read(path);
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${path}: no frontmatter`);
  const desc = m[1].match(/^description:\s*(.+)$/m)?.[1];
  if (!desc) throw new Error(`${path}: no single-line description`);
  return { full: text, fm: m[1], body: text.slice(m[0].length).replace(/^\n+/, ''), desc };
}

function withNote(body) {
  const lines = body.split('\n');
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  lines.splice(h1 + 1, 0, '', READ_ONLY_NOTE);
  return lines.join('\n');
}

// ---- assemble the expected surfaces as [repo-relative path -> content] ------
const files = new Map();

// A repo may install only some personas — `aidlc-scaffold --profile e2e` in a
// standalone QA repo ships qa and nothing else. Absent source = nothing to
// generate, not a crash; check 10 is what enforces completeness where it matters.
for (const p of PERSONAS) {
  const src = join(REPO, '.claude', 'skills', p, 'SKILL.md');
  if (!existsSync(src)) continue;
  const skill = parse(src);

  // skills: the Agent Skills format is shared by all three tools — mirror verbatim
  for (const dir of ['.cursor', '.opencode', '.github']) {
    files.set(join(dir, 'skills', p, 'SKILL.md'), skill.full);
  }

  // typed commands: /<p> in each tool
  files.set(join('.cursor', 'commands', `${p}.md`), skill.body); // Cursor commands take plain markdown
  const fronted = `---\ndescription: ${skill.desc}\n---\n\n${skill.body}`;
  files.set(join('.opencode', 'commands', `${p}.md`), fronted);
  files.set(join('.github', 'prompts', `${p}.prompt.md`), fronted);
}

for (const p of AGENT_PERSONAS) {
  const agentSrc = join(REPO, '.claude', 'agents', `aidlc-${p}.md`);
  if (!existsSync(agentSrc)) continue;
  const agent = parse(agentSrc);
  const ro = READ_ONLY.includes(p);
  const guarded = ro ? withNote(agent.body) : agent.body;

  files.set(
    join('.cursor', 'agents', `aidlc-${p}.md`),
    `---\nname: aidlc-${p}\ndescription: ${agent.desc}\n---\n\n${guarded}`,
  );
  files.set(
    join('.opencode', 'agents', `aidlc-${p}.md`),
    `---\ndescription: ${agent.desc}\nmode: subagent\n${
      ro ? 'tools:\n  write: false\n  edit: false\n' : ''
    }---\n\n${agent.body}`, // opencode enforces read-only at tool level — no notice needed
  );
  files.set(
    join('.github', 'agents', `aidlc-${p}.agent.md`),
    `---\ndescription: ${agent.desc}\n---\n\n${guarded}`,
  );
}

// ---- write or check ----------------------------------------------------------
const check = process.argv.includes('--check');
let drift = 0;
for (const [rel, content] of files) {
  const target = join(REPO, rel);
  if (check) {
    if (!existsSync(target) || read(target) !== content) {
      console.error(`DRIFT: ${rel} does not match its .claude/ source`);
      drift++;
    }
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

// ---- orphans: a deleted source must take its surfaces with it ----------------
// Only in the framework source repo (marked by packages/aidlc-plugin): there
// these directories hold nothing but this tool's output, so an unexpected file
// is a leftover from a removed persona. Adopting repos share the directories
// with their own files and are left alone.
if (existsSync(join(REPO, 'packages', 'aidlc-plugin'))) {
  const OWNED = [
    ...['.cursor', '.opencode'].flatMap((d) =>
      ['skills', 'commands', 'agents'].map((s) => join(d, s)),
    ),
    ...['skills', 'prompts', 'agents'].map((s) => join('.github', s)),
  ];
  for (const dir of OWNED) {
    if (!existsSync(join(REPO, dir))) continue;
    for (const sub of readdirSync(join(REPO, dir), { recursive: true })) {
      const rel = join(dir, sub);
      if (!statSync(join(REPO, rel)).isFile() || files.has(rel)) continue;
      if (check) {
        console.error(`DRIFT: ${rel} has no .claude/ source — orphaned surface`);
        drift++;
      } else {
        rmSync(join(REPO, rel));
        console.log(`removed orphaned surface ${rel}`);
      }
    }
  }
}
if (check) {
  if (drift) {
    console.error(
      `\n${drift} surface file(s) drifted. Run: node tools/aidlc-build-surfaces.mjs`,
    );
    process.exit(1);
  }
  console.log(`tool surfaces in sync (${files.size} files)`);
} else {
  console.log(`wrote ${files.size} files across .cursor/, .opencode/, .github/`);
}
