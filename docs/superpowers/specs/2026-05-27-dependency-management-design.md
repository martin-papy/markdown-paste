# Dependency Management Design

**Date:** 2026-05-27
**Status:** Approved (brainstorming)
**Topic:** Managed vendoring for `marked` and `dompurify`

## Problem

`markdown-paste` ships two third-party libraries as hand-copied files in `vendor/`:

- `vendor/marked.esm.js` — **marked v15.0.12** (latest published is **v18.0.4**, three majors behind)
- `vendor/purify.es.mjs` — **DOMPurify 3.4.6** (already the latest)

Two concrete pains:

1. **Stale.** marked is three major versions behind and nobody noticed, because the files are copied by hand.
2. **No update path.** When a new version is released, the project is not updated automatically — there is no mechanism that even surfaces that a newer version exists.

## Constraints

- This is a **no-build-step** FoundryVTT module. The release zip ships raw ESM files (`scripts/`, `styles/`, `lang/`, `vendor/`) that the browser imports directly. Any solution must still deliver plain ESM files in that zip.
- The module must keep working when a contributor clones the repo and symlinks it into a Foundry data folder — **no install/build step required to run it in dev**.
- It must stay **self-contained** at runtime: no CDN / network dependency (offline and self-hosted Foundry worlds are common; CSP and availability would otherwise become failure modes).
- `package.json` already exists but is dev-only (jsdom for the node test runner). `node_modules` and `package-lock.json` are gitignored.
- The convert pipeline is already decoupled: [scripts/convert.js](../../../scripts/convert.js) receives `{ marked, DOMPurify }` via dependency injection, so the libraries can be swapped without touching conversion logic.

## Approach

**Managed vendoring.** Declare `marked` and `dompurify` as real npm dependencies, generate `vendor/*.js` from those pinned versions with a small sync script, commit the generated files, and let a scheduled GitHub Action propose updates as fully tested pull requests.

### Alternatives rejected

- **Runtime CDN import** (`import { marked } from 'https://esm.sh/marked@18'`): introduces a runtime network dependency, CSP friction, and breaks offline / self-hosted worlds. Contradicts the self-contained constraint and the "self-host critical dependencies" principle.
- **Bundler build step** (esbuild/rollup → `dist/`): overkill. The module is deliberately no-build vanilla ESM; a bundler changes the entire release model for no real benefit at this scale.

## Components

### 1. `package.json` — promote the libraries to real dependencies

```jsonc
{
  "dependencies": {
    "marked": "^18.0.4",
    "dompurify": "^3.4.6"
  },
  "devDependencies": {
    "jsdom": "^25.0.0"
  },
  "scripts": {
    "test": "node --test --import ./tests/setup.js 'tests/**/*.test.js'",
    "vendor": "node tools/vendor.mjs"
  }
}
```

Caret ranges are for human readability; the source of truth for what ships is the generated `vendor/` file plus the CI guard (below). Major upgrades are driven by the scheduled action installing `@latest`.

### 2. `tools/vendor.mjs` — the sync script

Lives in `tools/`, **not** `scripts/` — `scripts/` is the Foundry runtime folder shipped in the zip, so dev tooling must stay out of it.

Behavior:

- Reads a small declarative map of sources:
  ```js
  const VENDORED = [
    { pkg: 'marked',    src: 'node_modules/marked/lib/marked.esm.js', dest: 'vendor/marked.esm.js' },
    { pkg: 'dompurify', src: 'node_modules/dompurify/dist/purify.es.mjs', dest: 'vendor/purify.es.mjs' },
  ];
  ```
- For each entry: resolves the installed version from the package's `package.json`, copies `src` → `dest`, and prepends a generated-file banner:
  ```
  // GENERATED from marked@18.0.4 — do not edit by hand. Run `npm run vendor` to regenerate.
  ```
- Fails loudly if a source file is missing (e.g. dependency not installed, or the package changed its build output path).
- Adding a third library later is a single entry in `VENDORED`.

### 3. `vendor/` — committed, now generated

Imports in [scripts/dialog.js](../../../scripts/dialog.js) and the tests are unchanged. Clone-and-run in Foundry continues to work with zero setup, because the generated files remain in git.

### 4. CI guard (extend the existing test workflow)

Add a step before tests:

```yaml
- run: npm ci || npm install   # matches existing test.yml; tolerates gitignored lockfile
- run: npm run vendor
- run: git diff --exit-code vendor/   # fails if vendor/ is out of sync or hand-edited
- run: npm test
```

This guarantees the committed `vendor/` files always match the pinned dependency versions and were never hand-edited. `npm ci || npm install` mirrors the existing [test.yml](../../../.github/workflows/test.yml) so it works whether or not a lockfile is present.

### 5. `.github/workflows/update-deps.yml` — scheduled updater

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'   # weekly, Monday 06:00 UTC
  workflow_dispatch: {}     # allow manual runs

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    steps:
      - checkout
      - setup-node
      - run: npm install marked@latest dompurify@latest --save   # crosses majors, updates package.json
      - run: npm run vendor                                       # regenerate vendor/
      - run: npm test                                             # must pass
      - uses: peter-evans/create-pull-request
        with:
          branch: chore/update-deps
          title: 'chore(deps): update marked / dompurify'
          # PR carries package.json + regenerated vendor/ + green test run
```

One self-contained workflow produces a single PR containing the version bump, the regenerated vendor files, and a green test run. Uses `npm install` (not strict `npm ci`) so it does not require a committed lockfile, keeping `package-lock.json` gitignored as today.

## Immediate deliverable: marked 15 → 18

Setting up the machinery is not enough — the first concrete output is bumping marked to v18 (DOMPurify is already current). Because that is a three-major jump, the conversion output may shift. Scope:

- Run the suite against marked v18; update [scripts/convert.js](../../../scripts/convert.js) and [tests/convert.test.js](../../../tests/convert.test.js) where output changed. The existing `marked v15 emits…` assertions are the likely touch points.
- Confirm the marked options still used in `convert.js` (e.g. `gfm`, `breaks`) still exist and behave the same in v18; adjust if renamed/removed.
- This upgrade is contained to the convert pipeline and is independent of the in-flight Obsidian-syntax-support work.

## Testing

- The existing node test runner (`node --test` + jsdom) stays the single source of truth. No new framework.
- Every dependency change is gated twice: the CI guard proves `vendor/` matches the pinned versions, and `npm test` proves the conversion still behaves.
- The scheduled updater runs `npm test` before opening its PR, so a breaking major upgrade surfaces as a red PR to be handled by hand rather than a silent regression.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Silent breakage on a major bump | Updater PR runs the full suite; red PR signals manual work needed. |
| Someone bumps a version but forgets to re-vendor | CI guard (`git diff --exit-code vendor/`) fails the build. |
| Someone hand-edits a vendor file | Same CI guard catches it; banner warns not to. |
| Upstream changes its ESM build path | `tools/vendor.mjs` fails loudly on a missing source file. |
| `create-pull-request` lacks permissions | Workflow declares `contents: write` + `pull-requests: write`. |

## Out of scope

- Migrating to a bundler or any build step.
- Loading libraries from a CDN at runtime.
- Auto-merging dependency PRs (every update is reviewed by a human).
- Committing `package-lock.json` (stays gitignored).
