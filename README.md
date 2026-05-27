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
