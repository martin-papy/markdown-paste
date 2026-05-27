# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-05-27

### Removed
- **Show in chat composer** setting (`enableInChat`) and chat-surface detection. The button rendered correctly but overflowed Foundry's narrow, non-wrapping chat toolbar and could not be reliably shown; the feature was niche and is dropped rather than worked around. (#4)

## [0.1.0] - 2026-05-26

### Added
- "Paste Markdown" toolbar button in every ProseMirror editor in Foundry v13 / v14.
- Dialog with a paste textarea; on insert, the Markdown is converted to sanitized HTML and inserted at the current selection.
- GitHub Flavored Markdown support (tables, task lists, strikethrough, fenced code, autolinks).
- Foundry enricher tokens (`@UUID[…]`, `[[/r …]]`, etc.) pass through unchanged.
- Obsidian compatibility: YAML frontmatter becomes a "Properties" table, callouts (`> [!tip]`, `[!note]`, `[!quote]`, …) become styled blockquotes with emoji + title, and `[[wikilinks]]` are reduced to plain text (Foundry `[[/r …]]` rolls preserved).
- "Process Obsidian syntax" setting (on by default).
- Per-surface visibility settings: Journals, Items, Actors, Chat, Elsewhere.
- "Treat single newlines as line breaks" setting (off by default).
- English and French localizations.

### Vendored libraries
- `marked` v18.0.4 (`vendor/marked.esm.js`)
- `DOMPurify` v3.4.6 (`vendor/purify.es.mjs`)
