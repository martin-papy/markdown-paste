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
- `marked` v15.0.12 (`vendor/marked.esm.js`)
- `DOMPurify` v3.4.6 (`vendor/purify.es.mjs`)
