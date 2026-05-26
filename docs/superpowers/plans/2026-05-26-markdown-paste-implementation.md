# Markdown Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shipped release (v0.1.0) of `markdown-paste`, a FoundryVTT v13/v14 module that adds a "Paste Markdown" toolbar button to every ProseMirror editor.

**Architecture:** Vanilla ES modules, no build step. A single `Hooks.on("getProseMirrorMenuItems", …)` registers the toolbar button across all ProseMirror surfaces. Clicking it opens a `DialogV2` with a textarea; on submit, `marked` parses the Markdown, `DOMPurify` sanitizes the HTML, then `window.DOMParser` + `ProseMirror.DOMParser.fromSchema(view.state.schema)` produces a slice that's dispatched into the originating editor view.

**Tech Stack:** FoundryVTT v13+ (ProseMirror, DialogV2, Hooks), `marked` (GFM enabled), `DOMPurify`, Node `node:test` + `jsdom` for unit tests.

**Spec:** [`docs/superpowers/specs/2026-05-26-markdown-paste-module-design.md`](../specs/2026-05-26-markdown-paste-module-design.md) — read before starting.

**Working assumption:** the repo at `/Users/martin.papy/Development/markdown-paste/` has been initialized (`main` and `develop` branches exist, `.gitignore` is committed on `main`, the spec is committed on `develop`).

---

### Task 0: Create the feature branch

**Files:** none (branch-only operation)

- [ ] **Step 1: Verify you are on develop with a clean working tree**

```bash
cd /Users/martin.papy/Development/markdown-paste
git status
git branch --show-current
```

Expected: `On branch develop`, `nothing to commit, working tree clean`.

- [ ] **Step 2: Branch off develop**

```bash
git checkout -b feature-v0.1-bootstrap
```

Expected: `Switched to a new branch 'feature-v0.1-bootstrap'`.

All subsequent task commits happen on this branch. At the end, you PR `feature-v0.1-bootstrap` → `develop`, then `develop` → `main`, then tag `v0.1.0`.

---

### Task 1: Module manifest

**Files:**
- Create: `module.json`

- [ ] **Step 1: Write module.json**

```json
{
  "id": "markdown-paste",
  "title": "Markdown Paste",
  "description": "Paste Markdown into any FoundryVTT rich-text editor. Adds a toolbar button to the ProseMirror menu that opens a paste dialog and inserts converted HTML at the cursor.",
  "version": "0.1.0",
  "authors": [
    {
      "name": "Martin Papy",
      "email": "martin.papy@cbtw.tech"
    }
  ],
  "compatibility": {
    "minimum": "13",
    "verified": "14"
  },
  "esmodules": ["scripts/main.js"],
  "styles": ["styles/markdown-paste.css"],
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" },
    { "lang": "fr", "name": "Français", "path": "lang/fr.json" }
  ],
  "url": "https://github.com/martin-papy/markdown-paste",
  "manifest": "https://github.com/martin-papy/markdown-paste/releases/latest/download/module.json",
  "download": "https://github.com/martin-papy/markdown-paste/releases/latest/download/markdown-paste.zip"
}
```

If the actual GitHub repo URL differs, substitute when known. The exact URL is not critical for local development.

- [ ] **Step 2: Commit**

```bash
git add module.json
git commit -m "feat: add module.json manifest"
```

---

### Task 2: Vendor marked and DOMPurify

**Files:**
- Create: `vendor/marked.esm.js`
- Create: `vendor/purify.es.mjs`

- [ ] **Step 1: Pin marked to latest stable v15.x**

Fetch from jsDelivr (pinned version — bump in a follow-up if needed, do NOT use `@latest` URLs):

```bash
curl -sL "https://cdn.jsdelivr.net/npm/marked@15/lib/marked.esm.js" -o vendor/marked.esm.js
test -s vendor/marked.esm.js && head -3 vendor/marked.esm.js
```

Expected: file is non-empty, first lines contain ESM exports (e.g., `export `).

- [ ] **Step 2: Pin DOMPurify to latest stable v3.x**

```bash
curl -sL "https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.mjs" -o vendor/purify.es.mjs
test -s vendor/purify.es.mjs && head -3 vendor/purify.es.mjs
```

Expected: file is non-empty, contains ESM.

- [ ] **Step 3: Record exact versions in CHANGELOG (touch only — full CHANGELOG done in a later task)**

```bash
cat vendor/marked.esm.js | head -1   # note the version comment if present
cat vendor/purify.es.mjs | head -1   # note the version comment if present
```

Save the exact version strings somewhere — you'll cite them in CHANGELOG.md (Task 12).

- [ ] **Step 4: Commit**

```bash
git add vendor/marked.esm.js vendor/purify.es.mjs
git commit -m "chore: vendor marked v15 and DOMPurify v3"
```

---

### Task 3: Test infrastructure

**Files:**
- Create: `package.json`
- Create: `tests/setup.js`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "markdown-paste-tests",
  "private": true,
  "version": "0.0.0",
  "description": "Dev-only — node test runner config for markdown-paste",
  "type": "module",
  "scripts": {
    "test": "node --test --import ./tests/setup.js tests/"
  },
  "devDependencies": {
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Install jsdom**

```bash
npm install
```

Expected: `node_modules/` populated, no errors. `package-lock.json` is created — note it is gitignored (intentional, per `.gitignore`).

- [ ] **Step 3: Write tests/setup.js**

`scripts/convert.js` is written to accept `marked` and `DOMPurify` as injected dependencies (see Task 4), so this file is a tiny harness that exports a helper to spin up a jsdom-backed `DOMPurify` plus `marked`:

```js
// tests/setup.js
// Empty for now — Task 4 will add jsdom bootstrap if needed.
// Kept as a `--import` target so future global setup has a home.
```

- [ ] **Step 4: Commit**

```bash
git add package.json tests/setup.js
git commit -m "chore: add node:test infrastructure with jsdom"
```

---

### Task 4: convert.js — pure conversion function (TDD)

**Files:**
- Create: `tests/convert.test.js`
- Create: `scripts/convert.js`

`convert.js` is a pure function with dependencies injected, so it's directly testable in Node + jsdom. We write the full test suite first, then the minimal implementation that passes everything.

- [ ] **Step 1: Write the full failing test suite**

`tests/convert.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from '../vendor/marked.esm.js';
import DOMPurifyFactory from '../vendor/purify.es.mjs';
import { convert } from '../scripts/convert.js';

const window = new JSDOM('').window;
const DOMPurify = DOMPurifyFactory(window);
const deps = { marked, DOMPurify };

test('headings render as h1..h6', () => {
  const html = convert('# H1\n\n## H2\n\n###### H6', deps);
  assert.match(html, /<h1[^>]*>H1<\/h1>/);
  assert.match(html, /<h2[^>]*>H2<\/h2>/);
  assert.match(html, /<h6[^>]*>H6<\/h6>/);
});

test('paragraphs render as p', () => {
  const html = convert('Hello world.\n\nSecond paragraph.', deps);
  assert.match(html, /<p>Hello world\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test('emphasis renders bold and italic', () => {
  const html = convert('**bold** and *italic*', deps);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test('GFM strikethrough renders as del', () => {
  const html = convert('~~struck~~', deps);
  assert.match(html, /<del>struck<\/del>/);
});

test('inline code renders as code span', () => {
  const html = convert('Use `foo()`.', deps);
  assert.match(html, /<code>foo\(\)<\/code>/);
});

test('fenced code blocks render as pre/code', () => {
  const html = convert('```js\nconst x = 1;\n```', deps);
  assert.match(html, /<pre><code[^>]*>const x = 1;\n<\/code><\/pre>/);
});

test('blockquotes render as blockquote', () => {
  const html = convert('> a quote', deps);
  assert.match(html, /<blockquote>\s*<p>a quote<\/p>\s*<\/blockquote>/);
});

test('unordered lists render as ul/li', () => {
  const html = convert('- one\n- two', deps);
  assert.match(html, /<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
});

test('ordered lists render as ol/li', () => {
  const html = convert('1. one\n2. two', deps);
  assert.match(html, /<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ol>/);
});

test('GFM task lists render with checkboxes', () => {
  const html = convert('- [ ] todo\n- [x] done', deps);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled/);
  assert.match(html, /<input[^>]*checked[^>]*>/);
});

test('GFM tables render as table/thead/tbody', () => {
  const md = '| a | b |\n|---|---|\n| 1 | 2 |';
  const html = convert(md, deps);
  assert.match(html, /<table>/);
  assert.match(html, /<thead>[\s\S]*<th>a<\/th>[\s\S]*<\/thead>/);
  assert.match(html, /<tbody>[\s\S]*<td>1<\/td>[\s\S]*<\/tbody>/);
});

test('links render as a tags', () => {
  const html = convert('[foundry](https://foundryvtt.com)', deps);
  assert.match(html, /<a href="https:\/\/foundryvtt\.com">foundry<\/a>/);
});

test('images render as img with src and alt', () => {
  const html = convert('![map](https://example.com/m.png)', deps);
  assert.match(html, /<img[^>]*src="https:\/\/example\.com\/m\.png"[^>]*alt="map"/);
});

test('script tags are stripped', () => {
  const html = convert('Hi <script>alert(1)</script> there', deps);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Hi/);
  assert.match(html, /there/);
});

test('onerror attributes are stripped', () => {
  const html = convert('![x](https://e.com/x.png "x" onerror="alert(1)")', deps);
  assert.doesNotMatch(html, /onerror=/i);
});

test('javascript: hrefs are blocked', () => {
  const html = convert('[x](javascript:alert(1))', deps);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('Foundry @UUID tokens pass through unchanged', () => {
  const html = convert('See @UUID[Actor.abc]{Bob} for details.', deps);
  assert.match(html, /@UUID\[Actor\.abc\]\{Bob\}/);
});

test('Foundry [[/r 1d20]] tokens pass through unchanged', () => {
  const html = convert('Roll [[/r 1d20]] now.', deps);
  assert.match(html, /\[\[\/r 1d20\]\]/);
});

test('gfmBreaks=false: single newlines do NOT become br', () => {
  const html = convert('line one\nline two', deps, { gfmBreaks: false });
  assert.doesNotMatch(html, /<br/);
});

test('gfmBreaks=true: single newlines become br', () => {
  const html = convert('line one\nline two', deps, { gfmBreaks: true });
  assert.match(html, /<br/);
});

test('empty input returns empty string', () => {
  assert.equal(convert('', deps), '');
});
```

- [ ] **Step 2: Run the test suite to verify everything fails**

```bash
npm test
```

Expected: failures across all tests with errors like `Cannot find module '../scripts/convert.js'` or `convert is not a function`.

- [ ] **Step 3: Write the minimal convert.js**

`scripts/convert.js`:

```js
/**
 * Convert a Markdown string to sanitized HTML.
 * Dependencies are injected so the function is unit-testable in Node + jsdom
 * and decoupled from how Foundry loads marked/DOMPurify at runtime.
 *
 * @param {string} md - Markdown source.
 * @param {{ marked: object, DOMPurify: object }} deps - Injected libs.
 * @param {{ gfmBreaks?: boolean }} [options]
 * @returns {string} Sanitized HTML.
 */
export function convert(md, deps, options = {}) {
  if (!md) return '';
  const { marked, DOMPurify } = deps;
  const { gfmBreaks = false } = options;

  const html = marked.parse(md, {
    gfm: true,
    breaks: gfmBreaks,
  });

  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  });
}
```

- [ ] **Step 4: Run the test suite to verify it passes**

```bash
npm test
```

Expected: all 21 tests pass.

If any specific test fails, fix the implementation — do NOT relax the test unless the test itself is wrong. The most likely failures are:

- DOMPurify factory not bootstrapped — re-check `tests/convert.test.js` line that calls `DOMPurifyFactory(window)`.
- marked's exact output for `task lists` may differ on indentation/whitespace — update the regex in the test to be more lenient (use `[\s\S]*` between landmarks) before changing the implementation.

- [ ] **Step 5: Commit**

```bash
git add scripts/convert.js tests/convert.test.js
git commit -m "feat: add convert() pure function with full test coverage"
```

---

### Task 5: settings.js

**Files:**
- Create: `scripts/settings.js`

- [ ] **Step 1: Write the settings registration**

```js
// scripts/settings.js
export const MODULE_ID = 'markdown-paste';

const SETTINGS = [
  { key: 'enableInJournals', def: true,  nameKey: 'markdown-paste.settings.enableInJournals.name',  hintKey: 'markdown-paste.settings.enableInJournals.hint' },
  { key: 'enableInItems',    def: true,  nameKey: 'markdown-paste.settings.enableInItems.name',     hintKey: 'markdown-paste.settings.enableInItems.hint' },
  { key: 'enableInActors',   def: true,  nameKey: 'markdown-paste.settings.enableInActors.name',    hintKey: 'markdown-paste.settings.enableInActors.hint' },
  { key: 'enableInChat',     def: false, nameKey: 'markdown-paste.settings.enableInChat.name',      hintKey: 'markdown-paste.settings.enableInChat.hint' },
  { key: 'enableElsewhere',  def: true,  nameKey: 'markdown-paste.settings.enableElsewhere.name',   hintKey: 'markdown-paste.settings.enableElsewhere.hint' },
  { key: 'gfmBreaks',        def: false, nameKey: 'markdown-paste.settings.gfmBreaks.name',         hintKey: 'markdown-paste.settings.gfmBreaks.hint' },
];

export function registerSettings() {
  for (const s of SETTINGS) {
    game.settings.register(MODULE_ID, s.key, {
      name: s.nameKey,
      hint: s.hintKey,
      scope: 'client',
      config: true,
      type: Boolean,
      default: s.def,
    });
  }
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/settings.js
git commit -m "feat: register six client-scope settings"
```

(No unit test — settings registration is a thin wrapper over Foundry's API, validated in smoke tests.)

---

### Task 6: insert.js

**Files:**
- Create: `scripts/insert.js`

- [ ] **Step 1: Write the HTML → ProseMirror slice → dispatch function**

```js
// scripts/insert.js
/**
 * Insert sanitized HTML into a ProseMirror EditorView at the current selection.
 * Uses the editor's live schema so it adapts to whatever marks/nodes Foundry
 * (v13 or v14) configures for that surface.
 *
 * @param {EditorView} view - The originating ProseMirror EditorView.
 * @param {string} safeHtml - Already-sanitized HTML.
 */
export function insertHtml(view, safeHtml) {
  if (!view || !safeHtml) return;

  // Parse HTML string into a detached DOM tree using the browser standard
  // DOMParser. This is NOT the same as ProseMirror's DOMParser, which we use
  // below to convert the resulting DOM into a ProseMirror slice.
  const dom = new window.DOMParser()
    .parseFromString(safeHtml, 'text/html')
    .body;

  // ProseMirror.DOMParser is exposed by Foundry as part of the ProseMirror global.
  const slice = ProseMirror.DOMParser
    .fromSchema(view.state.schema)
    .parseSlice(dom);

  view.dispatch(view.state.tr.replaceSelection(slice));
}
```

(`tr.replaceSelection(slice)` is the correct API for inserting a `Slice` — i.e. the open-ended fragment produced by `parseSlice`. The sibling `tr.replaceSelectionWith(node, inheritMarks)` takes a single `Node` and is for replacing the selection with one whole node, which is not what we want here.)

- [ ] **Step 2: Commit**

```bash
git add scripts/insert.js
git commit -m "feat: add HTML-to-ProseMirror insertion function"
```

(No unit test — requires a Foundry ProseMirror schema at runtime; covered in smoke tests.)

---

### Task 7: dialog.js

**Files:**
- Create: `scripts/dialog.js`

- [ ] **Step 1: Write the DialogV2-based paste dialog**

```js
// scripts/dialog.js
import { convert } from './convert.js';
import { insertHtml } from './insert.js';
import { getSetting } from './settings.js';
import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';

/**
 * Open the Paste Markdown dialog for a given ProseMirror view.
 * Captures `view` and its current selection so the dialog can outlive
 * focus changes and still target the originating editor.
 *
 * @param {EditorView} view
 */
export async function openPasteDialog(view) {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <div class="markdown-paste-dialog">
      <textarea name="md" rows="20" autofocus
        placeholder="${game.i18n.localize('markdown-paste.dialog.placeholder')}"></textarea>
      <p class="hint">${game.i18n.localize('markdown-paste.dialog.hint')}</p>
    </div>
  `;

  await DialogV2.wait({
    window: { title: 'markdown-paste.dialog.title' },
    content,
    buttons: [
      {
        action: 'insert',
        label: 'markdown-paste.dialog.insert',
        default: true,
        callback: (event, button, dialog) => {
          const md = dialog.element.querySelector('textarea[name="md"]').value;
          if (!md) return;
          try {
            const safeHtml = convert(md, { marked, DOMPurify }, {
              gfmBreaks: getSetting('gfmBreaks'),
            });
            if (!view.dom || !document.contains(view.dom)) {
              ui.notifications.warn(game.i18n.localize('markdown-paste.errors.editorClosed'));
              return;
            }
            insertHtml(view, safeHtml);
          } catch (err) {
            console.error('markdown-paste: conversion failed', err);
            ui.notifications.error(game.i18n.localize('markdown-paste.errors.parseFailed'));
          }
        },
      },
      {
        action: 'cancel',
        label: 'markdown-paste.dialog.cancel',
      },
    ],
    render: (event, dialog) => {
      const textarea = dialog.element.querySelector('textarea[name="md"]');
      const insertBtn = dialog.element.querySelector('button[data-action="insert"]');
      const update = () => { insertBtn.disabled = textarea.value.trim().length === 0; };
      textarea.addEventListener('input', update);
      update();
    },
  });
}
```

(`document.contains(view.dom)` is the staleness check — if the sheet hosting the editor was closed while the dialog was open, the editor's root DOM node is no longer in the document, so we abort with a toast.)

- [ ] **Step 2: Commit**

```bash
git add scripts/dialog.js
git commit -m "feat: add paste dialog with convert+insert wiring"
```

---

### Task 8: menu-button.js

**Files:**
- Create: `scripts/menu-button.js`

- [ ] **Step 1: Write the menu hook + surface detection**

```js
// scripts/menu-button.js
import { openPasteDialog } from './dialog.js';
import { getSetting } from './settings.js';

/**
 * Walk up from the ProseMirror view's DOM to find the host Application and
 * resolve which setting controls visibility for this surface.
 *
 * @param {EditorView} view
 * @returns {string} The settings key that gates this surface.
 */
function resolveSurfaceSetting(view) {
  const dom = view.dom;
  if (!dom) return 'enableElsewhere';

  // Chat composer detection — the chat form contains the ProseMirror editor
  // for chat messages on both v13 and v14.
  if (dom.closest('#chat-form, #chat-message, .chat-form')) {
    return 'enableInChat';
  }

  // Walk up to the application element. ApplicationV2 marks itself with
  // [data-application-id]; legacy Application uses .window-app / [data-appid].
  const appEl = dom.closest('[data-application-id], [data-appid], .application');
  if (!appEl) return 'enableElsewhere';

  // Try to resolve the host document type via the application instance.
  const appId = appEl.dataset.applicationId || appEl.dataset.appid;
  const app = appId
    ? (foundry.applications.instances?.get(appId) ?? ui.windows?.[appId])
    : null;

  const docName = app?.document?.documentName ?? app?.object?.documentName ?? null;

  switch (docName) {
    case 'JournalEntry':
    case 'JournalEntryPage': return 'enableInJournals';
    case 'Item':             return 'enableInItems';
    case 'Actor':            return 'enableInActors';
    default:                 return 'enableElsewhere';
  }
}

export function registerMenuHook() {
  Hooks.on('getProseMirrorMenuItems', (menu, items) => {
    const settingKey = resolveSurfaceSetting(menu.view);
    if (!getSetting(settingKey)) return;

    items.push({
      action: 'markdown-paste',
      title: 'markdown-paste.button.title',
      icon: '<i class="fa-brands fa-markdown"></i>',
      group: 5,
      priority: 50,
      cmd: () => {
        openPasteDialog(menu.view);
        return true;
      },
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/menu-button.js
git commit -m "feat: add ProseMirror menu button with surface detection"
```

---

### Task 9: main.js (module entry)

**Files:**
- Create: `scripts/main.js`

- [ ] **Step 1: Write the entry module**

```js
// scripts/main.js
import { registerSettings, MODULE_ID } from './settings.js';
import { registerMenuHook } from './menu-button.js';

Hooks.once('init', () => {
  console.info(
    `${MODULE_ID} | Initializing on Foundry release `
    + `${game.release?.generation}.${game.release?.build}`
  );
  registerSettings();
  registerMenuHook();
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/main.js
git commit -m "feat: add module entry point"
```

---

### Task 10: Styles

**Files:**
- Create: `styles/markdown-paste.css`

- [ ] **Step 1: Write the stylesheet**

```css
/* styles/markdown-paste.css */
.markdown-paste-dialog textarea[name="md"] {
  width: 100%;
  min-height: 320px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--font-size-13, 13px);
  line-height: 1.5;
  resize: vertical;
}

.markdown-paste-dialog .hint {
  margin-top: 0.5em;
  font-size: var(--font-size-12, 12px);
  opacity: 0.75;
}

/* Make the FA Markdown icon align nicely in the ProseMirror menu. */
.prosemirror.menu button[data-action="markdown-paste"] i.fa-markdown {
  font-size: 1.05em;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/markdown-paste.css
git commit -m "feat: add dialog and toolbar button styles"
```

---

### Task 11: Localization

**Files:**
- Create: `lang/en.json`
- Create: `lang/fr.json`

- [ ] **Step 1: Write English strings**

`lang/en.json`:

```json
{
  "markdown-paste.button.title": "Paste Markdown",
  "markdown-paste.dialog.title": "Paste Markdown",
  "markdown-paste.dialog.placeholder": "Paste your Markdown here…",
  "markdown-paste.dialog.hint": "GFM supported (tables, task lists, strikethrough). Foundry @UUID[…] and [[…]] tokens pass through.",
  "markdown-paste.dialog.insert": "Insert",
  "markdown-paste.dialog.cancel": "Cancel",
  "markdown-paste.errors.parseFailed": "Could not parse Markdown — see console.",
  "markdown-paste.errors.editorClosed": "Editor was closed. Markdown not inserted.",
  "markdown-paste.settings.enableInJournals.name": "Show in Journal Entry editors",
  "markdown-paste.settings.enableInJournals.hint": "Display the Paste Markdown button in Journal Entry page editors.",
  "markdown-paste.settings.enableInItems.name": "Show in Item sheet editors",
  "markdown-paste.settings.enableInItems.hint": "Display the Paste Markdown button in Item sheet description editors.",
  "markdown-paste.settings.enableInActors.name": "Show in Actor sheet editors",
  "markdown-paste.settings.enableInActors.hint": "Display the Paste Markdown button in Actor sheet biography/notes editors.",
  "markdown-paste.settings.enableInChat.name": "Show in chat composer",
  "markdown-paste.settings.enableInChat.hint": "Display the Paste Markdown button in the chat input.",
  "markdown-paste.settings.enableElsewhere.name": "Show in other editors",
  "markdown-paste.settings.enableElsewhere.hint": "Display the Paste Markdown button in any other ProseMirror editor (scene notes, module dialogs, etc.).",
  "markdown-paste.settings.gfmBreaks.name": "Treat single newlines as line breaks",
  "markdown-paste.settings.gfmBreaks.hint": "When enabled, single newlines in pasted Markdown become <br> tags. Disabled by default (standard CommonMark behavior)."
}
```

- [ ] **Step 2: Write French strings**

`lang/fr.json`:

```json
{
  "markdown-paste.button.title": "Coller du Markdown",
  "markdown-paste.dialog.title": "Coller du Markdown",
  "markdown-paste.dialog.placeholder": "Collez votre Markdown ici…",
  "markdown-paste.dialog.hint": "GFM pris en charge (tableaux, listes de tâches, barré). Les jetons Foundry @UUID[…] et [[…]] passent tels quels.",
  "markdown-paste.dialog.insert": "Insérer",
  "markdown-paste.dialog.cancel": "Annuler",
  "markdown-paste.errors.parseFailed": "Impossible d'analyser le Markdown — voir la console.",
  "markdown-paste.errors.editorClosed": "L'éditeur a été fermé. Markdown non inséré.",
  "markdown-paste.settings.enableInJournals.name": "Afficher dans les éditeurs de Journal",
  "markdown-paste.settings.enableInJournals.hint": "Affiche le bouton Coller du Markdown dans les pages de Journal.",
  "markdown-paste.settings.enableInItems.name": "Afficher dans les fiches d'Objets",
  "markdown-paste.settings.enableInItems.hint": "Affiche le bouton Coller du Markdown dans les descriptions d'Objets.",
  "markdown-paste.settings.enableInActors.name": "Afficher dans les fiches d'Acteurs",
  "markdown-paste.settings.enableInActors.hint": "Affiche le bouton Coller du Markdown dans les biographies et notes d'Acteurs.",
  "markdown-paste.settings.enableInChat.name": "Afficher dans le chat",
  "markdown-paste.settings.enableInChat.hint": "Affiche le bouton Coller du Markdown dans la zone de saisie du chat.",
  "markdown-paste.settings.enableElsewhere.name": "Afficher dans les autres éditeurs",
  "markdown-paste.settings.enableElsewhere.hint": "Affiche le bouton Coller du Markdown dans tout autre éditeur ProseMirror (notes de scène, dialogues de modules, etc.).",
  "markdown-paste.settings.gfmBreaks.name": "Sauts de ligne simples",
  "markdown-paste.settings.gfmBreaks.hint": "Si activé, un saut de ligne simple devient <br>. Désactivé par défaut (comportement CommonMark standard)."
}
```

- [ ] **Step 3: Commit**

```bash
git add lang/en.json lang/fr.json
git commit -m "feat: add English and French localization"
```

---

### Task 12: README, CHANGELOG, LICENSE

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`

- [ ] **Step 1: Write LICENSE (MIT)**

```text
MIT License

Copyright (c) 2026 Martin Papy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write CHANGELOG.md**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-26

### Added
- "Paste Markdown" toolbar button in every ProseMirror editor in Foundry v13 / v14.
- Dialog with a paste textarea; on insert, the Markdown is converted to sanitized HTML and inserted at the current selection.
- GitHub Flavored Markdown support (tables, task lists, strikethrough, fenced code, autolinks).
- Foundry enricher tokens (`@UUID[…]`, `[[/r …]]`, etc.) pass through unchanged.
- Per-surface visibility settings: Journals, Items, Actors, Chat, Elsewhere.
- "Treat single newlines as line breaks" setting (off by default).
- English and French localizations.

### Vendored libraries
- `marked` v15.x (`vendor/marked.esm.js`)
- `DOMPurify` v3.x (`vendor/purify.es.mjs`)
```

Replace the version strings with the actual values you noted in Task 2 Step 3.

- [ ] **Step 3: Write README.md**

````markdown
# Markdown Paste

A FoundryVTT module that adds a **"Paste Markdown"** toolbar button to every rich-text editor — Journal pages, item descriptions, actor bios, scene notes, chat. Paste GitHub-Flavored Markdown into the dialog, click Insert, and you get clean HTML at the cursor.

System-agnostic. Works on Foundry v13 and v14.

## Features

- Toolbar button in every ProseMirror editor (toggleable per surface)
- GFM support: tables, task lists, strikethrough, fenced code, autolinks
- Foundry enricher tokens pass through (`@UUID[Actor.x]{Bob}`, `[[/r 1d20]]`, etc.)
- HTML sanitization via DOMPurify — no XSS surface
- Inserts at the cursor (or replaces the selection) — non-destructive

## Installation

In Foundry's **Add-on Modules** tab → **Install Module** → paste this manifest URL:

```
https://github.com/martin-papy/markdown-paste/releases/latest/download/module.json
```

## Usage

1. Open any editor with a ProseMirror toolbar (Journal page, item description, actor bio…).
2. Click the **Markdown** icon in the toolbar.
3. Paste your Markdown into the textarea.
4. Click **Insert**. Converted HTML lands at the cursor.

## Settings

Found under **Configure Settings → Module Settings → Markdown Paste**:

- **Show in Journal Entry editors** (default: on)
- **Show in Item sheet editors** (default: on)
- **Show in Actor sheet editors** (default: on)
- **Show in chat composer** (default: off)
- **Show in other editors** (default: on)
- **Treat single newlines as line breaks** (default: off — standard CommonMark)

All settings are client-scope (per-user, not GM-controlled).

## Smoke test checklist

Used when validating a new release:

- [ ] Button appears in Journal page editor
- [ ] Button appears in Item description editor
- [ ] Button appears in Actor bio editor
- [ ] Button absent from chat composer (default off)
- [ ] Dialog opens, autofocus on textarea, Insert disabled until content typed
- [ ] Tables, task lists, strikethrough, fenced code blocks convert correctly
- [ ] `@UUID[Actor.x]{label}` survives and enriches at view time
- [ ] `[[/r 1d20]]` survives and is clickable at view time
- [ ] `<script>` in pasted MD is stripped
- [ ] Cursor-position insertion works (not appended at end)
- [ ] Selection replacement works
- [ ] Closing the sheet while dialog is open produces a graceful error toast

## Development

```bash
npm install
npm test
```

The unit-testable conversion pipeline (`scripts/convert.js`) is covered by `tests/convert.test.js` via Node's built-in test runner + jsdom.

## License

MIT — see [LICENSE](LICENSE).
````

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md LICENSE
git commit -m "docs: add README, CHANGELOG, and LICENSE"
```

---

### Task 13: CI test workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Write the test workflow**

```yaml
name: tests

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci || npm install
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run unit tests on PR and develop/main pushes"
```

---

### Task 14: Release workflow + release.sh

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `release.sh`

This is ported from `coc7-qol` with substitutions. Read `/Users/martin.papy/Development/coc7-qol/.github/workflows/release.yml` and `/Users/martin.papy/Development/coc7-qol/release.sh` for the originals, then adapt.

- [ ] **Step 1: Read the coc7-qol originals**

```bash
cat /Users/martin.papy/Development/coc7-qol/.github/workflows/release.yml
cat /Users/martin.papy/Development/coc7-qol/release.sh
```

- [ ] **Step 2: Write `.github/workflows/release.yml`**

Substitute throughout:
- `coc7-qol` → `markdown-paste`
- zip contents: `module.json scripts/ styles/ lang/ vendor/`
- Excluded: `README.md CHANGELOG.md LICENSE .github/ docs/ tests/ package.json node_modules/`

Keep:
- Pre-release tag handling (`vX.Y.Z-beta.N` → GitHub pre-release, skip FoundryVTT publish)
- Stable tag handling (`vX.Y.Z` → FoundryVTT publish via foundry-publisher action or equivalent)

If you cannot read the originals (file permission issue), defer this task to a follow-up commit and write a stub `release.yml` that just builds + attaches the zip on tag push, leaving FoundryVTT submission manual for v0.1.0.

- [ ] **Step 3: Write `release.sh`**

Substitute throughout:
- `coc7-qol` → `markdown-paste`
- Keep the CHANGELOG validation (`## [X.Y.Z] - YYYY-MM-DD` entry must exist before releasing)
- Keep the merge-back-to-develop logic
- Keep the version-bump in `module.json`

```bash
chmod +x release.sh
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml release.sh
git commit -m "ci: port release workflow and release.sh from coc7-qol"
```

---

### Task 15: Issue templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug-report.md` (ported)
- Create: `.github/ISSUE_TEMPLATE/feature-request.md` (ported)

- [ ] **Step 1: Port from coc7-qol**

```bash
mkdir -p .github/ISSUE_TEMPLATE
cp /Users/martin.papy/Development/coc7-qol/.github/ISSUE_TEMPLATE/*.md .github/ISSUE_TEMPLATE/
```

- [ ] **Step 2: Sanity-check the templates and adapt**

Open each template and replace any `coc7-qol`-specific references with `markdown-paste`. Specifically:
- module name in the bug-report body
- any CoC7-specific test steps

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "chore: add issue templates ported from coc7-qol"
```

---

### Task 16: Full smoke test in Foundry

**Files:** none (manual verification)

You need a running Foundry v13 instance and ideally a v14 instance. Symlink (or copy) the module folder into Foundry's `Data/modules/` directory.

- [ ] **Step 1: Symlink the module into Foundry's modules dir**

Replace `<FOUNDRY_DATA>` with your Foundry user data path:

```bash
ln -s /Users/martin.papy/Development/markdown-paste \
      <FOUNDRY_DATA>/modules/markdown-paste
```

- [ ] **Step 2: Run the smoke test checklist against Foundry v13**

Use the checklist from `README.md`. For each item, check it off. If any item fails, the implementation is not complete — open an issue, fix it, commit, and re-test.

- [ ] **Step 3: Run the same checklist against Foundry v14**

Same procedure on the v14 instance.

- [ ] **Step 4: Bump `compatibility.verified`**

If v14 testing passes, leave `compatibility.verified: "14"` as-is in `module.json`. If v14 is not available, downgrade to `"13"` and note this in CHANGELOG.

- [ ] **Step 5: Commit any fixes from smoke testing**

```bash
git add <fixed files>
git commit -m "fix: <smoke-test issue summary>"
```

---

### Task 17: Merge, tag, release

- [ ] **Step 1: Push the feature branch**

```bash
git push -u origin feature-v0.1-bootstrap
```

If `origin` is not configured yet, create the GitHub repo first via `gh repo create martin-papy/markdown-paste --public --source=. --remote=origin`.

- [ ] **Step 2: Open PR feature → develop**

```bash
gh pr create --base develop --head feature-v0.1-bootstrap \
  --title "feat: v0.1.0 bootstrap — Markdown Paste module" \
  --body "$(cat <<'EOF'
## Summary
- Initial implementation of Markdown Paste module per spec
- Adds Paste Markdown button to every ProseMirror editor in Foundry v13/v14
- GFM support, sanitization via DOMPurify, Foundry enricher passthrough
- Six client-scope settings (five per-surface toggles + gfmBreaks)
- English + French localizations
- Unit tests cover scripts/convert.js end-to-end

## Test plan
- [x] npm test passes
- [x] Smoke test checklist passes on Foundry v13
- [x] Smoke test checklist passes on Foundry v14
EOF
)"
```

- [ ] **Step 3: Merge PR to develop**

After CI passes and review (self-review is fine for a bootstrap PR):

```bash
gh pr merge --squash --delete-branch
git checkout develop && git pull
```

- [ ] **Step 4: PR develop → main**

```bash
gh pr create --base main --head develop \
  --title "release: v0.1.0" \
  --body "Initial release of Markdown Paste module."
gh pr merge --merge --delete-branch=false
git checkout main && git pull
```

- [ ] **Step 5: Tag and release via release.sh**

```bash
./release.sh 0.1.0
```

The script bumps `module.json` version, validates CHANGELOG, commits, tags `v0.1.0`, pushes, and merges back to develop. The GitHub Actions release workflow then builds the zip and attaches it to the GitHub Release.

- [ ] **Step 6: Submit to FoundryVTT package registry (manual, first-time only)**

Go to https://foundryvtt.com/packages/submit and fill out the new-package form, pointing the manifest URL at:

```
https://github.com/martin-papy/markdown-paste/releases/latest/download/module.json
```

Subsequent releases (v0.1.1, v0.2.0, …) auto-publish via the release workflow.

---

## After v0.1.0

Once shipped, future work follows the standard two-PR flow:
- `feature-*` or `bugfix-*` from `develop`
- PR → `develop`
- Eventually PR `develop` → `main` + `./release.sh`

Items deferred from v0.1 (do not address in this plan):
- Live Markdown preview pane in the dialog
- MD link → `@UUID` auto-conversion
- Image upload via FilePicker
- Markdown export
