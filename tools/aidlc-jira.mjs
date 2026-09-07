// aidlc-jira — the ONLY writer to Jira. Rules: ai/context/jira-sync.md
//
//   node tools/aidlc-jira.mjs --story US-003            dry run: print the payload
//   node tools/aidlc-jira.mjs --story US-003 --tests    also a test ticket per AC
//   node tools/aidlc-jira.mjs --epic EPIC-001
//   node tools/aidlc-jira.mjs --bug 12                 from a GitHub `bug` issue
//   node tools/aidlc-jira.mjs --change-request 12
//   node tools/aidlc-jira.mjs --story US-003 --apply    actually write
//
// Dry run is the DEFAULT and needs no credentials — so the exact text a client
// will read is reviewable in a pull request before it reaches a live board.
//
// Two invariants this file exists to enforce:
//   1. Approval never travels. Nothing here writes a status transition, a
//      sign-off field, or anything else that could be mistaken for a gate
//      approval. Approval is a GitHub review; see ai/gates/*.md.
//   2. Jira owns portfolio mechanics. Sprint, assignee, estimate and worklog
//      are never written, so the repository never becomes a second opinion
//      about them.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// CRLF-normalized reads: Windows autocrlf checkouts must parse and compare like LF ones
function read(p) {
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const REPO = process.cwd();
const TPL = join(REPO, 'ai', 'templates', 'jira');
const MANIFEST = join(REPO, 'knowledge', 'traceability', 'manifest.json');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const WITH_TESTS = args.includes('--tests');
// v3 (Cloud) takes ADF; v2 (Server/DC) takes wiki markup. Default v3 because
// Cloud stores rich text as ADF — override for a Server/DC instance.
const API = (
  args.includes('--api') ? args[args.indexOf('--api') + 1] : 'v3'
).replace(/^v?/, 'v');
if (!['v2', 'v3'].includes(API)) {
  console.error(`aidlc-jira: --api must be v2 or v3, got "${API}"`);
  process.exit(1);
}
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

const die = (m) => {
  console.error(`aidlc-jira: ${m}`);
  process.exit(1);
};

// ---- fields we refuse to write, no matter what a template or task says -----
// Approval-bearing (invariant 1) and Jira-owned (invariant 2).
export const FORBIDDEN = [
  'status',
  'resolution',
  'transition',
  'approval',
  'approvals',
  'approver',
  'signoff',
  'sign_off',
  'sprint',
  'assignee',
  'reporter',
  'duedate',
  'timetracking',
  'timeestimate',
  'timeoriginalestimate',
  'storypoints',
  'story_points',
  'worklog',
  'votes',
];
const forbidden = (key) => {
  const k = key.toLowerCase().replace(/[\s-]/g, '');
  return FORBIDDEN.some(
    (f) => k === f.replace(/_/g, '') || k.includes(f.replace(/_/g, '')),
  );
};

// ---- every placeholder a template may use ---------------------------------
export const KNOWN_PLACEHOLDERS = [
  'STORY_ID',
  'EPIC_ID',
  'TITLE',
  'STORY_STATEMENT',
  'GOAL',
  'REQ_LIST',
  'AC_LIST',
  'SCREEN_LIST',
  'STORY_LIST',
  'OPEN_QUESTIONS',
  'REPO_STATE',
  'ARTIFACT_URL',
  'PR_URL',
  'AC_ID',
  'AC_TITLE',
  'AC_BODY',
  'TEST_NAME',
  'TEST_FILE',
  'RESULT',
  'CI_RUN_URL',
  'ISSUE_NUMBER',
  'ISSUE_URL',
  'REQUESTER_WORDS',
  'BLAST_RADIUS',
  'DECISION_OWNER',
  'STEPS',
  'EXPECTED',
  'ACTUAL',
  'ENVIRONMENT',
  'SEVERITY',
  'JIRA_KEY',
  'STORY_KEY',
  'EPIC_KEY',
];

// ---- template parsing ------------------------------------------------------
// Minimal frontmatter: `key: value` and `key: [a, b]`. Deliberately not a full
// YAML parser — a ticket template that needs one is too clever.
export function parseTemplate(text, name = '<inline>') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${name}: missing --- frontmatter --- block`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) throw new Error(`${name}: cannot parse frontmatter line: ${line}`);
    const key = kv[1];
    let raw = kv[2].trim();
    let value;
    if (raw.startsWith('[')) {
      value = raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      value = raw.replace(/^['"]|['"]$/g, '');
    }
    fields[key] = value;
  }
  return { fields, body: m[2] };
}

export function templateIssues(text, name) {
  const problems = [];
  let parsed;
  try {
    parsed = parseTemplate(text, name);
  } catch (e) {
    return [e.message];
  }
  for (const key of Object.keys(parsed.fields)) {
    if (forbidden(key))
      problems.push(
        `${name}: declares "${key}" — refused. It either forwards approval or duplicates what Jira owns (ai/context/jira-sync.md)`,
      );
  }
  const all = text.match(/\$\{([A-Z_]+)\}/g) ?? [];
  for (const raw of new Set(all)) {
    const ph = raw.slice(2, -1);
    if (!KNOWN_PLACEHOLDERS.includes(ph))
      problems.push(
        `${name}: unknown placeholder \${${ph}} — add it to KNOWN_PLACEHOLDERS or fix the typo`,
      );
  }
  if (/\{\{[A-Z_]+\}\}/.test(text))
    problems.push(
      `${name}: uses {{NAME}} — double braces are monospace in Jira wiki markup and would render literally. Use \${NAME}`,
    );
  // Templates are markdown; the tool converts at the API boundary. Wiki markup
  // left in a template would be double-converted and reach a client as noise.
  const wikiLeftovers = [
    [/^h[1-6]\.\s/m, 'h2. style headings — use ## instead'],
    [/^\|\|/m, '|| table headers — use a markdown | table |'],
    [/\{\{[^}]*\}\}/, '{{monospace}} — use `backticks`'],
    [/^----+$/m, '---- rules — use ---'],
    [/\{quote\}/, '{quote} — use > blockquotes'],
    [/\{color[:#]/, '{color} macros — Jira wiki markup, not markdown'],
  ];
  for (const [re, why] of wikiLeftovers)
    if (re.test(parsed.body))
      problems.push(
        `${name}: contains Jira wiki markup (${why}). Templates are authored in markdown`,
      );
  if (!parsed.fields.issuetype) problems.push(`${name}: no issuetype`);
  if (!parsed.fields.summary) problems.push(`${name}: no summary`);
  return problems;
}

export function validateTemplates(dir = TPL) {
  if (!existsSync(dir)) return [`${dir} does not exist`];
  const problems = [];
  const required = [
    'epic.md',
    'story.md',
    'test.md',
    'bug.md',
    'change-request.md',
  ];
  for (const f of required) {
    if (!existsSync(join(dir, f)))
      problems.push(`missing template ai/templates/jira/${f}`);
  }
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    problems.push(
      ...templateIssues(
        read(join(dir, f)),
        `ai/templates/jira/${f}`,
      ),
    );
  }
  return problems;
}

// aidlc-check imports validateTemplates() from this file, so the CLI must not
// run on import — and it is dispatched at the BOTTOM, after every declaration
// below is initialised.
const IS_CLI = Boolean(process.argv[1]?.endsWith('aidlc-jira.mjs'));

const USAGE = `aidlc-jira — the only writer to Jira (rules: ai/context/jira-sync.md)

  --story US-003            dry run: print the ticket payload
  --story US-003 --tests    also one test ticket per acceptance criterion
  --epic EPIC-001
  --bug 12                  from a GitHub issue labelled bug
  --change-request 12
  --api v2|v3               wire format: v2 wiki markup, v3 ADF (default v3)
  --apply                   actually create or update

Dry run is the default and needs no credentials, so the exact text a client
will read can be reviewed in a pull request first. Approval is never written.`;

// ---- repo readers ----------------------------------------------------------
const sh = (cmd, a) => {
  try {
    return execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

function repoSlug() {
  const url = sh('git', ['remote', 'get-url', 'origin']);
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function blobUrl(path) {
  const slug = repoSlug();
  return slug ? `https://github.com/${slug}/blob/main/${path}` : path;
}

// "Approved" means the artifact exists on the default branch — i.e. a human
// review merged it. Anything else is honestly a draft, and the ticket says so,
// which is what stops the board implying agreement that does not exist.
function existsOnRef(ref, path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
function repoState(path) {
  const merged = ['origin/main', 'main'].some((ref) => existsOnRef(ref, path));
  return merged ? 'Approved' : 'Draft — awaiting approval';
}

function prUrlFor(id) {
  const out = sh('gh', [
    'pr',
    'list',
    '--search',
    id,
    '--state',
    'all',
    '--json',
    'url',
    '--limit',
    '1',
  ]);
  try {
    return JSON.parse(out)[0]?.url ?? '—';
  } catch {
    return '—';
  }
}

const manifest = () => JSON.parse(read(MANIFEST));

function brdRequirements() {
  const map = new Map();
  const dir = join(REPO, 'inception', 'product', 'requirements');
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    for (const line of read(join(dir, f)).split('\n')) {
      const m = line.match(/^\|\s*((?:REQ|NFR|RISK)-\d{3})\s*\|(.*)$/);
      if (!m) continue;
      // REQ rows put the requirement in column 2; NFR rows put a category there
      // and the requirement in column 3. Take the most substantial cell rather
      // than hardcoding a column per prefix.
      const cells = m[2]
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      const text =
        cells.slice(0, 2).sort((a, b) => b.length - a.length)[0] ?? '';
      if (text) map.set(m[1], text);
    }
  }
  return map;
}

function storyFile(us) {
  const dir = join(REPO, 'inception', 'stories', 'user-stories');
  const f = readdirSync(dir).find((x) => x.startsWith(us));
  if (!f) die(`no story file for ${us}`);
  return {
    path: join('inception/stories/user-stories', f),
    text: read(join(dir, f)),
  };
}

function section(text, heading) {
  const re = new RegExp(
    `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`,
    'm',
  );
  return (text.match(re)?.[1] ?? '').trim();
}

function acBlocks(text) {
  const out = [];
  const re = /^###\s+(AC-\d{2})\s+(.+?)$([\s\S]*?)(?=^###\s|^##\s|\Z)/gm;
  let m;
  while ((m = re.exec(text)))
    out.push({ id: m[1], title: m[2].trim(), body: m[3].trim() });
  return out;
}

// Templates and every value are authored in MARKDOWN. Jira accepts neither —
// it takes wiki markup on API v2 (Server/DC) and Atlassian Document Format on
// v3 (Cloud, which stores rich text as ADF). Converting at this one boundary
// keeps the format question out of the template files.
const md = (s) => String(s ?? '').trim();

// ---- shared block splitter -------------------------------------------------
// The subset the templates use: headings, paragraphs, bullet lists, block
// quotes, pipe tables, and rules. Anything else stays a paragraph.
function blocks(source) {
  const lines = md(source).split('\n');
  const out = [];
  let i = 0;
  const isTable = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l) => /^\s*\|[\s|:-]+\|\s*$/.test(l);

  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      out.push({ type: 'heading', level: m[1].length, text: m[2].trim() });
      i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      out.push({ type: 'rule' });
      i++;
    } else if (/^\s*[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i++;
      }
      out.push({ type: 'list', items });
    } else if (/^\s*>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, '').trim());
        i++;
      }
      out.push({ type: 'quote', text: q.join(' ').trim() });
    } else if (isTable(l)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) {
        if (!isSep(lines[i]))
          rows.push(
            lines[i]
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((c) => c.trim()),
          );
        i++;
      }
      out.push({ type: 'table', rows });
    } else {
      const p = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|\s*[-*]\s|\s*>|\s*\|)/.test(lines[i]) &&
        !/^\s*-{3,}\s*$/.test(lines[i])
      ) {
        p.push(lines[i].trim());
        i++;
      }
      if (p.length) out.push({ type: 'para', text: p.join('\n') });
      else i++;
    }
  }
  return out;
}

// ---- markdown → Jira wiki markup (REST API v2) -----------------------------
const inlineWiki = (s) =>
  s
    .replace(/`([^`]+)`/g, '{{$1}}')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');

export function mdToWiki(source) {
  return blocks(source)
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `h${b.level}. ${inlineWiki(b.text)}`;
        case 'rule':
          return '----'; // in wiki markup `---` is an em dash, not a rule
        case 'list':
          return b.items.map((t) => `* ${inlineWiki(t)}`).join('\n');
        case 'quote':
          return `{quote}\n${inlineWiki(b.text)}\n{quote}`;
        case 'table':
          return b.rows
            .map((r, idx) =>
              idx === 0
                ? `|| ${r.map(inlineWiki).join(' || ')} ||`
                : `| ${r.map(inlineWiki).join(' | ')} |`,
            )
            .join('\n');
        default:
          return inlineWiki(b.text);
      }
    })
    .join('\n\n');
}

// ---- markdown → Atlassian Document Format (REST API v3) --------------------
// Inline tokenizer: code first (its content is literal), then link, strong, em.
function inlineAdf(s) {
  const nodes = [];
  const re =
    /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|(?<![\w*])_(.+?)_(?![\w*])/g;
  let last = 0;
  let m;
  const push = (text, marks) => {
    if (!text) return;
    nodes.push(
      marks?.length ? { type: 'text', text, marks } : { type: 'text', text },
    );
  };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index));
    if (m[1] !== undefined) push(m[1], [{ type: 'code' }]);
    else if (m[2] !== undefined)
      push(m[2], [{ type: 'link', attrs: { href: m[3] } }]);
    else if (m[4] !== undefined) push(m[4], [{ type: 'strong' }]);
    else if (m[5] !== undefined) push(m[5], [{ type: 'em' }]);
    last = re.lastIndex;
  }
  push(s.slice(last));
  return nodes.length ? nodes : [{ type: 'text', text: ' ' }];
}

const adfPara = (text) => ({ type: 'paragraph', content: inlineAdf(text) });

export function mdToAdf(source) {
  const content = [];
  for (const b of blocks(source)) {
    switch (b.type) {
      case 'heading':
        content.push({
          type: 'heading',
          attrs: { level: Math.min(6, b.level) },
          content: inlineAdf(b.text),
        });
        break;
      case 'rule':
        content.push({ type: 'rule' });
        break;
      case 'list':
        content.push({
          type: 'bulletList',
          content: b.items.map((t) => ({
            type: 'listItem',
            content: [adfPara(t)],
          })),
        });
        break;
      case 'quote':
        content.push({ type: 'blockquote', content: [adfPara(b.text)] });
        break;
      case 'table':
        content.push({
          type: 'table',
          attrs: { isNumberColumnEnabled: false, layout: 'default' },
          content: b.rows.map((r, idx) => ({
            type: 'tableRow',
            content: r.map((c) => ({
              type: idx === 0 ? 'tableHeader' : 'tableCell',
              attrs: {},
              content: [adfPara(c)],
            })),
          })),
        });
        break;
      default:
        for (const line of b.text.split('\n')) content.push(adfPara(line));
    }
  }
  return { type: 'doc', version: 1, content };
}

function screenStates(scr, mf) {
  return (mf.screens?.[scr]?.states ?? []).length;
}

function openQuestionsFor(us, mf) {
  const rows = [];
  for (const scr of mf.stories[us]?.screens ?? []) {
    const path = mf.screens?.[scr]?.artifact;
    if (!path || !existsSync(join(REPO, path))) continue;
    for (const line of read(join(REPO, path)).split('\n')) {
      const m = line.match(
        /^\|\s*\d+\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*open\s*\|/i,
      );
      if (m)
        rows.push(`- ${m[1].trim()} — _decision needed from ${m[2].trim()}_`);
    }
  }
  const { text } = storyFile(us);
  for (const line of text.split('\n')) {
    const m = line.match(/TBD[^.\n]*/);
    if (m && rows.length < 8) rows.push(`- ${m[0].trim()}`);
  }
  return rows.length ? rows.join('\n') : 'None outstanding.';
}

// ---- fill --------------------------------------------------------------
function render(tplName, values) {
  const raw = read(join(TPL, tplName));
  const problems = templateIssues(raw, `ai/templates/jira/${tplName}`);
  if (problems.length) die(problems.join('\n'));
  const { fields, body } = parseTemplate(raw, tplName);

  const sub = (s) =>
    String(s).replace(/\$\{([A-Z_]+)\}/g, (_, k) =>
      values[k] === undefined ? '' : String(values[k]),
    );

  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (forbidden(k))
      die(`template ${tplName} declares forbidden field "${k}"`);
    const filled = Array.isArray(v) ? v.map(sub) : sub(v);
    // An unresolved parent/priority becomes absent rather than an empty string.
    if (filled === '' || (Array.isArray(filled) && filled.length === 0))
      continue;
    out[k] = filled;
  }
  out.description = sub(body)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

function payloadFor(fields) {
  const project = process.env.JIRA_PROJECT_KEY || 'PROJ';
  const p = {
    fields: {
      project: { key: project },
      issuetype: { name: fields.issuetype },
      summary: fields.summary,
      // The one place the wire format is decided.
      description:
        API === 'v3'
          ? mdToAdf(fields.description)
          : mdToWiki(fields.description),
    },
  };
  if (fields.labels) p.fields.labels = fields.labels;
  if (fields.priority) p.fields.priority = { name: fields.priority };
  if (fields.parent) p.fields.parent = { key: fields.parent };
  return p;
}

// ---- builders --------------------------------------------------------------
function buildStory(us) {
  const mf = manifest();
  const entry = mf.stories?.[us] ?? die(`${us} is not in the manifest`);
  const { path, text } = storyFile(us);
  const reqs = brdRequirements();
  const acs = acBlocks(text);

  const values = {
    STORY_ID: us,
    TITLE: text.match(/^#\s+US-\d{3}\s*—\s*(.+)$/m)?.[1]?.trim() ?? us,
    STORY_STATEMENT: md(section(text, 'Story')),
    REQ_LIST:
      entry.requirements
        .map(
          (r) => `- **${r}** — ${reqs.get(r) ?? '(text not found in the BRD)'}`,
        )
        .join('\n') || '_none recorded_',
    AC_LIST:
      acs.map((a) => `#### ${a.id} — ${a.title}\n${md(a.body)}`).join('\n\n') ||
      '_none recorded_',
    SCREEN_LIST:
      (entry.screens ?? [])
        .map((s) => `- **${s}** — ${screenStates(s, mf)} states specified`)
        .join('\n') || '_No screen — this story has no user interface._',
    OPEN_QUESTIONS: openQuestionsFor(us, mf),
    REPO_STATE: repoState(path),
    ARTIFACT_URL: blobUrl(path),
    PR_URL: prUrlFor(us),
    EPIC_KEY: mf.epics?.[text.match(/EPIC-\d{3}/)?.[0]]?.jira ?? '',
  };
  return {
    name: us,
    tpl: 'story.md',
    fields: render('story.md', values),
    acs,
    entry,
  };
}

function buildTests(us, storyKey) {
  const mf = manifest();
  const entry = mf.stories[us];
  const { path, text } = storyFile(us);
  const tests = entry.tests ?? [];
  const contents = tests
    .filter((t) => existsSync(join(REPO, t)))
    .map((t) => ({ file: t, text: read(join(REPO, t)) }));

  return acBlocks(text).map((ac) => {
    const hit = contents.find((c) =>
      new RegExp(
        `(?<![\\w.])(?:it|test)\\s*\\(\\s*[\`'"][^\`'"\\n]*${us}/${ac.id}`,
      ).test(c.text),
    );
    const values = {
      STORY_ID: us,
      STORY_KEY: storyKey ?? '',
      AC_ID: ac.id,
      AC_TITLE: ac.title,
      AC_BODY: md(ac.body),
      TEST_NAME: hit
        ? (hit.text.match(
            new RegExp(`[\`'"]([^\`'"\\n]*${us}/${ac.id}[^\`'"\\n]*)`),
          )?.[1] ?? `${us}/${ac.id}`)
        : '—',
      TEST_FILE: hit ? hit.file : '—',
      // Never a pass we did not observe. No test at all is stated as such.
      RESULT: hit ? 'Pass' : 'Not yet automated',
      CI_RUN_URL: hit ? lastCiRun() : '—',
      ARTIFACT_URL: blobUrl(path),
    };
    return {
      name: `${us}/${ac.id}`,
      tpl: 'test.md',
      fields: render('test.md', values),
    };
  });
}

function lastCiRun() {
  const out = sh('gh', [
    'run',
    'list',
    '--limit',
    '1',
    '--json',
    'url,conclusion',
  ]);
  try {
    const r = JSON.parse(out)[0];
    return r?.url ?? '—';
  } catch {
    return '—';
  }
}

function buildEpic(id) {
  const dir = join(REPO, 'inception', 'stories', 'epics');
  const f =
    readdirSync(dir).find((x) => x.startsWith(id)) ??
    die(`no epic file for ${id}`);
  const path = join('inception/stories/epics', f);
  const text = read(join(dir, f));
  const mf = manifest();
  const stories = [
    ...text.matchAll(/^\|\s*(US-\d{3})\s*\|\s*([^|]+?)\s*\|/gm),
  ].map(
    (m) =>
      `- **${m[1]}** — ${m[2].trim()}${mf.stories?.[m[1]]?.jira ? ` (\`${mf.stories[m[1]].jira}\`)` : ''}`,
  );
  const values = {
    EPIC_ID: id,
    TITLE: text.match(/^#\s+EPIC-\d{3}\s*—\s*(.+)$/m)?.[1]?.trim() ?? id,
    GOAL: md(section(text, 'Goal')),
    STORY_LIST: stories.join('\n') || '_none yet_',
    OPEN_QUESTIONS: 'None outstanding.',
    REPO_STATE: repoState(path),
    ARTIFACT_URL: blobUrl(path),
  };
  return { name: id, tpl: 'epic.md', fields: render('epic.md', values) };
}

function ghIssue(n) {
  const out = sh('gh', [
    'issue',
    'view',
    String(n),
    '--json',
    'number,title,body,url,labels',
  ]);
  if (!out) die(`cannot read GitHub issue #${n} (is gh authenticated?)`);
  return JSON.parse(out);
}

function fromIssueBody(body, heading) {
  const re = new RegExp(
    `###\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s|$)`,
    'i',
  );
  return (body.match(re)?.[1] ?? '').trim();
}

function buildBug(n) {
  const i = ghIssue(n);
  const values = {
    ISSUE_NUMBER: `#${i.number}`,
    TITLE: i.title.replace(/^\s*\[?bug\]?:?\s*/i, ''),
    ACTUAL: md(fromIssueBody(i.body, 'Actual.*')) || '_see the linked report_',
    EXPECTED:
      md(fromIssueBody(i.body, 'Expected.*')) || '_see the linked report_',
    STEPS:
      md(fromIssueBody(i.body, '.*[Rr]eproduc.*')) || '_see the linked report_',
    ENVIRONMENT: fromIssueBody(i.body, 'Environment') || '_not stated_',
    SEVERITY:
      i.labels.find((l) => /^(blocker|critical|major|minor)$/i.test(l.name))
        ?.name ?? 'Medium',
    STORY_ID: i.body.match(/US-\d{3}/)?.[0] ?? '—',
    AC_ID: i.body.match(/AC-\d{2}/)?.[0] ?? '—',
    ARTIFACT_URL: blobUrl('inception/stories/user-stories'),
    ISSUE_URL: i.url,
    PR_URL: prUrlFor(`#${i.number}`),
  };
  return { name: `bug #${n}`, tpl: 'bug.md', fields: render('bug.md', values) };
}

function buildChangeRequest(n) {
  const i = ghIssue(n);
  const mf = manifest();
  const cited = [
    ...new Set([...i.body.matchAll(/(?:REQ|NFR)-\d{3}/g)].map((m) => m[0])),
  ];
  const blast = cited.flatMap((r) => {
    const st = mf.requirements?.[r]?.stories ?? [];
    return [
      `- **${r}** — ${st.length ? `affects ${st.join(', ')}` : 'no story yet'}`,
    ];
  });
  const values = {
    ISSUE_NUMBER: `#${i.number}`,
    TITLE: i.title.replace(/^\s*\[?change[- ]request\]?:?\s*/i, ''),
    REQUESTER_WORDS:
      md(fromIssueBody(i.body, '.*[Rr]equest.*')) || md(i.body.slice(0, 600)),
    BLAST_RADIUS: blast.join('\n') || '_nothing traced yet — needs analysis_',
    DECISION_OWNER: fromIssueBody(i.body, '.*[Oo]wner.*') || 'Product owner',
    REPO_STATE: 'Draft — awaiting approval',
    ISSUE_URL: i.url,
    PR_URL: prUrlFor(`#${i.number}`),
  };
  return {
    name: `change-request #${n}`,
    tpl: 'change-request.md',
    fields: render('change-request.md', values),
  };
}

// ---- Jira write ------------------------------------------------------------
function creds() {
  const missing = [
    'JIRA_BASE_URL',
    'JIRA_PROJECT_KEY',
    'JIRA_EMAIL',
    'JIRA_API_TOKEN',
  ].filter((k) => !process.env[k]);
  if (missing.length)
    die(
      `--apply needs ${missing.join(', ')}. Copy .env.example and fill them in; dry runs need none of them.\nNothing was written.`,
    );
  return {
    base: process.env.JIRA_BASE_URL.replace(/\/+$/, ''),
    auth:
      'Basic ' +
      Buffer.from(
        `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
      ).toString('base64'),
  };
}

async function jira(method, path, body) {
  const { base, auth } = creds();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the token, even on failure.
    die(`Jira ${method} ${path} → ${res.status}\n${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function findExisting(summaryId) {
  const jql = `project = "${process.env.JIRA_PROJECT_KEY}" AND summary ~ "${summaryId}" ORDER BY created DESC`;
  const r = await jira(
    'GET',
    `/rest/api/${API === 'v3' ? 3 : 2}/search?maxResults=1&jql=${encodeURIComponent(jql)}`,
  );
  return r.issues?.[0]?.key ?? null;
}

async function upsert(ticket) {
  const payload = payloadFor(ticket.fields);
  const idToken = ticket.fields.summary.split('—')[0].trim();
  const existing = await findExisting(idToken);
  if (existing) {
    await jira('PUT', `/rest/api/${API === 'v3' ? 3 : 2}/issue/${existing}`, {
      fields: payload.fields,
    });
    console.log(`updated ${existing}  ${ticket.fields.summary}`);
    return existing;
  }
  const created = await jira(
    'POST',
    `/rest/api/${API === 'v3' ? 3 : 2}/issue`,
    payload,
  );
  console.log(`created ${created.key}  ${ticket.fields.summary}`);
  return created.key;
}

// The key is a convenience edge for humans, not a governance edge — nothing in
// a gate reads it, which is why a missing one is only ever a warning.
function recordKey(kind, id, key) {
  const mf = manifest();
  const bucket = kind === 'epic' ? (mf.epics ??= {}) : mf.stories;
  if (!bucket[id]) return;
  bucket[id].jira = key;
  writeFileSync(MANIFEST, JSON.stringify(mf, null, 2) + '\n');
  console.log(
    `recorded ${id} → ${key} in knowledge/traceability/manifest.json`,
  );
}

// ---- main ------------------------------------------------------------------
async function main() {
  const problems = validateTemplates();
  if (problems.length) die(problems.join('\n'));

  let tickets = [];
  let kind = null;
  let id = null;

  if (flag('story')) {
    kind = 'story';
    id = flag('story');
    const s = buildStory(id);
    tickets.push(s);
    if (WITH_TESTS)
      tickets.push(...buildTests(id, manifest().stories[id]?.jira ?? ''));
  } else if (flag('epic')) {
    kind = 'epic';
    id = flag('epic');
    tickets.push(buildEpic(id));
  } else if (flag('bug')) {
    tickets.push(buildBug(flag('bug')));
  } else if (flag('change-request')) {
    tickets.push(buildChangeRequest(flag('change-request')));
  } else {
    die(
      'nothing to do. Try --story US-003, --epic EPIC-001, --bug 12, or --change-request 12',
    );
  }

  if (!APPLY) {
    console.log(
      `DRY RUN — nothing will be written. ${tickets.length} ticket(s).\n` +
        `Project: ${process.env.JIRA_PROJECT_KEY || '(JIRA_PROJECT_KEY unset — showing PROJ)'}\n` +
        `Re-run with --apply to create or update.\n`,
    );
    for (const t of tickets) {
      console.log('─'.repeat(72));
      console.log(JSON.stringify(payloadFor(t.fields), null, 2));
    }
    console.log('─'.repeat(72));
    console.log(
      `\nRefused by construction: ${FORBIDDEN.slice(0, 8).join(', ')}, … — approval stays in GitHub.`,
    );
    return;
  }

  const storyKey = kind === 'story' ? await upsert(tickets[0]) : null;
  if (storyKey) recordKey('story', id, storyKey);
  for (const t of tickets.slice(kind === 'story' ? 1 : 0)) {
    if (storyKey && t.tpl === 'test.md') t.fields.parent = storyKey;
    const key = await upsert(t);
    if (kind === 'epic') recordKey('epic', id, key);
  }
}

// ---- CLI dispatch (last, so nothing above is in its temporal dead zone) -----
if (IS_CLI) {
  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }
  await main();
}
