# Markdown Paste — Obsidian Syntax Support

**Date:** 2026-05-27
**Status:** Draft
**Author:** Martin Papy
**Scope:** Folded into the in-flight **v0.1** (continues on `feature-v0.1-bootstrap`). Not a separate version.
**Builds on:** [2026-05-26-markdown-paste-module-design.md](2026-05-26-markdown-paste-module-design.md)

## Problem

The base module converts standard + GFM Markdown to sanitized HTML and inserts it into any Foundry ProseMirror editor. But a large share of pasted content originates in **Obsidian**, which emits three constructs that are not standard Markdown and currently land mangled:

1. **YAML frontmatter** — a `---`-fenced metadata block at the top of the note. `marked` renders the leading `---` as a thematic break and the YAML body as stray text.
2. **Callouts** — `> [!type] Title` blockquotes (`[!info]`, `[!note]`, `[!tip]`, `[!abstract]`, `[!quote]`, …). `marked` parses them as ordinary blockquotes with a literal `[!type]` prefix showing.
3. **Wikilinks** — `[[Note Name]]` / `[[Note|Alias]]`. These pass through as literal text and, worse, Foundry interprets `[[…]]` as inline **roll** syntax, so they render as broken roll buttons.

The reference input is [tests/test-file-obsidian.md](../../../tests/test-file-obsidian.md) — a real CoC7 NPC note exported from Obsidian.

## Goal

Add an **Obsidian compatibility layer** to the conversion pipeline that transforms these three constructs into schema-safe HTML which survives ProseMirror insertion and renders cleanly in Foundry. The layer is gated by a single client-scope setting and, when disabled, leaves `convert` behaving exactly as it does today.

## Non-goals

- **Not** an Obsidian vault/file importer (still text-paste only).
- **Not** an image/embed importer. Obsidian embeds `![[file]]` are left untouched in v0.1.
- **Not** a full YAML engine. A minimal subset parser covers the common Obsidian frontmatter shapes; anything unrecognized is preserved as a raw scalar, never dropped.
- **Not** a Dataview / Templater / plugin-syntax processor. Only core Obsidian Markdown constructs are handled.

## Settled decisions

| Decision | Choice |
|---|---|
| Callout rendering | Blockquote + class + shipped CSS, with graceful degradation to a plain titled blockquote |
| Callout icon | Unicode **emoji** (plain text; survives ProseMirror + sanitization guaranteed) |
| Callout title fallback (no title given) | Icon + localized **type label** (e.g. `📝 Note`) — title line is never blank |
| Frontmatter output | Titled **"Properties"** key/value table (matches Obsidian's Properties panel); list values comma-joined |
| Wikilinks | **Strip to plain text**; guard against Foundry rolls (`[[/r …]]`, `[[1d20]]`) |
| Toggle | One client-scope setting `processObsidian`, default `true` |
| Version | Folded into v0.1 |

## Architecture

The base pipeline (`scripts/convert.js`) is `marked.parse → DOMPurify.sanitize`. The Obsidian layer slots in as pure pre-processing on the Markdown string plus one `marked` extension for callouts — the sanitize backbone is untouched.

New module **`scripts/obsidian.js`** — pure functions, no Foundry dependencies, unit-testable in Node:

```
convert(md, deps, options):
  if options.obsidian !== false:
    { frontmatter, body } = extractFrontmatter(md)        // strip leading --- … --- block
    body                  = stripWikiLinks(body)          // [[A|B]]→B, [[A]]→A, rolls untouched
    body = transformCallouts(body, marked, labels)        // callout blockquotes → raw-HTML blocks
    md   = (frontmatter ? frontmatterToHtml(frontmatter, labels) + "\n\n" : "") + body
  html = marked.parse(md, { gfm:true, breaks:gfmBreaks })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target','rel'] })   // class kept by DOMPurify default
```

- **Frontmatter**, **callouts**, and **wikilinks** are all string→string pre-processors that run before the outer `marked.parse`. Each emits either plain Markdown or a raw HTML block; `marked` passes raw HTML blocks through untouched, then DOMPurify sanitizes the whole document once.
- **Callouts** are handled by a pre-processor (not a registered `marked` extension). Obsidian callouts *are* blockquotes syntactically, so `transformCallouts` finds the `> [!type] …` block, strips the `>` prefixes, renders the callout **body** by calling the injected `marked.parse(...)` recursively (so nested bold, lists, etc. just work), and wraps the result in the target `<blockquote class="md-callout …">`.
  - **Why a pre-processor, not `marked.use({ extensions })`:** `marked.use` mutates the shared instance, which would stack across repeated `convert` calls and bake the first call's `labels` in permanently. The pre-processor takes `marked` and `labels` as arguments per call → no global mutation, correct localization every time, and pure/Node-testable.
- `frontmatterToHtml` emits a raw HTML block prepended to the Markdown source by the same mechanism.

### Why this shape

- Keeps `convert.js` and `obsidian.js` free of Foundry imports → both fully testable under `node:test` + `jsdom`, matching the existing `convert.test.js` harness.
- One sanitize pass over the final HTML — no second-guessing what the Obsidian layer produced; DOMPurify is the single security boundary.
- `options.obsidian === false` short-circuits the entire layer, guaranteeing byte-identical output to today for non-Obsidian users.

## Feature 1 — Frontmatter → "Properties" table

### Detection

Triggers **only** when the document's first line is `---` and a closing `---` exists. A mid-document `---` (horizontal rule) is never treated as frontmatter.

### YAML subset supported

| Shape | Example | Handling |
|---|---|---|
| Scalar | `type: pnj` | key → value |
| Quoted scalar | `statut: "prêt"` | quotes stripped |
| Inline list | `tags: [pnj, victime]` | items comma-joined |
| Block list | `tags:`<br>`  - pnj`<br>`  - victime` | items comma-joined |
| Empty value | `note:` | empty string |
| Unrecognized (nested map, etc.) | — | preserved as raw scalar string (fail-safe, never dropped) |

Key order is preserved (entries kept as an ordered list).

### Output

A localized title paragraph followed by a borderless 2-column key/value table. All values HTML-escaped (not re-parsed as Markdown). Both the title `<p>` and the `<table>`/`<strong>` are schema-safe and survive ProseMirror; the `class` hooks are best-effort styling.

```html
<p class="md-frontmatter-title"><strong>Properties</strong></p>
<table class="md-frontmatter">
  <tbody>
    <tr><td><strong>tags</strong></td><td>pnj, victime, st-agnes, chapitre-1</td></tr>
    <tr><td><strong>type</strong></td><td>pnj</td></tr>
    <tr><td><strong>chapitre</strong></td><td>1</td></tr>
    <tr><td><strong>statut</strong></td><td>prêt</td></tr>
  </tbody>
</table>
```

> The title is a `<p>` (not a `<caption>`), because ProseMirror's table schema has no caption node and would strip it. A paragraph survives insertion guaranteed.

## Feature 2 — Callouts

### Pattern

```
> [!type]            ← required marker; type case-insensitive
> [!type] Title      ← optional title on the same line
> [!type]+           ← optional fold marker (+/-) accepted and ignored
> body line 1        ← zero or more continuation lines, parsed as Markdown
> body line 2
```

### Output

```html
<blockquote class="md-callout md-callout-tip">
  <p class="md-callout-title"><strong>💡 Indice de mise en scène</strong></p>
  <p>Personne ne sait <strong>pourquoi</strong> Long est descendu…</p>
</blockquote>
```

- `<blockquote>` + body content always survive ProseMirror insertion. The `class` is best-effort: if Foundry's schema preserves it, the shipped CSS draws a colored, bordered box; if not, it degrades to a plain blockquote whose emoji + bold title still convey the type.
- Title line: `{emoji} {author title}`. If no title is given: `{emoji} {localized type label}` (e.g. `📝 Note`) — never blank.
- Body is rendered through marked, so inline/block Markdown inside the callout works.

### Type → canonical / emoji / color map

Aliases fold to a canonical type. Unknown types render as a generic `md-callout` (no color) with the title still shown.

| Canonical | Aliases | Emoji | Accent color |
|---|---|---|---|
| note | — | 📝 | blue |
| abstract | summary, tldr | 📋 | cyan |
| info | — | ℹ️ | blue |
| todo | — | ☑️ | blue |
| tip | hint, important | 💡 | teal |
| success | check, done | ✅ | green |
| question | help, faq | ❓ | amber |
| warning | caution, attention | ⚠️ | orange |
| failure | fail, missing | ❌ | red |
| danger | error | ⚡ | red |
| bug | — | 🐛 | red |
| example | — | 📑 | purple |
| quote | cite | 💬 | gray |

CSS uses custom properties for the accent palette (`--md-callout-tip`, …) per the project's web styling conventions, applied as a left border + tinted background on `blockquote.md-callout-<type>` and an optional title accent.

## Feature 3 — Wikilink stripping

- `[[Montague Edwards]]` → `Montague Edwards`
- `[[St. Agnes|son lieu]]` → `son lieu` (alias wins)
- `[[Note#Heading]]` → `Note` (heading/block ref dropped; alias still wins if present)

### Roll guard (do NOT strip)

A `[[…]]` is left untouched when its content:
- starts with `/` → Foundry command roll (`[[/r 1d20]]`, `[[/check …]]`), or
- matches a dice-formula pattern (`^\s*\d*[dD]\d+`) → Foundry inline roll (`[[1d20+5]]`).

`@UUID[…]` tokens contain no `[[` and are inherently untouched. Obsidian embeds `![[…]]` (preceded by `!`) are out of scope and left as-is.

## Settings

One new client-scope boolean appended to the existing six in `scripts/settings.js`:

| key | type | default | label (i18n) |
|---|---|---|---|
| `processObsidian` | Boolean | `true` | Process Obsidian syntax (callouts, frontmatter, wikilinks) |

`scripts/dialog.js` reads it and passes `obsidian: getSetting('processObsidian')` into `convert`'s options. When `false`, the Obsidian layer is skipped entirely.

## Localization

`convert.js` / `obsidian.js` stay Foundry-agnostic, so localized strings are **injected** via an optional `labels` field on `convert`'s options:

```js
convert(md, deps, {
  gfmBreaks,
  obsidian: true,
  labels: {
    properties: "Propriétés",                    // frontmatter title
    callouts: { note: "Note", tip: "Astuce", … } // no-title type fallback labels
  }
});
```

- `dialog.js` builds `labels` from `game.i18n.localize(...)` at call time.
- `obsidian.js` falls back to **English defaults** when a label is absent → unit tests run without any Foundry i18n.
- New keys added to `lang/en.json` and `lang/fr.json`: the setting name/hint, `markdown-paste.frontmatter.title`, and `markdown-paste.callouts.<type>` for the 13 canonical type labels.

## Module structure changes

```
scripts/
├── convert.js     (CHANGED: accept options.obsidian + options.labels; orchestrate obsidian layer)
├── obsidian.js    (NEW: extractFrontmatter, frontmatterToHtml, stripWikiLinks, transformCallouts, type map)
├── settings.js    (CHANGED: add processObsidian)
└── dialog.js      (CHANGED: pass obsidian + labels into convert)
styles/
└── markdown-paste.css  (CHANGED: .md-callout(-*) and .md-frontmatter(-title) rules + color tokens)
lang/
├── en.json        (CHANGED: setting + frontmatter.title + callouts.* keys)
└── fr.json        (CHANGED: same keys, French)
tests/
├── obsidian.test.js  (NEW: frontmatter, callouts, wikilinks units)
└── convert.test.js   (CHANGED: integration + processObsidian:false regression)
```

`obsidian.js` stays under ~150 lines, matching the module's per-file budget; if the type map + extension push past that, the map moves to a small `obsidian-callouts.js` data module.

## Testing

`node:test` + `jsdom`, mirroring `convert.test.js`.

**`tests/obsidian.test.js`:**
- `extractFrontmatter`: scalar, quoted, inline list, block list, empty value, no-frontmatter (returns `{frontmatter:null, body:md}`), mid-document `---` untouched, malformed line preserved as scalar, key order preserved.
- callouts: each alias resolves to canonical; with title; without title → emoji + type label; `+`/`-` fold marker accepted; body Markdown rendered; unknown type → generic class, title shown.
- `stripWikiLinks`: `[[A]]`, `[[A|B]]`, `[[A#H]]`, roll `[[/r 1d20]]` preserved, roll `[[1d20+5]]` preserved, `@UUID[…]` preserved, embed `![[x.png]]` preserved.

**`tests/convert.test.js` additions:**
- end-to-end against `tests/test-file-obsidian.md`: frontmatter table present, callouts carry `md-callout-*` classes, wikilinks in the "Liens" section reduced to plain text, no `<script>` survives.
- regression: `convert(md, deps, { obsidian:false })` equals current output for an Obsidian-laden input.
- labels injection: French `labels` produce French frontmatter title and type fallback.

CI workflow `.github/workflows/test.yml` already runs these on PR.

## Compatibility & verification

- All emitted structures (`blockquote`, `table`, `p`, `strong`, `td`, `tr`, `tbody`) are core ProseMirror schema nodes → content survives insertion on v13 and v14.
- **Verification item (manual smoke test):** confirm whether `class` survives `parseSlice` onto a `<blockquote>`/`<table>` in a saved Journal page. If it survives, the styled boxes render; if Foundry's schema strips it, output degrades gracefully (emoji + bold titles, plain table). Either outcome is acceptable by design; the result determines only how much CSS work pays off.
- No version branching required (consistent with the base design's v13/v14 findings).

Smoke-test additions to the base checklist:
- [ ] Pasting `test-file-obsidian.md` yields a Properties table at the top
- [ ] Callouts render with emoji + title; colored box if class survives, plain blockquote if not
- [ ] `[[Wiki Links]]` become plain text; `[[/r 1d20]]` stays a working roll
- [ ] `processObsidian = false` → raw `[!type]` / `---` / `[[…]]` pass through unprocessed

## Open questions

None blocking. Resolved during implementation:
- Exact emoji glyphs may be tuned for cross-platform legibility (the map above is the baseline).
- Whether the callout type map warrants its own data module (size-dependent).
- Final accent-color values for the CSS tokens.

## References

- Base design: [2026-05-26-markdown-paste-module-design.md](2026-05-26-markdown-paste-module-design.md)
- Obsidian callouts: https://help.obsidian.md/Editing+and+formatting/Callouts
- Obsidian properties/frontmatter: https://help.obsidian.md/Editing+and+formatting/Properties
- marked extensions: https://marked.js.org/using_pro#extensions
- Foundry `CONST.ALLOWED_HTML_ATTRIBUTES` (class/style/data-* universally allowed): https://foundryvtt.com/api/v13/variables/CONST.ALLOWED_HTML_ATTRIBUTES
- Reference input: [tests/test-file-obsidian.md](../../../tests/test-file-obsidian.md)
