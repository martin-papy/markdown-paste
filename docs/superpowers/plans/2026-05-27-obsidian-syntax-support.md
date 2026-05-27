# Obsidian Syntax Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Markdown Paste module correctly handle Obsidian-exported content — YAML frontmatter → a "Properties" table, callouts (`> [!tip]`) → styled blockquotes, and wikilinks (`[[Note]]`) → plain text — when pasted into any Foundry editor.

**Architecture:** A new pure module `scripts/obsidian.js` holds three string→string pre-processors (frontmatter extraction, wikilink stripping, callout transformation) plus a frontmatter→HTML renderer. `scripts/convert.js` runs them before the existing `marked.parse → DOMPurify.sanitize` backbone when `options.obsidian` is on. Callouts and the frontmatter table are emitted as raw HTML blocks that `marked` passes through and DOMPurify sanitizes in one pass. Localized labels are injected via `options.labels` so `obsidian.js` stays Foundry-free and Node-testable.

**Tech Stack:** Vanilla ES modules (no build step), `marked` v15.0.12 + `DOMPurify` v3.4.6 (vendored), `node:test` + `jsdom` for unit tests. Spec: [docs/superpowers/specs/2026-05-27-obsidian-syntax-support-design.md](../specs/2026-05-27-obsidian-syntax-support-design.md).

**Branch:** `feature-v0.1-bootstrap` (folded into v0.1, per the spec). All commits land here.

**Test commands:**
- One file: `node --test --import ./tests/setup.js tests/obsidian.test.js`
- Full suite: `npm test`

---

### Task 1: `obsidian.js` scaffold — constants, `escapeHtml`, `canonicalType`

**Files:**
- Create: `scripts/obsidian.js`
- Test: `tests/obsidian.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/obsidian.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalType, CALLOUT_TYPES } from '../scripts/obsidian.js';

test('canonicalType returns canonical types unchanged (case-insensitive)', () => {
  assert.equal(canonicalType('tip'), 'tip');
  assert.equal(canonicalType('NOTE'), 'note');
});

test('canonicalType resolves aliases to canonical', () => {
  assert.equal(canonicalType('summary'), 'abstract');
  assert.equal(canonicalType('hint'), 'tip');
  assert.equal(canonicalType('error'), 'danger');
  assert.equal(canonicalType('cite'), 'quote');
});

test('canonicalType returns null for unknown types', () => {
  assert.equal(canonicalType('frobnicate'), null);
});

test('CALLOUT_TYPES lists the 13 canonical types', () => {
  assert.equal(CALLOUT_TYPES.length, 13);
  assert.ok(CALLOUT_TYPES.includes('tip'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `Cannot find module '../scripts/obsidian.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/obsidian.js`:

```js
// scripts/obsidian.js
// Pure Obsidian-syntax transforms. No Foundry imports — unit-testable in Node + jsdom.

const CALLOUT_EMOJI = {
  note: '📝', abstract: '📋', info: 'ℹ️', todo: '☑️', tip: '💡',
  success: '✅', question: '❓', warning: '⚠️', failure: '❌',
  danger: '⚡', bug: '🐛', example: '📑', quote: '💬',
};

const CALLOUT_ALIAS = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip', important: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger', cite: 'quote',
};

const DEFAULT_LABELS = {
  properties: 'Properties',
  callouts: {
    note: 'Note', abstract: 'Abstract', info: 'Info', todo: 'To-do', tip: 'Tip',
    success: 'Success', question: 'Question', warning: 'Warning', failure: 'Failure',
    danger: 'Danger', bug: 'Bug', example: 'Example', quote: 'Quote',
  },
};

/** The 13 canonical callout types, in display order. */
export const CALLOUT_TYPES = Object.keys(CALLOUT_EMOJI);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve a raw callout type token to its canonical type, or null if unknown.
 * @param {string} raw
 * @returns {string|null}
 */
export function canonicalType(raw) {
  const t = String(raw).toLowerCase();
  if (CALLOUT_EMOJI[t]) return t;
  if (CALLOUT_ALIAS[t]) return CALLOUT_ALIAS[t];
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "feat: add obsidian.js scaffold with callout type resolution"
```

---

### Task 2: `extractFrontmatter`

**Files:**
- Modify: `scripts/obsidian.js` (append parser + export)
- Test: `tests/obsidian.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/obsidian.test.js` (add `extractFrontmatter` to the existing import from `../scripts/obsidian.js`):

```js
import { extractFrontmatter } from '../scripts/obsidian.js';

test('extractFrontmatter returns null when there is no leading fence', () => {
  const r = extractFrontmatter('# Title\n\nBody');
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, '# Title\n\nBody');
});

test('extractFrontmatter parses scalars and strips the block from the body', () => {
  const r = extractFrontmatter('---\ntype: pnj\nchapitre: 1\n---\n\n# Body');
  assert.deepEqual(r.frontmatter, [['type', 'pnj'], ['chapitre', '1']]);
  assert.equal(r.body, '# Body');
});

test('extractFrontmatter joins block lists with commas', () => {
  const r = extractFrontmatter('---\ntags:\n  - pnj\n  - victime\n---\nBody');
  assert.deepEqual(r.frontmatter, [['tags', 'pnj, victime']]);
});

test('extractFrontmatter joins inline lists with commas', () => {
  const r = extractFrontmatter('---\ntags: [a, b, c]\n---\nx');
  assert.deepEqual(r.frontmatter, [['tags', 'a, b, c']]);
});

test('extractFrontmatter strips surrounding quotes from scalars', () => {
  const r = extractFrontmatter('---\nstatut: "prêt"\n---\nx');
  assert.deepEqual(r.frontmatter, [['statut', 'prêt']]);
});

test('extractFrontmatter preserves key order', () => {
  const r = extractFrontmatter('---\nz: 1\na: 2\nm: 3\n---\nx');
  assert.deepEqual(r.frontmatter.map((e) => e[0]), ['z', 'a', 'm']);
});

test('extractFrontmatter leaves a mid-document --- untouched', () => {
  const md = '# Title\n\n---\n\nMore';
  const r = extractFrontmatter(md);
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, md);
});

test('extractFrontmatter returns the input unchanged when the fence never closes', () => {
  const md = '---\ntype: pnj\n# no close';
  const r = extractFrontmatter(md);
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, md);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `extractFrontmatter is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/obsidian.js`:

```js
function unquote(s) {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlSubset(lines) {
  const entries = [];
  let open = null; // { key, items: [], raw: [] } for a key awaiting indented children

  const flush = () => {
    if (!open) return;
    const value = open.items.length ? open.items.join(', ')
      : open.raw.length ? open.raw.join(', ')
      : '';
    entries.push([open.key, value]);
    open = null;
  };

  for (const line of lines) {
    if (line.trim() === '') continue;

    if (open && /^\s+/.test(line)) {
      const dash = line.match(/^\s*-\s+(.*)$/);
      if (dash) { open.items.push(unquote(dash[1].trim())); continue; }
      open.raw.push(line.trim()); // nested map / unrecognized indented line — preserved
      continue;
    }

    flush();
    const kv = line.match(/^([\w.\-]+):\s*(.*)$/);
    if (!kv) continue; // malformed top-level line — skipped
    const key = kv[1];
    const rest = kv[2].trim();
    if (rest === '') {
      open = { key, items: [], raw: [] };
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      const items = inner === '' ? [] : inner.split(',').map((s) => unquote(s.trim()));
      entries.push([key, items.join(', ')]);
    } else {
      entries.push([key, unquote(rest)]);
    }
  }
  flush();
  return entries;
}

/**
 * Split leading YAML frontmatter from the Markdown body.
 * @param {string} md
 * @returns {{ frontmatter: Array<[string,string]>|null, body: string }}
 */
export function extractFrontmatter(md) {
  const lines = md.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: null, body: md };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { frontmatter: null, body: md };

  const entries = parseYamlSubset(lines.slice(1, end));
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { frontmatter: entries.length ? entries : null, body };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "feat: parse Obsidian YAML frontmatter into ordered entries"
```

---

### Task 3: `frontmatterToHtml`

**Files:**
- Modify: `scripts/obsidian.js` (append export)
- Test: `tests/obsidian.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/obsidian.test.js` (add `frontmatterToHtml` to the import):

```js
import { frontmatterToHtml } from '../scripts/obsidian.js';

test('frontmatterToHtml renders a titled key/value table', () => {
  const html = frontmatterToHtml([['type', 'pnj'], ['tags', 'a, b']]);
  assert.match(html, /<p class="md-frontmatter-title"><strong>Properties<\/strong><\/p>/);
  assert.match(html, /<table class="md-frontmatter">/);
  assert.match(html, /<tr><td><strong>type<\/strong><\/td><td>pnj<\/td><\/tr>/);
  assert.match(html, /<tr><td><strong>tags<\/strong><\/td><td>a, b<\/td><\/tr>/);
});

test('frontmatterToHtml uses the injected title label', () => {
  const html = frontmatterToHtml([['type', 'pnj']], { properties: 'Propriétés' });
  assert.match(html, /<strong>Propriétés<\/strong>/);
});

test('frontmatterToHtml escapes key and value content', () => {
  const html = frontmatterToHtml([['x', '<script>alert(1)</script>']]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `frontmatterToHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/obsidian.js`:

```js
/**
 * Render frontmatter entries as a raw-HTML "Properties" table block.
 * @param {Array<[string,string]>} entries
 * @param {{ properties?: string }} [labels]
 * @returns {string}
 */
export function frontmatterToHtml(entries, labels = {}) {
  const title = labels.properties || DEFAULT_LABELS.properties;
  const rows = entries
    .map(([k, v]) => `    <tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
    .join('\n');
  return `<p class="md-frontmatter-title"><strong>${escapeHtml(title)}</strong></p>
<table class="md-frontmatter">
  <tbody>
${rows}
  </tbody>
</table>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "feat: render frontmatter as a Properties table"
```

---

### Task 4: `stripWikiLinks`

**Files:**
- Modify: `scripts/obsidian.js` (append export)
- Test: `tests/obsidian.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/obsidian.test.js` (add `stripWikiLinks` to the import):

```js
import { stripWikiLinks } from '../scripts/obsidian.js';

test('stripWikiLinks converts a plain wikilink to its text', () => {
  assert.equal(stripWikiLinks('see [[Montague Edwards]] now'), 'see Montague Edwards now');
});

test('stripWikiLinks uses the alias after a pipe', () => {
  assert.equal(stripWikiLinks('[[St. Agnes|son lieu]]'), 'son lieu');
});

test('stripWikiLinks drops heading/block refs', () => {
  assert.equal(stripWikiLinks('[[Note#Heading]]'), 'Note');
});

test('stripWikiLinks leaves Foundry command rolls alone', () => {
  assert.equal(stripWikiLinks('roll [[/r 1d20]]'), 'roll [[/r 1d20]]');
});

test('stripWikiLinks leaves Foundry inline rolls alone', () => {
  assert.equal(stripWikiLinks('[[1d20+5]]'), '[[1d20+5]]');
});

test('stripWikiLinks leaves embeds alone', () => {
  assert.equal(stripWikiLinks('![[image.png]]'), '![[image.png]]');
});

test('stripWikiLinks does not touch @UUID tokens', () => {
  assert.equal(stripWikiLinks('@UUID[Actor.x]{Bob}'), '@UUID[Actor.x]{Bob}');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `stripWikiLinks is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/obsidian.js`:

```js
/**
 * Replace Obsidian wikilinks with plain text. Foundry rolls ([[/r …]], [[1d20]])
 * and embeds (![[…]]) are left untouched.
 * @param {string} md
 * @returns {string}
 */
export function stripWikiLinks(md) {
  return md.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (match, bang, inner) => {
    if (bang) return match; // ![[embed]] — out of scope
    const trimmed = inner.trim();
    if (trimmed.startsWith('/')) return match; // Foundry command roll
    if (/^\d*[dD]\d/.test(trimmed)) return match; // Foundry inline dice roll
    if (inner.includes('|')) return inner.split('|').pop().trim();
    return inner.split('#')[0].trim();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "feat: strip Obsidian wikilinks while preserving Foundry rolls"
```

---

### Task 5: `transformCallouts`

**Files:**
- Modify: `scripts/obsidian.js` (append renderer + export)
- Test: `tests/obsidian.test.js` (append; needs `marked`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/obsidian.test.js`. Add `transformCallouts` to the `../scripts/obsidian.js` import, and add a `marked` import at the top of the file (next to the other imports):

```js
import { marked } from '../vendor/marked.esm.js';
import { transformCallouts } from '../scripts/obsidian.js';

test('transformCallouts wraps a callout in a classed blockquote with emoji + title', () => {
  const out = transformCallouts('> [!tip] Heads up\n> Body text', marked);
  assert.match(out, /<blockquote class="md-callout md-callout-tip">/);
  assert.match(out, /<p class="md-callout-title"><strong>💡 Heads up<\/strong><\/p>/);
  assert.match(out, /Body text/);
});

test('transformCallouts resolves aliases to the canonical type', () => {
  const out = transformCallouts('> [!summary] S', marked);
  assert.match(out, /md-callout-abstract/);
  assert.match(out, /📋 S/);
});

test('transformCallouts falls back to the type label when no title is given', () => {
  const out = transformCallouts('> [!note]\n> body', marked);
  assert.match(out, /<strong>📝 Note<\/strong>/);
});

test('transformCallouts accepts +/- fold markers', () => {
  const out = transformCallouts('> [!info]+ Title', marked);
  assert.match(out, /md-callout-info/);
  assert.match(out, /ℹ️ Title/);
});

test('transformCallouts renders body Markdown', () => {
  const out = transformCallouts('> [!note] T\n> - one\n> - two', marked);
  assert.match(out, /<li>one<\/li>/);
});

test('transformCallouts uses a generic class for unknown types', () => {
  const out = transformCallouts('> [!frobnicate] X', marked);
  assert.match(out, /class="md-callout"/);
  assert.match(out, /<strong>X<\/strong>/);
});

test('transformCallouts leaves ordinary blockquotes alone', () => {
  assert.equal(transformCallouts('> just a quote', marked), '> just a quote');
});

test('transformCallouts uses injected callout labels', () => {
  const out = transformCallouts('> [!note]', marked, { callouts: { note: 'Remarque' } });
  assert.match(out, /📝 Remarque/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `transformCallouts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/obsidian.js`:

```js
function renderCallout(block, head, marked, labels) {
  const rawType = head[1].toLowerCase();
  const canon = canonicalType(rawType);
  const emoji = canon ? CALLOUT_EMOJI[canon] : '';
  const injected = (labels && labels.callouts) || {};
  const typeLabel = (canon && (injected[canon] || DEFAULT_LABELS.callouts[canon]))
    || (rawType.charAt(0).toUpperCase() + rawType.slice(1));
  const title = head[3].trim() || typeLabel;

  const bodyMd = block.slice(1).map((l) => l.replace(/^>\s?/, '')).join('\n').trim();
  const bodyHtml = bodyMd ? marked.parse(bodyMd).trim() : '';

  const cls = canon ? `md-callout md-callout-${canon}` : 'md-callout';
  const titleHtml = `${emoji ? `${emoji} ` : ''}${escapeHtml(title)}`;
  const body = bodyHtml ? `\n  ${bodyHtml}` : '';
  return `<blockquote class="${cls}">\n  <p class="md-callout-title"><strong>${titleHtml}</strong></p>${body}\n</blockquote>`;
}

/**
 * Convert Obsidian callout blockquotes into raw-HTML blockquote blocks.
 * Body Markdown is rendered via the injected `marked`. Ordinary blockquotes are untouched.
 * @param {string} md
 * @param {object} marked - the marked module (injected)
 * @param {{ callouts?: Record<string,string> }} [labels]
 * @returns {string}
 */
export function transformCallouts(md, marked, labels = {}) {
  const lines = md.split('\n');
  const out = [];
  const head = /^>\s*\[!(\w+)\]([+-]?)\s*(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(head);
    if (!m) { out.push(lines[i]); i++; continue; }
    const block = [lines[i]];
    i++;
    while (i < lines.length && /^>/.test(lines[i])) { block.push(lines[i]); i++; }
    out.push(renderCallout(block, m, marked, labels));
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS (all `obsidian.test.js` tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "feat: transform Obsidian callouts into styled blockquotes"
```

---

### Task 6: Wire the Obsidian layer into `convert.js`

**Files:**
- Modify: `scripts/convert.js` (full rewrite below)
- Test: `tests/convert.test.js` (append integration + regression tests)

- [ ] **Step 1: Write the failing tests**

At the top of `tests/convert.test.js`, add a fixture import after the existing imports:

```js
import { readFileSync } from 'node:fs';
const fixture = readFileSync(new URL('./test-file-obsidian.md', import.meta.url), 'utf8');
```

Append these tests to `tests/convert.test.js`:

```js
test('convert renders Obsidian frontmatter as a Properties table by default', () => {
  const html = convert('---\ntype: pnj\n---\n\n# Title', deps);
  assert.match(html, /class="md-frontmatter"/);
  assert.match(html, /<td><strong>type<\/strong><\/td><td>pnj<\/td>/);
});

test('convert renders Obsidian callouts by default', () => {
  const html = convert('> [!tip] Hint\n> Body', deps);
  assert.match(html, /md-callout-tip/);
  assert.match(html, /💡 Hint/);
});

test('convert strips wikilinks but keeps Foundry rolls', () => {
  const html = convert('See [[Bob]] then roll [[/r 1d20]]', deps);
  assert.match(html, /See Bob then roll/);
  assert.match(html, /\[\[\/r 1d20\]\]/);
});

test('convert with obsidian:false leaves Obsidian syntax unprocessed', () => {
  const html = convert('> [!tip] Hint\n> Body', deps, { obsidian: false });
  assert.doesNotMatch(html, /md-callout/);
  assert.match(html, /\[!tip\]/);
});

test('convert injects localized labels', () => {
  const html = convert('---\ntype: pnj\n---\n# x', deps, {
    labels: { properties: 'Propriétés', callouts: {} },
  });
  assert.match(html, /Propriétés/);
});

test('convert handles the Obsidian reference fixture end-to-end', () => {
  const html = convert(fixture, deps);
  assert.match(html, /class="md-frontmatter"/);          // Properties table present
  assert.match(html, /md-callout-info/);                 // first callout
  assert.match(html, /md-callout-quote/);                // quote callouts
  assert.match(html, /Montague Edwards/);                // wikilink reduced to text
  assert.doesNotMatch(html, /\[\[Montague Edwards\]\]/); // brackets gone
  assert.doesNotMatch(html, /<script/);                  // still sanitized
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/convert.test.js`
Expected: FAIL — frontmatter/callout assertions fail because `convert` does not yet run the Obsidian layer.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `scripts/convert.js` with:

```js
import { extractFrontmatter, frontmatterToHtml, stripWikiLinks, transformCallouts } from './obsidian.js';

/**
 * Convert a Markdown string to sanitized HTML.
 * Dependencies are injected so the function is unit-testable in Node + jsdom
 * and decoupled from how Foundry loads marked/DOMPurify at runtime.
 *
 * @param {string} md - Markdown source.
 * @param {{ marked: object, DOMPurify: object }} deps - Injected libs.
 * @param {{ gfmBreaks?: boolean, obsidian?: boolean, labels?: object }} [options]
 *   - gfmBreaks: treat single newlines as <br>.
 *   - obsidian: run the Obsidian compatibility layer (frontmatter, callouts, wikilinks). Default true.
 *   - labels: localized strings injected into the Obsidian layer ({ properties, callouts }).
 * @returns {string} Sanitized HTML.
 */
export function convert(md, deps, options = {}) {
  if (!md) return '';
  const { marked, DOMPurify } = deps;
  const { gfmBreaks = false, obsidian = true, labels } = options;

  let source = md;
  if (obsidian) {
    const { frontmatter, body } = extractFrontmatter(source);
    let processed = stripWikiLinks(body);
    processed = transformCallouts(processed, marked, labels);
    source = (frontmatter ? `${frontmatterToHtml(frontmatter, labels)}\n\n` : '') + processed;
  }

  const html = marked.parse(source, {
    gfm: true,
    breaks: gfmBreaks,
  });

  // ADD_ATTR keeps target="_blank" / rel="noopener" on raw-HTML links authors paste.
  // DOMPurify still blocks javascript:, data:, and vbscript: protocols unconditionally,
  // so this does not widen the XSS surface — don't remove it during a security audit.
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  });
}
```

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `npm test`
Expected: PASS — all `convert.test.js` (original + new) and `obsidian.test.js` tests. The original GFM/XSS/passthrough tests still pass because their inputs contain no frontmatter/callouts/wikilinks, so the Obsidian layer is a no-op for them.

- [ ] **Step 5: Commit**

```bash
git add scripts/convert.js tests/convert.test.js
git commit -m "feat: run Obsidian compatibility layer in convert()"
```

---

### Task 7: Foundry runtime wiring — setting, localization, dialog

**Files:**
- Modify: `scripts/settings.js:4-11` (add `processObsidian` to the `SETTINGS` array)
- Modify: `lang/en.json` (add keys, update dialog hint)
- Modify: `lang/fr.json` (add keys, update dialog hint)
- Modify: `scripts/dialog.js` (build + pass labels and the obsidian flag)

No unit tests (Foundry-runtime glue). Validate JSON and keep the suite green.

- [ ] **Step 1: Add the setting**

In `scripts/settings.js`, add this line to the `SETTINGS` array immediately after the `gfmBreaks` entry (line 10):

```js
  { key: 'processObsidian', def: true,  nameKey: 'markdown-paste.settings.processObsidian.name', hintKey: 'markdown-paste.settings.processObsidian.hint' },
```

- [ ] **Step 2: Add English strings and update the hint**

In `lang/en.json`: replace the `markdown-paste.dialog.hint` value with the Obsidian-aware text, and add the new keys. The dialog hint line becomes:

```json
  "markdown-paste.dialog.hint": "GFM + Obsidian (frontmatter, callouts, wikilinks) supported. Foundry @UUID[…] and [[/r …]] rolls pass through.",
```

Add these keys before the closing `}` (append after the `gfmBreaks.hint` line, adding a comma to that line):

```json
  "markdown-paste.settings.processObsidian.name": "Process Obsidian syntax",
  "markdown-paste.settings.processObsidian.hint": "Convert Obsidian frontmatter to a Properties table, callouts to styled blockquotes, and wikilinks to plain text. On by default.",
  "markdown-paste.frontmatter.title": "Properties",
  "markdown-paste.callouts.note": "Note",
  "markdown-paste.callouts.abstract": "Abstract",
  "markdown-paste.callouts.info": "Info",
  "markdown-paste.callouts.todo": "To-do",
  "markdown-paste.callouts.tip": "Tip",
  "markdown-paste.callouts.success": "Success",
  "markdown-paste.callouts.question": "Question",
  "markdown-paste.callouts.warning": "Warning",
  "markdown-paste.callouts.failure": "Failure",
  "markdown-paste.callouts.danger": "Danger",
  "markdown-paste.callouts.bug": "Bug",
  "markdown-paste.callouts.example": "Example",
  "markdown-paste.callouts.quote": "Quote"
```

- [ ] **Step 3: Add French strings and update the hint**

In `lang/fr.json`: replace the `markdown-paste.dialog.hint` value:

```json
  "markdown-paste.dialog.hint": "GFM + Obsidian (frontmatter, callouts, liens) pris en charge. Les jets Foundry @UUID[…] et [[/r …]] passent tels quels.",
```

Add these keys before the closing `}` (append after the `gfmBreaks.hint` line, adding a comma to that line):

```json
  "markdown-paste.settings.processObsidian.name": "Traiter la syntaxe Obsidian",
  "markdown-paste.settings.processObsidian.hint": "Convertit le frontmatter Obsidian en tableau Propriétés, les callouts en blocs de citation stylisés, et les liens [[…]] en texte. Activé par défaut.",
  "markdown-paste.frontmatter.title": "Propriétés",
  "markdown-paste.callouts.note": "Note",
  "markdown-paste.callouts.abstract": "Résumé",
  "markdown-paste.callouts.info": "Info",
  "markdown-paste.callouts.todo": "À faire",
  "markdown-paste.callouts.tip": "Astuce",
  "markdown-paste.callouts.success": "Succès",
  "markdown-paste.callouts.question": "Question",
  "markdown-paste.callouts.warning": "Avertissement",
  "markdown-paste.callouts.failure": "Échec",
  "markdown-paste.callouts.danger": "Danger",
  "markdown-paste.callouts.bug": "Bogue",
  "markdown-paste.callouts.example": "Exemple",
  "markdown-paste.callouts.quote": "Citation"
```

- [ ] **Step 4: Pass the flag and labels from the dialog**

In `scripts/dialog.js`: add an import from `./obsidian.js`, build the labels, and pass the new options into `convert`.

Add this import near the top, after the existing `import { getSetting } from './settings.js';` line:

```js
import { CALLOUT_TYPES } from './obsidian.js';
```

Add this helper after the imports (above `export async function openPasteDialog`):

```js
/** Build localized labels for the Obsidian layer from Foundry i18n. */
function buildObsidianLabels() {
  const callouts = {};
  for (const t of CALLOUT_TYPES) {
    callouts[t] = game.i18n.localize(`markdown-paste.callouts.${t}`);
  }
  return {
    properties: game.i18n.localize('markdown-paste.frontmatter.title'),
    callouts,
  };
}
```

Replace the `convert(...)` call inside the insert button callback:

```js
            const safeHtml = convert(md, { marked, DOMPurify }, {
              gfmBreaks: getSetting('gfmBreaks'),
            });
```

with:

```js
            const safeHtml = convert(md, { marked, DOMPurify }, {
              gfmBreaks: getSetting('gfmBreaks'),
              obsidian: getSetting('processObsidian'),
              labels: buildObsidianLabels(),
            });
```

- [ ] **Step 5: Validate JSON and re-run the suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); JSON.parse(require('fs').readFileSync('lang/fr.json','utf8')); console.log('json ok')"`
Expected: `json ok`

Run: `npm test`
Expected: PASS (the unit suite is unaffected; this confirms no syntax break in the edited JS).

- [ ] **Step 6: Commit**

```bash
git add scripts/settings.js scripts/dialog.js lang/en.json lang/fr.json
git commit -m "feat: add processObsidian setting, localized labels, dialog wiring"
```

---

### Task 8: Callout + frontmatter styling

**Files:**
- Modify: `styles/markdown-paste.css` (append rules)

No unit tests (CSS is verified in the manual smoke test). These styles render the colored callout boxes and the Properties table when the class survives ProseMirror; if it doesn't, the markup still degrades gracefully (plain blockquote, plain table).

- [ ] **Step 1: Append the styles**

Append to `styles/markdown-paste.css`:

```css
/* ── Obsidian frontmatter "Properties" table ───────────────────────────── */
.md-frontmatter-title {
  margin: 0 0 0.25em;
  font-size: var(--font-size-12, 12px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.7;
}
.md-frontmatter {
  border-collapse: collapse;
  margin: 0 0 1em;
}
.md-frontmatter td {
  border: none;
  padding: 0.2em 1em 0.2em 0;
  vertical-align: top;
}
.md-frontmatter td:first-child {
  white-space: nowrap;
  opacity: 0.85;
}

/* ── Obsidian callouts ─────────────────────────────────────────────────── */
:root {
  --md-callout-note: #448aff;
  --md-callout-abstract: #00b8d4;
  --md-callout-info: #448aff;
  --md-callout-todo: #448aff;
  --md-callout-tip: #00bfa5;
  --md-callout-success: #00c853;
  --md-callout-question: #f2c037;
  --md-callout-warning: #ff9800;
  --md-callout-failure: #ff5252;
  --md-callout-danger: #ff1744;
  --md-callout-bug: #f50057;
  --md-callout-example: #7c4dff;
  --md-callout-quote: #9e9e9e;
}

.md-callout {
  --md-callout-color: var(--md-callout-quote);
  border-left: 4px solid var(--md-callout-color);
  border-radius: 4px;
  padding: 0.5em 0.75em;
  margin: 0.75em 0;
  background: color-mix(in srgb, var(--md-callout-color) 8%, transparent);
}
.md-callout .md-callout-title {
  margin: 0 0 0.25em;
  color: var(--md-callout-color);
}
.md-callout .md-callout-title + * {
  margin-top: 0;
}

.md-callout-note    { --md-callout-color: var(--md-callout-note); }
.md-callout-abstract{ --md-callout-color: var(--md-callout-abstract); }
.md-callout-info    { --md-callout-color: var(--md-callout-info); }
.md-callout-todo    { --md-callout-color: var(--md-callout-todo); }
.md-callout-tip     { --md-callout-color: var(--md-callout-tip); }
.md-callout-success { --md-callout-color: var(--md-callout-success); }
.md-callout-question{ --md-callout-color: var(--md-callout-question); }
.md-callout-warning { --md-callout-color: var(--md-callout-warning); }
.md-callout-failure { --md-callout-color: var(--md-callout-failure); }
.md-callout-danger  { --md-callout-color: var(--md-callout-danger); }
.md-callout-bug     { --md-callout-color: var(--md-callout-bug); }
.md-callout-example { --md-callout-color: var(--md-callout-example); }
.md-callout-quote   { --md-callout-color: var(--md-callout-quote); }
```

- [ ] **Step 2: Sanity-check the file loads**

Run: `node -e "const c=require('fs').readFileSync('styles/markdown-paste.css','utf8'); if(!c.includes('md-callout-tip')) process.exit(1); console.log('css ok')"`
Expected: `css ok`

- [ ] **Step 3: Commit**

```bash
git add styles/markdown-paste.css
git commit -m "feat: style Obsidian callouts and frontmatter table"
```

---

### Task 9: Docs + final verification

**Files:**
- Modify: `CHANGELOG.md:10-17` (add bullets under the `[0.1.0]` "Added" section)
- Modify: `README.md` (Features, Settings, smoke checklist)

- [ ] **Step 1: Update the CHANGELOG**

In `CHANGELOG.md`, under `## [0.1.0]` → `### Added`, add these bullets after the existing "Foundry enricher tokens…" line:

```markdown
- Obsidian compatibility: YAML frontmatter becomes a "Properties" table, callouts (`> [!tip]`, `[!note]`, `[!quote]`, …) become styled blockquotes with emoji + title, and `[[wikilinks]]` are reduced to plain text (Foundry `[[/r …]]` rolls preserved).
- "Process Obsidian syntax" setting (on by default).
```

- [ ] **Step 2: Update the README**

In `README.md`, add to the **Features** list (after the "GFM support…" bullet):

```markdown
- Obsidian support: frontmatter → Properties table, callouts → styled blockquotes, wikilinks → plain text
```

In the **Settings** list (after the "Treat single newlines…" bullet):

```markdown
- **Process Obsidian syntax** (default: on)
```

In the **Smoke test checklist**, add:

```markdown
- [ ] Pasting an Obsidian note yields a Properties table at the top
- [ ] Callouts render with emoji + title (colored box if the class survives, plain blockquote otherwise)
- [ ] `[[Wiki Links]]` become plain text; `[[/r 1d20]]` stays a working roll
- [ ] "Process Obsidian syntax" off → raw `[!type]`, `---`, and `[[…]]` pass through unprocessed
```

- [ ] **Step 3: Run the full suite one last time**

Run: `npm test`
Expected: PASS — full `obsidian.test.js` + `convert.test.js` suites green.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: document Obsidian syntax support"
```

- [ ] **Step 5: Manual smoke test (Foundry, not automated)**

In a running Foundry v13 (and v14 if available) with the module enabled, open a Journal page editor and paste `tests/test-file-obsidian.md`. Confirm:
- A "Properties" table appears at the top with `tags` comma-joined.
- Callouts show emoji + title. **Record whether the colored box renders** (class survived `parseSlice`) **or it degrades to a plain titled blockquote** (class stripped) — this is the spec's open verification item.
- Wikilinks in the "Liens" section are plain text; no broken roll buttons.
- Toggle "Process Obsidian syntax" off, re-paste: raw `[!type]` / `---` / `[[…]]` appear unprocessed.

---

## Notes for the implementer

- **Run from the repo root** (`/Users/martin.papy/Development/markdown-paste`). The test runner resolves `tests/**/*.test.js` relative to the package root.
- **Append, don't reorder** `obsidian.test.js` imports — Tasks 2–5 add named imports from the same module; consolidating them into one import statement is fine, but each task's tests must be present.
- **Emoji bytes:** the emoji in `scripts/obsidian.js` and the test assertions must match exactly. Copy them from this plan; don't retype.
- **No new dependencies.** Everything uses the already-vendored `marked`/`DOMPurify` and the existing `node:test` + `jsdom` harness.

## Self-review summary (author)

- **Spec coverage:** frontmatter→table (Tasks 2,3,6,8), callouts incl. full alias/emoji map + no-title fallback (Tasks 1,5,6,8), wikilink stripping + roll guard (Tasks 4,6), `processObsidian` setting (Task 7), localization via injected labels (Tasks 3,5,6,7), CSS with graceful degradation (Task 8), tests incl. fixture e2e + `obsidian:false` regression (Tasks 1–6), docs (Task 9), manual class-survival verification (Task 9 Step 5). All spec sections map to a task.
- **No placeholders:** every code/test step contains complete content.
- **Type consistency:** `extractFrontmatter`→`{frontmatter,body}` consumed identically in Task 6; `frontmatterToHtml(entries, labels)`, `transformCallouts(md, marked, labels)`, `stripWikiLinks(md)`, `canonicalType`, `CALLOUT_TYPES` signatures match across Tasks 1–7.
