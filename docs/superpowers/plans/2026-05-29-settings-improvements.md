# Settings Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GM-controlled world-scoped settings, a "Global Settings" heading, a non-GM access toggle, and a customizable callout-color sub-form to the markdown-paste Foundry module.

**Architecture:** A new pure module (`callout-colors.js`) builds and injects a hex-validated `<style>` overriding the `:root` callout CSS variables for all clients. A new Foundry form (`callout-color-menu.js`) edits a world `Object` setting via `registerMenu`. The form class is imported only from `main.js`, never from `settings.js`, so Node tests (which transitively import `settings.js`) never evaluate `ApplicationV2` at load. Existing settings flip from `client` to `world` scope.

**Tech Stack:** FoundryVTT v13/v14 (`game.settings`, `ApplicationV2` + `HandlebarsApplicationMixin`, `renderSettingsConfig` hook), vanilla ESM, Node's `node:test` + jsdom.

**Branch:** all work on `feature-settings` (already checked out). PR → `develop`, then `develop` → `main`.

**Spec:** `docs/superpowers/specs/2026-05-29-settings-improvements-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/callout-colors.js` | **NEW** pure: `DEFAULT_CALLOUT_COLORS`, `isValidHexColor`, `buildCalloutColorCss`, `applyCalloutColors` |
| `tests/callout-colors.test.js` | **NEW** unit tests for the pure module |
| `scripts/obsidian.js` | **MOD** export `CALLOUT_EMOJI` (consumed by the form) |
| `scripts/settings.js` | **MOD** world scope, `allowNonGM`, `calloutColors` setting + `onChange` |
| `scripts/menu-button.js` | **MOD** non-GM access gate |
| `tests/menu-button.test.js` | **MOD** access-gate tests |
| `scripts/callout-color-menu.js` | **NEW** `CalloutColorMenu` form + `registerColorMenu()` |
| `templates/callout-color-menu.hbs` | **NEW** form template |
| `scripts/main.js` | **MOD** register color menu, settings heading hook, apply colors on `ready` |
| `styles/markdown-paste.css` | **MOD** heading + color-form styles (keep `:root` defaults) |
| `lang/en.json`, `lang/fr.json` | **MOD** new i18n keys |
| `.github/workflows/release.yml` | **MOD** add `templates/` to the zip |
| `CLAUDE.md` | **MOD** add `templates/` to documented zip contents |
| `CHANGELOG.md` | **MOD** new entry incl. scope-migration note |

---

## Task 1: Pure callout-colors module

**Files:**
- Create: `scripts/callout-colors.js`
- Test: `tests/callout-colors.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/callout-colors.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CALLOUT_TYPES } from '../scripts/obsidian.js';
import {
  DEFAULT_CALLOUT_COLORS,
  isValidHexColor,
  buildCalloutColorCss,
  applyCalloutColors,
} from '../scripts/callout-colors.js';

test('DEFAULT_CALLOUT_COLORS has a valid hex value for all 13 callout types', () => {
  assert.equal(Object.keys(DEFAULT_CALLOUT_COLORS).length, 13);
  for (const type of CALLOUT_TYPES) {
    assert.ok(isValidHexColor(DEFAULT_CALLOUT_COLORS[type]), `missing/invalid: ${type}`);
  }
});

test('isValidHexColor accepts #rgb and #rrggbb in any case', () => {
  assert.ok(isValidHexColor('#abc'));
  assert.ok(isValidHexColor('#AABBCC'));
  assert.ok(isValidHexColor('#ff9800'));
});

test('isValidHexColor rejects non-hex, wrong length, and injection attempts', () => {
  assert.equal(isValidHexColor(''), false);
  assert.equal(isValidHexColor('red'), false);
  assert.equal(isValidHexColor('#gggggg'), false);
  assert.equal(isValidHexColor('#12'), false);
  assert.equal(isValidHexColor('#fff;}body{display:none'), false);
  assert.equal(isValidHexColor(123), false);
  assert.equal(isValidHexColor(null), false);
});

test('buildCalloutColorCss emits a --md-callout-<type> declaration for all 13 types', () => {
  const css = buildCalloutColorCss(DEFAULT_CALLOUT_COLORS);
  assert.ok(css.startsWith(':root{'));
  assert.ok(css.endsWith('}'));
  for (const type of CALLOUT_TYPES) {
    assert.ok(css.includes(`--md-callout-${type}:${DEFAULT_CALLOUT_COLORS[type]};`), type);
  }
});

test('buildCalloutColorCss substitutes the default for invalid or missing values', () => {
  const css = buildCalloutColorCss({ warning: 'red; } body {}', note: undefined });
  assert.ok(css.includes(`--md-callout-warning:${DEFAULT_CALLOUT_COLORS.warning};`));
  assert.ok(css.includes(`--md-callout-note:${DEFAULT_CALLOUT_COLORS.note};`));
  // No raw injection payload leaks into the stylesheet.
  assert.equal(css.includes('body'), false);
});

test('applyCalloutColors injects exactly one <style> and updates it on re-call', () => {
  const { document } = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>').window;

  applyCalloutColors({ ...DEFAULT_CALLOUT_COLORS, warning: '#000000' }, document);
  let styles = document.querySelectorAll('#markdown-paste-callout-colors');
  assert.equal(styles.length, 1);
  assert.ok(styles[0].textContent.includes('--md-callout-warning:#000000;'));

  applyCalloutColors({ ...DEFAULT_CALLOUT_COLORS, warning: '#ffffff' }, document);
  styles = document.querySelectorAll('#markdown-paste-callout-colors');
  assert.equal(styles.length, 1, 're-call must update, not duplicate');
  assert.ok(styles[0].textContent.includes('--md-callout-warning:#ffffff;'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import ./tests/setup.js tests/callout-colors.test.js`
Expected: FAIL — cannot resolve `../scripts/callout-colors.js` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/callout-colors.js`:

```js
// scripts/callout-colors.js
// Pure callout-color helpers. No Foundry imports; `document` is only touched
// inside applyCalloutColors (default arg evaluated at call time), so this module
// is safe to import in Node + jsdom.
import { CALLOUT_TYPES } from './obsidian.js';

/** Default callout accent colors — mirrors the :root values in markdown-paste.css. */
export const DEFAULT_CALLOUT_COLORS = {
  note: '#448aff', abstract: '#00b8d4', info: '#448aff', todo: '#448aff',
  tip: '#00bfa5', success: '#00c853', question: '#f2c037', warning: '#ff9800',
  failure: '#ff5252', danger: '#ff1744', bug: '#f50057', example: '#7c4dff',
  quote: '#9e9e9e',
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @param {unknown} value
 * @returns {boolean} true only for "#rgb" / "#rrggbb" strings.
 */
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

const STYLE_ID = 'markdown-paste-callout-colors';

/**
 * Build a :root stylesheet overriding the callout color variables. Each value is
 * validated; invalid/missing entries fall back to the default so a tampered world
 * setting cannot inject arbitrary CSS through the <style> sink.
 * @param {Record<string,string>} [colors]
 * @returns {string}
 */
export function buildCalloutColorCss(colors = {}) {
  const decls = CALLOUT_TYPES.map((type) => {
    const raw = colors[type];
    const safe = isValidHexColor(raw) ? raw : DEFAULT_CALLOUT_COLORS[type];
    return `--md-callout-${type}:${safe};`;
  }).join('');
  return `:root{${decls}}`;
}

/**
 * Inject or update the single callout-color <style> element in <head>.
 * @param {Record<string,string>} colors
 * @param {Document} [doc]
 * @returns {HTMLStyleElement}
 */
export function applyCalloutColors(colors, doc = document) {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildCalloutColorCss(colors);
  return style;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import ./tests/setup.js tests/callout-colors.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/callout-colors.js tests/callout-colors.test.js
git commit -m "feat: add pure callout-color CSS builder and injector"
```

---

## Task 2: Export CALLOUT_EMOJI from obsidian.js

The color form labels each row with its callout emoji. `CALLOUT_EMOJI` is currently a private const.

**Files:**
- Modify: `scripts/obsidian.js:4`
- Test: `tests/obsidian.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/obsidian.test.js`:

```js
test('CALLOUT_EMOJI is exported with an entry for every callout type', async () => {
  const { CALLOUT_EMOJI, CALLOUT_TYPES } = await import('../scripts/obsidian.js');
  assert.equal(typeof CALLOUT_EMOJI, 'object');
  for (const type of CALLOUT_TYPES) {
    assert.equal(typeof CALLOUT_EMOJI[type], 'string');
    assert.ok(CALLOUT_EMOJI[type].length > 0, `missing emoji: ${type}`);
  }
});
```

> If `test` / `assert` are not already imported at the top of `tests/obsidian.test.js`, reuse the existing imports there (the file already uses `node:test` and `node:assert/strict`). Do not add duplicate imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: FAIL — `CALLOUT_EMOJI` is `undefined` (not exported).

- [ ] **Step 3: Write minimal implementation**

In `scripts/obsidian.js`, change line 4 from:

```js
const CALLOUT_EMOJI = {
```

to:

```js
export const CALLOUT_EMOJI = {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import ./tests/setup.js tests/obsidian.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/obsidian.js tests/obsidian.test.js
git commit -m "refactor: export CALLOUT_EMOJI for the callout-color form"
```

---

## Task 3: World scope, allowNonGM, and calloutColors setting

Flip the 6 existing settings to world scope, add the `allowNonGM` Boolean, and register the non-config `calloutColors` object setting whose `onChange` re-applies colors live.

**Files:**
- Modify: `scripts/settings.js` (whole file)

- [ ] **Step 1: Rewrite settings.js**

Replace the entire contents of `scripts/settings.js` with:

```js
// scripts/settings.js
import { applyCalloutColors, DEFAULT_CALLOUT_COLORS } from './callout-colors.js';

export const MODULE_ID = 'markdown-paste';

const SETTINGS = [
  { key: 'enableInJournals', def: true,  nameKey: 'markdown-paste.settings.enableInJournals.name',  hintKey: 'markdown-paste.settings.enableInJournals.hint' },
  { key: 'enableInItems',    def: true,  nameKey: 'markdown-paste.settings.enableInItems.name',     hintKey: 'markdown-paste.settings.enableInItems.hint' },
  { key: 'enableInActors',   def: true,  nameKey: 'markdown-paste.settings.enableInActors.name',    hintKey: 'markdown-paste.settings.enableInActors.hint' },
  { key: 'enableElsewhere',  def: true,  nameKey: 'markdown-paste.settings.enableElsewhere.name',   hintKey: 'markdown-paste.settings.enableElsewhere.hint' },
  { key: 'gfmBreaks',        def: false, nameKey: 'markdown-paste.settings.gfmBreaks.name',         hintKey: 'markdown-paste.settings.gfmBreaks.hint' },
  { key: 'processObsidian',  def: true,  nameKey: 'markdown-paste.settings.processObsidian.name',   hintKey: 'markdown-paste.settings.processObsidian.hint' },
  { key: 'allowNonGM',       def: false, nameKey: 'markdown-paste.settings.allowNonGM.name',        hintKey: 'markdown-paste.settings.allowNonGM.hint' },
];

export function registerSettings() {
  for (const s of SETTINGS) {
    game.settings.register(MODULE_ID, s.key, {
      name: s.nameKey,
      hint: s.hintKey,
      scope: 'world',
      config: true,
      type: Boolean,
      default: s.def,
    });
  }

  // Callout colors: world-scoped object, edited via the registerMenu sub-form
  // (see callout-color-menu.js). onChange re-applies the palette live.
  game.settings.register(MODULE_ID, 'calloutColors', {
    scope: 'world',
    config: false,
    type: Object,
    default: DEFAULT_CALLOUT_COLORS,
    onChange: (value) => applyCalloutColors(value),
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
```

- [ ] **Step 2: Verify the existing test suite still imports cleanly**

Run: `node --test --import ./tests/setup.js tests/menu-button.test.js`
Expected: PASS — `menu-button.test.js` transitively imports `settings.js` → `callout-colors.js` → `obsidian.js`, none of which touch `foundry`/`document` at import time. (The `allowNonGM` change to gating is added in Task 4; with the current `game.settings.get: () => true` stub, all existing tests stay green.)

- [ ] **Step 3: Commit**

```bash
git add scripts/settings.js
git commit -m "feat: make settings world-scoped, add allowNonGM and calloutColors"
```

---

## Task 4: Non-GM access gate in the menu hook

**Files:**
- Modify: `scripts/menu-button.js:43-46`
- Test: `tests/menu-button.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/menu-button.test.js` (after the existing tests):

```js
// --- Access gate (allowNonGM) -------------------------------------------------
// resolveSurfaceSetting on makeMenu() returns 'enableElsewhere' (no host app).
// A keyed game.settings.get lets each test control allowNonGM vs the surface flag.

function withGame(user, getImpl, fn) {
  const prev = globalThis.game;
  globalThis.game = { user, settings: { get: getImpl } };
  try { return fn(); } finally { globalThis.game = prev; }
}

test('non-GM is blocked when allowNonGM is disabled', () => {
  withGame({ isGM: false }, (m, key) => (key === 'allowNonGM' ? false : true), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 0);
  });
});

test('non-GM is allowed when allowNonGM is enabled and the surface is enabled', () => {
  withGame({ isGM: false }, () => true, () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 1);
  });
});

test('non-GM allowed but surface disabled → no button (per-surface gate still applies)', () => {
  withGame({ isGM: false }, (m, key) => (key === 'allowNonGM' ? true : false), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 0);
  });
});

test('GM is allowed even when allowNonGM is disabled', () => {
  withGame({ isGM: true }, (m, key) => (key === 'allowNonGM' ? false : true), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import ./tests/setup.js tests/menu-button.test.js`
Expected: FAIL — "non-GM is blocked when allowNonGM is disabled" and "non-GM allowed but surface disabled" report `items.length` of 1 / 0 mismatches, because the gate does not exist yet (the hook ignores `game.user`/`allowNonGM`).

- [ ] **Step 3: Add the access gate**

In `scripts/menu-button.js`, change the body of the `Hooks.on('getProseMirrorMenuItems', ...)` callback (starting at line 43) so its first statements are:

```js
  Hooks.on('getProseMirrorMenuItems', (menu, items) => {
    // Global access gate: non-GM users only see the button when the GM allows it.
    // GMs always pass; the per-surface gate below still applies to everyone.
    if (!game.user?.isGM && !getSetting('allowNonGM')) return;

    const settingKey = resolveSurfaceSetting(menu.view);
    if (!getSetting(settingKey)) return;
```

Leave the rest of the callback (the `items.push({ ... })` block) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import ./tests/setup.js tests/menu-button.test.js`
Expected: PASS — all existing tests plus the 4 new gate tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/menu-button.js tests/menu-button.test.js
git commit -m "feat: gate the Paste Markdown button behind allowNonGM for non-GMs"
```

---

## Task 5: Callout-color form template

**Files:**
- Create: `templates/callout-color-menu.hbs`

- [ ] **Step 1: Create the template**

Create `templates/callout-color-menu.hbs`:

```handlebars
<div class="markdown-paste-callout-colors">
  <p class="hint">{{localize "markdown-paste.settings.calloutColors.hint"}}</p>
  <div class="mp-color-grid">
    {{#each rows}}
    <div class="mp-color-row">
      <span class="mp-color-label">{{this.emoji}} {{this.label}}</span>
      <blockquote class="md-callout md-callout-{{this.type}} mp-color-preview"
        data-preview="{{this.type}}" style="--md-callout-color: {{this.color}}">
        <p class="md-callout-title"><strong>{{this.emoji}} {{this.label}}</strong></p>
      </blockquote>
      <input type="color" name="{{this.type}}" value="{{this.color}}">
    </div>
    {{/each}}
  </div>
  <footer class="mp-color-footer">
    <button type="button" data-action="reset">
      <i class="fa-solid fa-rotate-left"></i> {{localize "markdown-paste.calloutColors.reset"}}
    </button>
    <button type="submit">
      <i class="fa-solid fa-floppy-disk"></i> {{localize "markdown-paste.calloutColors.save"}}
    </button>
  </footer>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add templates/callout-color-menu.hbs
git commit -m "feat: add callout-color form template"
```

---

## Task 6: CalloutColorMenu form + registerColorMenu

This module evaluates `HandlebarsApplicationMixin(ApplicationV2)` at import, so it requires `foundry` at load and must NOT be imported by `settings.js` or any test. It is imported only by `main.js`.

**Files:**
- Create: `scripts/callout-color-menu.js`

- [ ] **Step 1: Create the form module**

Create `scripts/callout-color-menu.js`:

```js
// scripts/callout-color-menu.js
// Foundry-only: the class extends ApplicationV2 at import time, so this module is
// loaded exclusively from main.js (init hook), never from settings.js or tests.
import { MODULE_ID, getSetting } from './settings.js';
import { CALLOUT_TYPES, CALLOUT_EMOJI } from './obsidian.js';
import { DEFAULT_CALLOUT_COLORS, isValidHexColor } from './callout-colors.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CalloutColorMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'markdown-paste-callout-colors',
    tag: 'form',
    window: {
      title: 'markdown-paste.calloutColors.title',
      icon: 'fa-solid fa-palette',
      contentClasses: ['standard-form'],
    },
    position: { width: 520, height: 'auto' },
    form: { handler: CalloutColorMenu.#onSubmit, closeOnSubmit: true },
    actions: { reset: CalloutColorMenu.#onReset },
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/callout-color-menu.hbs` },
  };

  async _prepareContext() {
    const stored = getSetting('calloutColors') || {};
    const rows = CALLOUT_TYPES.map((type) => ({
      type,
      emoji: CALLOUT_EMOJI[type],
      label: game.i18n.localize(`markdown-paste.callouts.${type}`),
      color: isValidHexColor(stored[type]) ? stored[type] : DEFAULT_CALLOUT_COLORS[type],
    }));
    return { rows };
  }

  /** Wire live previews: changing a picker updates its swatch's accent color. */
  _onRender() {
    for (const input of this.element.querySelectorAll('input[type="color"]')) {
      input.addEventListener('input', (event) => {
        const preview = this.element.querySelector(`[data-preview="${event.target.name}"]`);
        if (preview) preview.style.setProperty('--md-callout-color', event.target.value);
      });
    }
  }

  /** Reset every picker to the default palette and refresh previews. */
  static #onReset() {
    for (const type of CALLOUT_TYPES) {
      const input = this.element.querySelector(`input[name="${type}"]`);
      if (!input) continue;
      input.value = DEFAULT_CALLOUT_COLORS[type];
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /** Persist the chosen colors (hex-validated) to the world setting. */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const colors = {};
    for (const type of CALLOUT_TYPES) {
      colors[type] = isValidHexColor(data[type]) ? data[type] : DEFAULT_CALLOUT_COLORS[type];
    }
    await game.settings.set(MODULE_ID, 'calloutColors', colors);
  }
}

/** Register the color sub-form under the module's settings (GM-only). */
export function registerColorMenu() {
  game.settings.registerMenu(MODULE_ID, 'calloutColorsMenu', {
    name: 'markdown-paste.settings.calloutColors.name',
    label: 'markdown-paste.settings.calloutColors.label',
    hint: 'markdown-paste.settings.calloutColors.hint',
    icon: 'fa-solid fa-palette',
    type: CalloutColorMenu,
    restricted: true,
  });
}
```

- [ ] **Step 2: Verify Node tests are unaffected**

Run: `npm test`
Expected: PASS — no test imports `callout-color-menu.js`, so `foundry` being undefined in Node never triggers.

- [ ] **Step 3: Commit**

```bash
git add scripts/callout-color-menu.js
git commit -m "feat: add CalloutColorMenu sub-form and registerMenu registration"
```

---

## Task 7: Wire main.js (heading hook, color menu, apply-on-ready)

**Files:**
- Modify: `scripts/main.js` (whole file)

- [ ] **Step 1: Rewrite main.js**

Replace the entire contents of `scripts/main.js` with:

```js
// scripts/main.js
import { registerSettings, getSetting, MODULE_ID } from './settings.js';
import { registerMenuHook } from './menu-button.js';
import { registerColorMenu } from './callout-color-menu.js';
import { applyCalloutColors } from './callout-colors.js';

Hooks.once('init', () => {
  console.info(
    `${MODULE_ID} | Initializing on Foundry release `
    + `${game.release?.generation}.${game.release?.build}`
  );
  registerSettings();
  registerColorMenu();
  registerMenuHook();
  registerSettingsHeading();
});

Hooks.once('ready', () => {
  // Apply the world's callout palette on every client (GM and players).
  applyCalloutColors(getSetting('calloutColors'));
});

/**
 * Inject a "Global Settings" heading before this module's first setting in the
 * Settings Configuration form. Best-effort and UI-only: no-op if the expected
 * markup is absent, so it never throws.
 */
function registerSettingsHeading() {
  Hooks.on('renderSettingsConfig', (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const anchor = root.querySelector(`[data-setting-id^="${MODULE_ID}."]`);
    const group = anchor?.closest('.form-group');
    if (!group?.parentElement) return;

    // Idempotent: don't inject twice if the form re-renders.
    if (group.previousElementSibling?.classList?.contains('markdown-paste-settings-heading')) return;

    const heading = document.createElement('h3');
    heading.className = 'markdown-paste-settings-heading';
    heading.textContent = game.i18n.localize('markdown-paste.settings.heading.global');
    group.parentElement.insertBefore(heading, group);
  });
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — `main.js` is not imported by any test; suite remains green.

- [ ] **Step 3: Commit**

```bash
git add scripts/main.js
git commit -m "feat: register color menu, settings heading, and apply colors on ready"
```

---

## Task 8: Styles

**Files:**
- Modify: `styles/markdown-paste.css` (append; keep existing `:root` defaults)

- [ ] **Step 1: Append styles**

Append to the end of `styles/markdown-paste.css`:

```css
/* ── Settings: "Global Settings" section heading ───────────────────────── */
.markdown-paste-settings-heading {
  margin: 1em 0 0.5em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--color-border-light-tertiary, #c9c7b8);
  font-size: var(--font-size-16, 16px);
}

/* ── Callout color menu ────────────────────────────────────────────────── */
.markdown-paste-callout-colors .mp-color-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  margin: 0.5em 0;
}
.markdown-paste-callout-colors .mp-color-row {
  display: grid;
  grid-template-columns: 9em 1fr 3em;
  align-items: center;
  gap: 0.75em;
}
.markdown-paste-callout-colors .mp-color-label {
  white-space: nowrap;
  font-weight: bold;
}
.markdown-paste-callout-colors .mp-color-preview {
  margin: 0;
  padding: 0.25em 0.5em;
}
.markdown-paste-callout-colors .mp-color-preview .md-callout-title {
  margin: 0;
}
.markdown-paste-callout-colors input[type="color"] {
  width: 100%;
  height: 2em;
  padding: 0;
  cursor: pointer;
}
.markdown-paste-callout-colors .mp-color-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
  margin-top: 1em;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/markdown-paste.css
git commit -m "style: add settings heading and callout-color menu styles"
```

---

## Task 9: i18n keys (en + fr)

**Files:**
- Modify: `lang/en.json`, `lang/fr.json`

- [ ] **Step 1: Add English keys**

In `lang/en.json`, add a trailing comma to the current last entry (`"markdown-paste.callouts.quote": "Quote"`) and append these keys before the closing `}`:

```json
  "markdown-paste.settings.heading.global": "Global Settings",
  "markdown-paste.settings.allowNonGM.name": "Allow non-GM players to use Paste Markdown",
  "markdown-paste.settings.allowNonGM.hint": "When enabled, non-GM users also see the Paste Markdown button (still subject to the per-surface toggles above). When disabled, only GMs see it.",
  "markdown-paste.settings.calloutColors.name": "Callout colors",
  "markdown-paste.settings.calloutColors.label": "Configure callout colors",
  "markdown-paste.settings.calloutColors.hint": "Customize the accent color of each Obsidian callout type. Changes apply to all callouts for every user.",
  "markdown-paste.calloutColors.title": "Callout Colors",
  "markdown-paste.calloutColors.reset": "Reset to defaults",
  "markdown-paste.calloutColors.save": "Save Changes"
```

- [ ] **Step 2: Add French keys**

In `lang/fr.json`, add a trailing comma to the current last entry and append before the closing `}`:

```json
  "markdown-paste.settings.heading.global": "Paramètres globaux",
  "markdown-paste.settings.allowNonGM.name": "Autoriser les joueurs non-MJ à utiliser Coller du Markdown",
  "markdown-paste.settings.allowNonGM.hint": "Lorsque cette option est activée, les utilisateurs non-MJ voient aussi le bouton Coller du Markdown (toujours soumis aux interrupteurs par surface ci-dessus). Lorsqu'elle est désactivée, seuls les MJ le voient.",
  "markdown-paste.settings.calloutColors.name": "Couleurs des encadrés",
  "markdown-paste.settings.calloutColors.label": "Configurer les couleurs des encadrés",
  "markdown-paste.settings.calloutColors.hint": "Personnalisez la couleur d'accentuation de chaque type d'encadré Obsidian. Les changements s'appliquent à tous les encadrés pour tous les utilisateurs.",
  "markdown-paste.calloutColors.title": "Couleurs des encadrés",
  "markdown-paste.calloutColors.reset": "Réinitialiser",
  "markdown-paste.calloutColors.save": "Enregistrer"
```

- [ ] **Step 3: Validate both files parse as JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); JSON.parse(require('fs').readFileSync('lang/fr.json','utf8')); console.log('lang JSON OK')"`
Expected: prints `lang JSON OK` (no SyntaxError). Fix any missing/trailing commas if it throws.

- [ ] **Step 4: Commit**

```bash
git add lang/en.json lang/fr.json
git commit -m "i18n: add settings heading, allowNonGM, and callout-color strings"
```

---

## Task 10: Packaging — ship templates/

**Files:**
- Modify: `.github/workflows/release.yml:84`
- Modify: `CLAUDE.md` (Zip contents section)

- [ ] **Step 1: Add templates/ to the release zip**

In `.github/workflows/release.yml`, change line 84 from:

```bash
          zip -r markdown-paste.zip module.json scripts/ styles/ lang/ vendor/
```

to:

```bash
          zip -r markdown-paste.zip module.json scripts/ styles/ lang/ templates/ vendor/
```

- [ ] **Step 2: Update the documented zip contents in CLAUDE.md**

In `CLAUDE.md`, in the "Zip contents" code block, change:

```
module.json
scripts/
styles/
lang/
vendor/
```

to:

```
module.json
scripts/
styles/
lang/
templates/
vendor/
```

Also, in the "Manual fallback" `zip -r` command in `CLAUDE.md`, add `templates/` in the same position so the manual path matches the workflow.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml CLAUDE.md
git commit -m "build: include templates/ in the release zip"
```

---

## Task 11: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add an Unreleased entry**

Open `CHANGELOG.md`. If a `## [Unreleased]` section exists, add the bullets under it; otherwise create one directly below the title/intro and above the most recent version entry:

```markdown
## [Unreleased]

### Added
- Customizable callout colors via a new "Configure callout colors" settings menu (13 color pickers with live preview and reset-to-defaults). Colors apply to all callouts for every user.
- "Global Settings" section heading in the module settings.
- "Allow non-GM players to use Paste Markdown" option. When off (default), only GMs see the button; per-surface toggles still apply.

### Changed
- All module settings are now world-scoped and GM-controlled (previously per-client). **Migration note:** existing per-client toggle preferences do not carry over and reset to defaults on first load after upgrade.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for settings improvements"
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites (`convert`, `obsidian`, `menu-button`, `callout-colors`) green.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors. (If ESLint flags an unused `event`/`form` parameter in `#onSubmit`, prefix with the project's convention or remove only if the linter requires it — do not change the handler signature Foundry calls.)

- [ ] **Step 3: Manual in-app verification checklist (Foundry v13/v14)**

Document results in the PR description:

1. Open **Configure Settings → Module Settings**: the **Global Settings** heading appears above the markdown-paste toggles.
2. As a **player (non-GM)** with `allowNonGM` off: the Paste Markdown button is hidden in all editors.
3. Enable **Allow non-GM players**: the button appears for players, but only in surfaces whose per-surface toggle is on (disable "Show in Journal Entry editors" → button gone there, still present elsewhere).
4. World settings change made by the GM is reflected for connected players.
5. Open **Configure callout colors**: 13 rows show emoji + label + live preview + picker, pre-filled from current values.
6. Change a color → its preview swatch updates live. Click **Reset to defaults** → all pickers + previews revert. **Save** → dialog closes.
7. After save, an existing journal containing a callout of that type recolors **without reload**; a freshly pasted callout uses the new color too.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature-settings
```

---

## Notes for the implementer

- **Why the form lives apart from settings.js:** `callout-color-menu.js` evaluates `HandlebarsApplicationMixin(ApplicationV2)` at import. `settings.js` is transitively imported by `tests/menu-button.test.js`, which runs in Node where `foundry` is undefined. Keep the form import out of `settings.js`'s graph — `main.js` (never imported by tests) is the only importer.
- **`applyCalloutColors(colors, doc = document)`:** the `document` default is evaluated only when called without `doc`. Tests always pass a jsdom `document`; Foundry has a real one. Never call it at module top-level.
- **Security:** `buildCalloutColorCss` and the form's `#onSubmit` both re-validate every value with `isValidHexColor`. This is the only sanitization point for the injected `<style>` — do not remove it. It keeps the existing `FORBID_ATTR: ['style']` posture intact.
- **TDD-untestable pieces** (`callout-color-menu.js`, `renderSettingsConfig` hook, `registerColorMenu`) are verified manually per Task 12 Step 3, consistent with the project's strategy where `dialog.js`/`main.js` are not unit-tested.
```
