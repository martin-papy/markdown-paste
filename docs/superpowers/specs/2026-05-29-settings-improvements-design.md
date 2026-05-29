# Settings Improvements — Design

Date: 2026-05-29
Status: Approved
Branch: `feature-settings` (PR → `develop`, then `develop` → `main`)

## Goal

Improve the markdown-paste module settings with four changes:

1. Add user-customizable **callout colors** via a sub-form (`registerMenu`) with
   13 inline color pickers.
2. Add a **"Global Settings"** section heading above the existing settings.
3. Add an **"Allow non-GMs"** option letting the GM grant non-GM users access to
   the Paste Markdown button.
4. Make **all settings GM-controlled and world-wide** — convert the existing 6
   settings (and all new ones) from `client` scope to `world` scope.

## Constraints & Decisions (confirmed)

- All settings → `scope: 'world'`. Foundry restricts world-setting edits to
  GM / Assistant-GM ("Configure Settings" permission) and applies them to every
  user and device. (Verified against FoundryVTT settings docs.)
- Existing 6 setting **keys and defaults are unchanged**; only the scope changes.
- Callout colors apply **retroactively to all callouts** (already-pasted and new),
  for **all clients**, by injecting a runtime `<style>` that overrides the
  `:root` callout CSS variables. No change to the existing security model.
- The callout-color sub-form includes: 13 color pickers, a **Reset to defaults**
  button, **live preview swatches**, and a **per-type label** (emoji + name).
- Per-surface toggles (Journals / Items / Actors / Elsewhere) still gate button
  visibility for everyone, including when non-GM access is enabled.

## Architecture

Existing data flow is unchanged: **Toolbar hook → Dialog → Convert → Insert**.
This work touches the settings/registration layer and the menu-gating layer, and
adds a colors layer that injects a stylesheet.

### 1. World-scope migration

In [`scripts/settings.js`](../../../scripts/settings.js), change the registration
loop's `scope: 'client'` → `scope: 'world'` for the 6 existing settings. Keys and
defaults stay the same (`enableInJournals`, `enableInItems`, `enableInActors`,
`enableElsewhere`, `processObsidian` default `true`; `gfmBreaks` default `false`).

**Migration impact:** Foundry stores client and world settings separately, so
per-client values do not carry into world scope. After upgrade every client falls
back to defaults on first load. This is acceptable and will be noted in
`CHANGELOG.md`.

### 2. "Global Settings" heading

Foundry's Settings Configuration form has no native sub-heading. Use a
`renderSettingsConfig` hook (registered in [`scripts/main.js`](../../../scripts/main.js))
that injects a single `<h3 class="markdown-paste-settings-heading">` (localized
via `markdown-paste.settings.heading.global`) immediately before the module's
first registered setting in the rendered form.

Guards: locate the module's settings group by the settings' DOM markers
(`[data-setting-id^="markdown-paste."]` / the module section), inject once per
render, and no-op if the anchor is not found. This is a UI-only enhancement; if
Foundry's settings markup differs at runtime the hook degrades to a no-op (no
heading) rather than throwing.

### 3. "Allow non-GMs" access gate

New world Boolean setting `allowNonGM`, default `false`, with localized
name/hint. Gate added at the top of the `getProseMirrorMenuItems` handler in
[`scripts/menu-button.js`](../../../scripts/menu-button.js):

```js
// Global access gate: non-GM users only see the button when the GM allows it.
if (!game.user?.isGM && !getSetting('allowNonGM')) return;

const settingKey = resolveSurfaceSetting(menu.view);
if (!getSetting(settingKey)) return; // per-surface gate — applies to everyone
```

GMs always pass the access gate. The per-surface gate is unchanged and still
applies to all users.

### 4. Callout colors

#### Storage

One world setting `calloutColors`, `config: false`, of type `Object`. Value is a
map keyed by the 13 `CALLOUT_TYPES` (from `obsidian.js`) to hex color strings.
Default is `DEFAULT_CALLOUT_COLORS` (mirrors current `:root` values in
`styles/markdown-paste.css`). Registered with an `onChange` that calls
`applyCalloutColors(value)` so changes apply live on the GM's client.

#### New pure module: `scripts/callout-colors.js`

No Foundry imports — unit-testable in Node + jsdom.

- `DEFAULT_CALLOUT_COLORS` — `{ note: '#448aff', abstract: '#00b8d4', info:
  '#448aff', todo: '#448aff', tip: '#00bfa5', success: '#00c853', question:
  '#f2c037', warning: '#ff9800', failure: '#ff5252', danger: '#ff1744', bug:
  '#f50057', example: '#7c4dff', quote: '#9e9e9e' }`.
- `isValidHexColor(value)` — strict test for `#rgb` / `#rrggbb` (case-insensitive).
- `buildCalloutColorCss(colors)` — returns a CSS string
  `:root{--md-callout-note:#…;…}` for all 13 types. **Security:** for each type,
  emit the provided value only if `isValidHexColor` passes; otherwise fall back
  to `DEFAULT_CALLOUT_COLORS[type]`. This prevents a tampered world setting from
  injecting arbitrary CSS through the `<style>` sink.
- `applyCalloutColors(colors, doc = document)` — inject or update a single
  `<style id="markdown-paste-callout-colors">` in `<head>` with
  `buildCalloutColorCss(colors)`. Idempotent: re-call updates the existing node
  rather than appending a duplicate.

#### New Foundry module: `scripts/callout-color-menu.js`

`CalloutColorMenu`, an `ApplicationV2` form using `HandlebarsApplicationMixin`
with a dedicated template `templates/callout-color-menu.hbs` (the idiomatic
Foundry sub-form approach). The template is loaded at runtime (no `module.json`
manifest entry required); the new `templates/` directory is added to the release
zip — see Packaging. Contents:

- A row per callout type (in `CALLOUT_TYPES` order): emoji + localized label
  (reuse `markdown-paste.callouts.<type>`), a **live preview** mini-callout
  swatch, and `<input type="color" name="<type>">` initialized from the current
  setting.
- **Reset to defaults** button: sets every picker to `DEFAULT_CALLOUT_COLORS`
  and refreshes previews (before save).
- Live preview: each swatch updates on its picker's `input` event.
- Submit: read all 13 inputs, write the object to the `calloutColors` setting.
  The `onChange` then re-applies colors live.

Registered via:

```js
game.settings.registerMenu(MODULE_ID, 'calloutColorsMenu', {
  name: 'markdown-paste.settings.calloutColors.name',
  label: 'markdown-paste.settings.calloutColors.label',
  hint: 'markdown-paste.settings.calloutColors.hint',
  icon: 'fa-solid fa-palette',
  type: CalloutColorMenu,
  restricted: true,
});
```

#### Applying colors on load

In `main.js`, on `ready`, call `applyCalloutColors(getSetting('calloutColors'))`
so every client (GM and non-GM) renders callouts with the world's chosen palette.
The existing `:root` block in CSS remains as the fallback for first paint and is
overridden by the injected style.

## Files

| File | Change |
|------|--------|
| `scripts/callout-colors.js` | **NEW** — pure: defaults, hex validation, CSS builder, style injector |
| `scripts/callout-color-menu.js` | **NEW** — `CalloutColorMenu` ApplicationV2 + HandlebarsApplicationMixin form |
| `templates/callout-color-menu.hbs` | **NEW** — Handlebars template for the color sub-form |
| `scripts/settings.js` | world scope; add `allowNonGM`; register `calloutColors` + `registerMenu` + `onChange` |
| `scripts/menu-button.js` | add non-GM access gate |
| `scripts/main.js` | `renderSettingsConfig` heading hook; apply colors on `ready` |
| `styles/markdown-paste.css` | keep `:root` defaults; add heading + color-form styles |
| `lang/en.json`, `lang/fr.json` | new keys (heading, allowNonGM, calloutColors menu, reset) |
| `.github/workflows/release.yml` | add `templates/` to the `zip -r markdown-paste.zip …` line (release.yml:84) |
| `CLAUDE.md` | add `templates/` to the documented zip-contents list |
| `CHANGELOG.md` | new entry incl. scope-migration note |

### Packaging

The release zip is built at `.github/workflows/release.yml:84`:
`zip -r markdown-paste.zip module.json scripts/ styles/ lang/ vendor/`. Add
`templates/` so the new `.hbs` ships. Mirror this in `CLAUDE.md`'s "Zip contents"
list. No `module.json` change is needed — the template is loaded at runtime.

### New i18n keys

- `markdown-paste.settings.heading.global`
- `markdown-paste.settings.allowNonGM.name` / `.hint`
- `markdown-paste.settings.calloutColors.name` / `.label` / `.hint`
- `markdown-paste.calloutColors.title` (form window title)
- `markdown-paste.calloutColors.reset` (reset button)
- `markdown-paste.calloutColors.save` (save button, if not reusing a core label)

Existing `markdown-paste.callouts.<type>` labels are reused for the form rows.

## Testing

Follows the existing strategy: pure logic is unit-tested under Node's
`node:test`; UI-dependent code is verified manually in Foundry.

### New: `tests/callout-colors.test.js`

- `isValidHexColor`: accepts `#abc` / `#aabbcc` (any case); rejects empty,
  `red`, `#ggg`, `#12`, values with `;`/`}` (injection attempts).
- `buildCalloutColorCss`: emits a `--md-callout-<type>` declaration for all 13
  types; substitutes the default for any invalid input; output contains no
  characters outside `:root{ ... }` of validated declarations.
- `applyCalloutColors` (jsdom): creates exactly one
  `<style id="markdown-paste-callout-colors">`; a second call updates the same
  node (no duplicate); content reflects the new colors.

### Extend: `tests/menu-button.test.js`

- non-GM + `allowNonGM` false → no item pushed.
- non-GM + `allowNonGM` true + surface enabled → item pushed.
- non-GM + `allowNonGM` true + surface disabled → no item pushed (per-surface
  gate still applies).
- GM + surface enabled → item pushed regardless of `allowNonGM`.

Stub `game.user.isGM` and a keyed `game.settings.get` in the test harness
(extending the existing mocking pattern).

### Manual (in-app) verification

- "Global Settings" heading renders above the toggles.
- World-scoped settings are editable by GM and reflected for all users.
- Callout color menu: pickers load current values, live previews update, reset
  works, save persists, and existing callouts recolor live without reload.

## Out of Scope (YAGNI)

- Renaming existing setting keys or changing defaults.
- Per-callout enable/disable or custom emoji/labels.
- A second heading for the colors menu (only "Global Settings" requested).
- Migrating old per-client values into world scope.
