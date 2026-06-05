# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- Pasting a table followed by a paragraph no longer throws a parse error. Foundry treats tables as isolating blocks, which crashed ProseMirror's slice fitter; insertion now falls back to inserting fully-closed content when that happens. (#16)
- A note or sentence placed directly under a table (no blank line) is no longer swallowed as a stray table row when "Process Obsidian syntax" is on — it now renders as its own paragraph, matching Obsidian and Typora. (#16)

## [0.3.0] - 2026-05-29

### Added
- Customizable callout **and highlight** colors via a new "Configure colors" settings menu (13 callout pickers, with live preview and reset-to-defaults). Colors apply to all callouts and highlights for every user, retroactively.
- "Allow non-GM players to use Paste Markdown" option. When off (default), only GMs see the button; the per-surface toggles still apply.

### Changed
- All module settings are now world-scoped and GM-controlled (previously per-client).
- `==highlight==` now renders as `<mark class="md-highlight">`. Its color is themeable via the new setting.

## [0.2.1] - 2026-05-28

### Fixed
- Strengthened link security for external links opened in new tabs with additional protective attributes
- Improved HTML sanitization by removing inline style attributes to enhance overall security

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
