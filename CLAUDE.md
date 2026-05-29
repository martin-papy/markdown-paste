# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dev deps (jsdom for tests, marked + dompurify for vendor regeneration)
npm test             # run all tests via Node built-in test runner
npm run vendor       # regenerate vendor/ ESM bundles from installed npm packages
```

Run a single test file:
```bash
node --test --import ./tests/setup.js tests/convert.test.js
```

## What This Is

A FoundryVTT module (v13/v14) that adds a **Paste Markdown** button to every ProseMirror editor in Foundry. `module.json` declares the entry point and compatibility; `scripts/main.js` is the sole ESModule loaded by Foundry at runtime.

## Architecture

The data flow is: **Toolbar hook → Dialog → Convert → Insert**

```
scripts/main.js          Foundry init hook — registerSettings() + registerColorMenu() +
                         registerMenuHook() + a "Global Settings" heading hook; on ready,
                         applies the callout palette to every client
scripts/settings.js      MODULE_ID constant + 7 world-scoped boolean settings (GM-controlled)
                         plus the non-config calloutColors object setting
scripts/callout-colors.js   Pure: DEFAULT_CALLOUT_COLORS, isValidHexColor, buildCalloutColorCss,
                         applyCalloutColors (injects a <style> overriding :root vars). No Foundry import.
scripts/callout-color-menu.js  CalloutColorMenu (ApplicationV2 + Handlebars) + registerColorMenu();
                         the 13-picker sub-form (registerMenu). Foundry-only — imported only by main.js
scripts/menu-button.js   getProseMirrorMenuItems hook — detects surface (Journal/Item/Actor),
                         gates on setting, adds the toolbar button
scripts/dialog.js        DialogV2.wait() — builds textarea UI, reads settings, calls convert(),
                         checks view.dom is still in the document, then calls insertHtml()
scripts/convert.js       Pure function: MD string → sanitized HTML. Receives marked + DOMPurify
                         as injected deps (no Foundry import) so it is unit-testable in Node+jsdom
scripts/obsidian.js      Obsidian-layer transforms: extractFrontmatter, frontmatterToHtml,
                         stripWikiLinks, transformCallouts. No Foundry imports — fully testable.
scripts/insert.js        Uses ProseMirror.DOMParser + view.state.tr.replaceSelection to insert
                         the HTML slice at the current cursor / selection
```

## Vendored Libraries

`vendor/` contains **committed, generated** ESM bundles — never edit them by hand:

- `vendor/marked.esm.js` ← `marked`
- `vendor/purify.es.mjs` ← `dompurify`

After bumping versions in `package.json`, run `npm install && npm run vendor && npm test`. CI will fail if `vendor/` diverges from the pinned package versions.

## i18n

All UI strings are keys like `markdown-paste.dialog.title`. English in `lang/en.json`, French in `lang/fr.json`. The Obsidian layer receives localized labels injected by `dialog.js` via `game.i18n.localize()`, so `obsidian.js` itself has no Foundry dependency.

## Testing Strategy

Tests live in `tests/` and run under Node's built-in `node:test` runner. There is no Jest/Vitest. jsdom is configured per-suite (not globally). `convert.js` and `obsidian.js` are deliberately free of Foundry globals so they can be unit-tested in Node.

## Development workflow

- The default ongoing development branch is `develop`. `main` only receives released code.
- Unless explicitly instructed otherwise, every new feature or fix gets its own branch off `develop`, named `feature-xxx` for features or `bugfix-yyy` for fixes. Use branches, not git worktrees.
- A change ships in two PRs: feature/bugfix branch → `develop`, then `develop` → `main`. The release workflow then runs from the tag pushed on `main` (see [Releasing](#releasing)).

## Releasing

Releases are automated by `.github/workflows/release.yml`, which fires on any tag matching `v*`.

### Standard flow

From the `main` branch, run:

    ./release.sh

The script handles version selection, `module.json` edits, the release commit, tag creation, push, and the merge-back to `develop`. It validates that `CHANGELOG.md` already has a `## [X.Y.Z] - YYYY-MM-DD` entry for the target version and aborts cleanly if not.

End state: you are on `develop`, fully synced with `main`. The GitHub Actions release workflow runs from the pushed tag and submits to FoundryVTT.

Pre-release tags (`vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, etc.) create a GitHub pre-release and skip the FoundryVTT publish step.

### Zip contents

The workflow builds `markdown-paste.zip` containing the runtime files referenced by `module.json`:

```
module.json
scripts/
styles/
lang/
templates/
vendor/
```

`images/`, `docs/`, `temp/`, `CHANGELOG.md`, `README.md`, `LICENSE`, and `.github/` are repo-only and excluded.

### Manual fallback

If the workflow is broken or unavailable, the release can be produced by hand:

```bash
zip -r /tmp/markdown-paste.zip module.json scripts/ styles/ lang/ templates/ vendor/
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes /tmp/markdown-paste.zip module.json
```

Then submit the release to FoundryVTT by editing the package on foundryvtt.com (no automated submission in this path).

## Code Exploration

If installed and available, use `codebase-memory-mcp` tools **first** for any structural code exploration:

- `search_graph(name_pattern/label/qn_pattern)` — find functions, classes, modules by name
- `trace_path(function_name, mode=calls|data_flow)` — follow call chains
- `get_code_snippet(qualified_name)` — read source for a specific symbol
- `get_architecture(aspects)` — understand project structure
- `search_code(pattern)` — graph-augmented text search

If the project is not yet indexed, run `index_repository` first. Fall back to `Grep`/`Glob`/`Read` only for config values, non-code files, or plain text content.

## External Documentation

If the **Context7 MCP server** is available, when working with FoundryVTT APIs, use it to fetch up-to-date documentation rather than relying on training data:

```
mcp__plugin_context7_context7__resolve-library-id({ libraryName: "foundryvtt" })
mcp__plugin_context7_context7__query-docs({ context7CompatibleLibraryID: "...", query: "..." })
```

Use this for: ApplicationV2, DocumentSheet, Hooks API, canvas/scene APIs, compendium packs, data models, and any other FoundryVTT or CoC7 system APIs.

## Reference

- FoundryVTT API docs: https://foundryvtt.com/api/
- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
- FoundryVTT v13 Source : `../Foundry Virtual Tabletop/v13` (workspace sibling)
- FoundryVTT v14 Source : `../Foundry Virtual Tabletop/v14` (workspace sibling)