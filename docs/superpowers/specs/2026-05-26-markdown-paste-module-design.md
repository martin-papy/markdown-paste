# Markdown Paste — FoundryVTT Module Design

**Date:** 2026-05-26
**Status:** Draft
**Author:** Martin Papy
**Target repo:** new standalone repo `markdown-paste` (sibling of `coc7-qol`), to be created during implementation.

## Problem

FoundryVTT's built-in rich-text editor (ProseMirror) does not understand Markdown. Pasting Markdown source from Obsidian, Notion, GitHub, a wiki, or a stat-block doc lands in the editor as raw text with `#` and `*` characters showing literally. Users have to either retype the formatting by hand or paste into another converter first.

This affects every ProseMirror surface in Foundry: Journal Entry pages, Item descriptions, Actor biographies, scene notes, chat composer. The pain is most acute for long-form prose (Journals) but applies everywhere.

## Goal

A small, focused, system-agnostic FoundryVTT module that adds a **"Paste Markdown"** toolbar button to ProseMirror editors. The button opens a dialog where the user pastes Markdown; on submit, the Markdown is converted to sanitized HTML and inserted at the cursor position in the originating editor.

The module is independent of any game system. It targets Foundry v13 and v14.

## Non-goals

- **Not** a Markdown ↔ HTML round-trip editor. Conversion is one-way: MD → HTML, on user-triggered import.
- **Not** a live Markdown preview. The dialog has no rendered preview pane in v0.1.
- **Not** a file/folder importer. Out of scope — that's what `makreth/obsidian-md-importer` is for. This module only imports text the user pastes.
- **Not** an image uploader. URL `<img>` references survive conversion; local-path or `data:` URIs are not uploaded to Foundry's filepicker.
- **Not** a Markdown export feature. One direction only.

## User experience

### Trigger surface

A toolbar button appears in the ProseMirror menu of every applicable editor:
- Journal Entry pages (default on)
- Item sheet description editors (default on)
- Actor sheet biography/notes editors (default on)
- Chat composer (default off)
- Any other ProseMirror surface — scene notes, module dialogs, etc. (default on, single setting)

The icon uses `fa-brands fa-markdown` (Font Awesome ships with Foundry). Tooltip: `Paste Markdown` (i18n).

### Dialog (DialogV2)

- Title: `Paste Markdown`
- Body:
  - `<textarea>` — full width, ~20 rows, monospace font, autofocus
  - Hint line: `GFM supported (tables, task lists, strikethrough). Foundry @UUID[…] and [[…]] tokens pass through.`
- Buttons: `Insert` (default), `Cancel`
- `Insert` button is disabled while the textarea is empty
- Submitting with empty content: no-op

### Insertion semantics

On `Insert`:
1. Read textarea value
2. Convert MD → HTML via `marked` (GFM enabled)
3. Sanitize via `DOMPurify`
4. Parse sanitized HTML into a ProseMirror slice using the editor's live schema
5. Dispatch `view.dispatch(view.state.tr.replaceSelection(slice))` against the originating editor view
6. Close the dialog; focus returns to the editor

If the user has text selected in the editor when the dialog opens, that selection is replaced. If the user has a collapsed cursor, the slice is inserted at the cursor.

### Error paths

- **MD parse failure** → toast: `Could not parse Markdown — see console`. Dialog stays open with content preserved.
- **Sanitizer strips dangerous content silently.** This is normal sanitization behavior; no warning shown.
- **Originating editor closed while dialog held open** → toast: `Editor was closed. Markdown not inserted.` Content is discarded.

## Architecture

### High-level pipeline

```
[user clicks button in ProseMirror menu]
   ↓
[Dialog opens, capturing reference to view + initial selection]
   ↓
[user pastes MD, clicks Insert]
   ↓
marked.parse(md, { gfm: true, breaks: gfmBreaks })   →  html string
   ↓
DOMPurify.sanitize(html, { allowlist })              →  safe html string
   ↓
new window.DOMParser()
  .parseFromString(safeHtml, "text/html").body       →  detached DOM tree
   ↓
ProseMirror.DOMParser.fromSchema(view.state.schema)
  .parseSlice(domBody)                               →  ProseMirror slice
   ↓
view.dispatch(view.state.tr.replaceSelection(slice))

Note: two distinct `DOMParser`s are used in sequence. `window.DOMParser` (browser
standard, HTML string → DOM tree) feeds `ProseMirror.DOMParser` (from
`prosemirror-model`, DOM tree → ProseMirror slice). Foundry exposes the
ProseMirror namespace as `ProseMirror` globally.
```

### Why ProseMirror menu hook (not floating overlay, not custom plugin)

Foundry v13 and v14 both fire `getProseMirrorMenuItems(menu, items)` when initializing the menu of any ProseMirror editor anywhere in the app. One `Hooks.on` registration covers every surface automatically. The button lives inside the editor chrome, matches Foundry's native button style, and inherits Foundry's responsive menu behavior.

A floating overlay would require per-sheet render hooks and brittle DOM positioning. A custom ProseMirror plugin is heavier and only justified if we later need keymaps or live in-place behavior — YAGNI for v0.1.

### Why marked + DOMPurify (not markdown-it, not prosemirror-markdown)

- **marked**: ~40 KB, GFM built in via `gfm: true` option, single-purpose, battle-tested. No extension juggling.
- **DOMPurify**: industry-standard sanitizer, ~20 KB, browser-safe, allowlist-configurable.
- **markdown-it** was considered. Stronger extension story but unnecessary for our scope.
- **prosemirror-markdown** was considered (direct MD → ProseMirror doc). Rejected because it assumes a specific schema that does not match Foundry's customized ProseMirror schema (which includes Foundry-specific marks/nodes for enrichers, secrets, etc.). Going via HTML lets us round-trip through `DOMParser.fromSchema(view.state.schema)`, which adapts to whatever schema the editor uses — including any v14 additions.

### Foundry enricher passthrough

Tokens like `@UUID[Actor.abc]{Bob}`, `@Check[...]`, `[[/r 1d20]]` are plain text from the perspective of both `marked` and `DOMPurify` — they contain no Markdown syntax that triggers transformation, and no HTML that triggers sanitization. They therefore survive end-to-end as plain text inside the resulting paragraph nodes. Foundry's `TextEditor.enrichHTML` (or its v13/v14 equivalent on the document render path) then converts them at view time. No special handling code required.

### Sanitization allowlist

DOMPurify defaults are appropriate. Two extras configured:
- `ADD_ATTR: ['target', 'rel']` — preserve `target="_blank"` and `rel="noopener noreferrer"` on links produced by autolinks.
- No `data:` URIs allowed in `href` or `src` (DOMPurify default).
- `<script>`, `<iframe>`, event handlers — stripped by default.

## Module structure

Mirrors `coc7-qol` conventions: no build step, vanilla ES modules, Foundry loads files declared in `module.json`.

```
markdown-paste/
├── module.json
├── README.md
├── CHANGELOG.md
├── LICENSE                     (MIT)
├── release.sh                  (ported from coc7-qol)
├── package.json                (devDeps only: jsdom, vitest or node:test)
├── .github/
│   ├── workflows/release.yml   (ported, adapted)
│   ├── workflows/test.yml      (runs convert.js unit tests on PR)
│   └── ISSUE_TEMPLATE/         (ported)
├── lang/
│   ├── en.json
│   └── fr.json
├── styles/
│   └── markdown-paste.css      (dialog textarea sizing, button tweaks)
├── scripts/
│   ├── main.js                 (init hook, settings registration, menu hook wiring)
│   ├── settings.js             (per-surface toggles, registered under module id)
│   ├── menu-button.js          (ProseMirror menu integration, surface detection)
│   ├── dialog.js               (DialogV2 subclass with textarea, validation, submit handler)
│   ├── convert.js              (md → sanitized HTML pipeline; pure function, no Foundry deps)
│   └── insert.js               (HTML → ProseMirror slice + dispatch transaction)
├── vendor/
│   ├── marked.esm.js           (pinned version, vendored)
│   └── purify.es.mjs           (pinned DOMPurify)
└── tests/
    └── convert.test.js         (unit tests for convert.js)
```

Each script file stays under ~150 lines. Responsibilities:

| File | Responsibility | Foundry API touched |
|---|---|---|
| `main.js` | Single entry. Registers settings, registers menu hook, exposes `game.modules.get("markdown-paste").api` for debugging | `Hooks.once("init")`, `Hooks.on("getProseMirrorMenuItems")` |
| `settings.js` | Six boolean settings, all client-scope | `game.settings.register` |
| `menu-button.js` | Builds the `ProseMirrorMenuItem` object; surface-detection logic that walks DOM ancestors to find the host document type and consults settings | `menu.view.dom.closest(...)` |
| `dialog.js` | `DialogV2`-based popup; holds a captured reference to the originating `EditorView` and initial selection; calls `convert` then `insert` on submit | `foundry.applications.api.DialogV2` |
| `convert.js` | Pure function `(mdString, options) => string`. Takes the Markdown source and `{ gfmBreaks: boolean }`, returns sanitized HTML. No Foundry imports. Unit-tested in Node | — |
| `insert.js` | `(view, htmlString) => void`. Uses `window.DOMParser` to parse HTML, then `ProseMirror.DOMParser.fromSchema(view.state.schema).parseSlice(...)` to convert to a slice. Dispatches the transaction. Schema-agnostic | ProseMirror only |

### Module.json highlights

```json
{
  "id": "markdown-paste",
  "title": "Markdown Paste",
  "description": "Paste Markdown into any FoundryVTT rich-text editor.",
  "version": "0.1.0",
  "authors": [{ "name": "Martin Papy" }],
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
  "url": "<github repo url>",
  "manifest": "<github releases manifest url>",
  "download": "<github releases zip url>"
}
```

`url`, `manifest`, `download` are populated during implementation once the repo URL exists.

## Settings

Registered under module id `markdown-paste` during the `init` hook. All client-scope.

| Setting key | Type | Default | Label (i18n) |
|---|---|---|---|
| `enableInJournals` | Boolean | `true` | Show in Journal Entry editors |
| `enableInItems` | Boolean | `true` | Show in Item sheet editors |
| `enableInActors` | Boolean | `true` | Show in Actor sheet editors |
| `enableInChat` | Boolean | `false` | Show in chat composer |
| `enableElsewhere` | Boolean | `true` | Show in other editors (scene notes, modules, etc.) |
| `gfmBreaks` | Boolean | `false` | Treat single newlines as line breaks |

### Surface detection

`menu-button.js` runs when `getProseMirrorMenuItems` fires. It receives `(menu, items)`. From `menu.view.dom`, walk up to the nearest Application element (`closest("[data-appid], .application, [data-application-id]")`) and read its document type:

```
host docName              → setting
-------------------------------
JournalEntryPage          → enableInJournals
Item                      → enableInItems
Actor                     → enableInActors
(matches #chat-form)      → enableInChat
no app ancestor or other  → enableElsewhere
```

If the resolved setting is `false`, the menu item is not pushed and the button is not shown for this mount.

### Why client-scope

These are personal preferences (button visibility, breaks vs. paragraphs). Not GM-controlled gameplay rules. A player who hates the chat button can hide it without affecting anyone else.

### No custom settings UI in v0.1

Foundry's auto-generated boolean checkboxes in the settings panel are sufficient. A grouped settings UI is a YAGNI candidate for a later version.

## Foundry version compatibility

### Hook surface is stable across v13 and v14

Confirmed against `/websites/foundryvtt_api_v13` and `/websites/foundryvtt_api_v14`:

- `getProseMirrorMenuItems(menu, items: ProseMirrorMenuItem[])` — identical signature in both versions
- `getProseMirrorMenuDropDowns(menu, config)` — identical signature in both versions
- `createProseMirrorEditor(uuid, plugins, options)` — identical signature in both versions
- `ProseMirrorMenuItem` interface — identical shape (`action`, `title`, `icon`, `cmd`, `group`, `priority`, etc.)
- `Hooks.on`, `Hooks.once` — stable API
- `DialogV2` (at `foundry.applications.api.DialogV2`) — stable in both
- `game.settings.register` — stable in both

No version branching required for v0.1. `compatibility.minimum: "13"`, `compatibility.verified: "14"`.

### Schema-agnostic insertion

`insert.js` uses `DOMParser.fromSchema(view.state.schema).parseSlice(...)`. The schema is read from the live editor view, so any new nodes/marks Foundry adds in v14 are picked up automatically. We do not assume a fixed schema.

### Diagnostic logging

On `init`, log `Foundry release ${game.release.generation}.${game.release.build}` at `info` level. Helps triage bug reports — purely diagnostic, no conditional logic.

### Testing matrix

Manual smoke-test before each release:
- Foundry v13 latest stable
- Foundry v14 (whatever's available — stable, RC, or beta)

Smoke test checklist:
- [ ] Button appears in Journal page editor
- [ ] Button appears in Item description editor
- [ ] Button appears in Actor bio editor
- [ ] Button absent from chat composer when `enableInChat = false`
- [ ] Dialog opens, autofocus on textarea, Insert disabled until content typed
- [ ] Tables convert correctly (GFM)
- [ ] Task lists convert correctly (GFM)
- [ ] Strikethrough converts correctly (GFM)
- [ ] Fenced code blocks convert correctly
- [ ] `@UUID[Actor.x]{label}` survives and enriches at view time
- [ ] `[[/r 1d20]]` survives and is clickable at view time
- [ ] `<script>` in pasted MD is stripped
- [ ] Cursor-position insertion works (not appended at end)
- [ ] Selection replacement works (selected text replaced by inserted slice)
- [ ] Closing the sheet while dialog is open produces graceful error toast

## Testing strategy

### Unit tests (CI-runnable)

`convert.js` is a pure `(mdString, { gfmBreaks }) => string` function with no Foundry dependencies. Tested in Node + jsdom (DOMPurify needs a DOM):

```
tests/convert.test.js
├── headings (h1–h6)
├── paragraphs
├── bold, italic, strikethrough
├── code spans + fenced blocks
├── blockquotes
├── ordered + unordered lists
├── task lists (GFM)
├── tables (GFM)
├── links and autolinks
├── images (URLs)
├── inline HTML escaping
├── XSS attempts (script tags, onerror handlers, javascript: hrefs) → stripped
└── Foundry tokens (@UUID, [[/r]]) → pass through unchanged
```

Test runner: `node --test` (zero-dep) or `vitest` (dev dep). Decided during implementation.

CI workflow `.github/workflows/test.yml` runs on PR.

### Manual smoke tests

Per the checklist above. Required before tagging a release on `main`.

### No E2E / browser automation in v0.1

Not worth the setup overhead for a module this small. Reconsider if regressions accumulate.

## Release & distribution

### Release flow

Ported from `coc7-qol`. Two-PR development model:
1. `feature-*` branch → PR → `develop`
2. `develop` → PR → `main`
3. From `main`, run `./release.sh` — bumps version in `module.json`, validates `CHANGELOG.md` has an entry, commits, tags, pushes
4. GitHub Actions workflow fires on tag, builds zip, creates GitHub Release, submits to FoundryVTT package registry (after first manual submission)

### Zip contents

```
module.json
scripts/
styles/
lang/
vendor/
```

Excluded: `README.md`, `CHANGELOG.md`, `LICENSE`, `.github/`, `docs/`, `tests/`, `package.json`, `node_modules/`.

### First-release manual step

The FoundryVTT package registry requires manual submission for new packages (not modules). After tagging `v0.1.0`, fill out the package form on foundryvtt.com once, then subsequent releases auto-submit via the release workflow.

### License

MIT, matching `coc7-qol`.

## Open questions

None blocking. Items to resolve during implementation:
- Pin exact versions of `marked` and `DOMPurify` to vendor (latest stable at implementation time).
- Decide between `node --test` and `vitest` for `convert.test.js` (small call, either works).
- Confirm the exact DOM selector for chat composer ancestor in current Foundry v13/v14 (`#chat-form` vs. an updated id).
- Final FA icon class (`fa-brands fa-markdown` confirmed shipped with Foundry's FA bundle; verify at implementation).

## References

- FoundryVTT v13 API — `getProseMirrorMenuItems`: https://foundryvtt.com/api/v13/functions/hookEvents.getProseMirrorMenuItems
- FoundryVTT v14 API — `getProseMirrorMenuItems`: https://foundryvtt.com/api/v14/functions/hookEvents.getProseMirrorMenuItems.html
- FoundryVTT v13 API — `ProseMirrorMenuItem` interface: https://foundryvtt.com/api/v13/interfaces/foundry.prosemirror.types.ProseMirrorMenuItem
- marked: https://marked.js.org
- DOMPurify: https://github.com/cure53/DOMPurify
- ProseMirror `DOMParser`: https://prosemirror.net/docs/ref/#model.DOMParser
- Related existing modules (different scope, not blocking):
  - `CePeU/MarkdownToFoundry` — Obsidian → Foundry exporter
  - `makreth/obsidian-md-importer` — file-based Foundry importer
