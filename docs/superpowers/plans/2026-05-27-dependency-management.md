# Dependency Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-copied `vendor/` libraries with managed vendoring — npm-pinned `marked`/`dompurify`, a generator script, a CI guard, and a weekly auto-update PR workflow — and upgrade marked from v15 to v18.

**Architecture:** `marked` and `dompurify` become real npm dependencies. `tools/vendor.mjs` copies their prebuilt ESM bundles into the committed `vendor/` folder with a provenance banner. A CI step regenerates and `git diff --exit-code`s `vendor/` to prove it matches the pinned versions. A scheduled GitHub Action bumps to `@latest`, re-vendors, runs the test suite, and opens a single tested PR.

**Tech Stack:** Node 24, `node --test` + jsdom, npm, GitHub Actions, `peter-evans/create-pull-request`.

**Spec:** [docs/superpowers/specs/2026-05-27-dependency-management-design.md](../specs/2026-05-27-dependency-management-design.md)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `package.json` | Declare `marked`/`dompurify` deps + `vendor` script | Modify |
| `tools/vendor.mjs` | Generate `vendor/*.js` from `node_modules` with banner | Create |
| `vendor/marked.esm.js` | marked runtime bundle (committed, generated) | Regenerate (v15→v18) |
| `vendor/purify.es.mjs` | DOMPurify runtime bundle (committed, generated) | Regenerate (banner) |
| `tests/convert.test.js` | Conversion behavior tests | Modify (refresh stale version comments) |
| `.github/workflows/test.yml` | CI test run + vendor sync guard | Modify |
| `.github/workflows/update-deps.yml` | Weekly dependency-update PR | Create |
| `README.md` | Contributor note on regenerating vendor | Modify |

**No change needed:** `.github/workflows/release.yml` already zips `vendor/`; `.gitignore` already ignores `node_modules`/`package-lock.json` and `vendor/` stays committed; `scripts/dialog.js` and `scripts/convert.js` import paths are unchanged.

---

## Task 1: Promote marked & dompurify to npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit `package.json`**

Replace the entire file with:

```jsonc
{
  "name": "markdown-paste-tests",
  "private": true,
  "version": "0.0.0",
  "description": "Dev-only — node test runner config for markdown-paste",
  "type": "module",
  "scripts": {
    "test": "node --test --import ./tests/setup.js 'tests/**/*.test.js'",
    "vendor": "node tools/vendor.mjs"
  },
  "dependencies": {
    "marked": "^18.0.4",
    "dompurify": "^3.4.6"
  },
  "devDependencies": {
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Install the new dependencies**

Run: `npm install`
Expected: completes without error; `node_modules/marked/` and `node_modules/dompurify/` now exist.

- [ ] **Step 3: Verify the prebuilt ESM bundles are present at the expected paths**

Run: `ls node_modules/marked/lib/marked.esm.js node_modules/dompurify/dist/purify.es.mjs`
Expected: both paths print (no "No such file"). These are the exact files `tools/vendor.mjs` will copy.

- [ ] **Step 4: Verify the installed marked version is v18**

Run: `node -e "import('marked/package.json',{with:{type:'json'}}).then(m=>console.log(m.default.version))"`
Expected: `18.0.4` (or newer 18.x).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: add marked and dompurify as npm dependencies"
```

(`package-lock.json` is gitignored — do not commit it.)

---

## Task 2: Add the vendor sync script

**Files:**
- Create: `tools/vendor.mjs`

- [ ] **Step 1: Create `tools/vendor.mjs`**

```js
// Regenerates vendor/*.js from installed npm dependencies.
// vendor/ files are committed but GENERATED — never hand-edit them.
// Run: npm run vendor
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One entry per vendored library. Adding a library is a single entry here.
const VENDORED = [
  { pkg: 'marked', src: 'node_modules/marked/lib/marked.esm.js', dest: 'vendor/marked.esm.js' },
  { pkg: 'dompurify', src: 'node_modules/dompurify/dist/purify.es.mjs', dest: 'vendor/purify.es.mjs' },
];

async function pkgVersion(pkg) {
  const json = await readFile(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8');
  return JSON.parse(json).version;
}

for (const { pkg, src, dest } of VENDORED) {
  let contents;
  try {
    contents = await readFile(path.join(root, src), 'utf8');
  } catch {
    console.error(
      `[vendor] ERROR: source not found: ${src}\n` +
        `Run \`npm install\` first, or the package changed its build output path.`,
    );
    process.exit(1);
  }

  // Drop the trailing sourceMappingURL comment — we do not ship the .map files,
  // so the reference would 404 in Foundry's console.
  const stripped = contents.replace(/\r?\n\/\/# sourceMappingURL=\S*\s*$/, '\n');

  const version = await pkgVersion(pkg);
  const banner = `// GENERATED from ${pkg}@${version} — do not edit by hand. Run \`npm run vendor\` to regenerate.\n`;

  await writeFile(path.join(root, dest), banner + stripped);
  console.log(`[vendor] ${dest} <- ${pkg}@${version}`);
}
```

- [ ] **Step 2: Run the script**

Run: `npm run vendor`
Expected output:
```
[vendor] vendor/marked.esm.js <- marked@18.0.4
[vendor] vendor/purify.es.mjs <- dompurify@3.4.6
```

- [ ] **Step 3: Verify the banner and version landed in each file**

Run: `head -1 vendor/marked.esm.js && head -1 vendor/purify.es.mjs`
Expected:
```
// GENERATED from marked@18.0.4 — do not edit by hand. Run `npm run vendor` to regenerate.
// GENERATED from dompurify@3.4.6 — do not edit by hand. Run `npm run vendor` to regenerate.
```

- [ ] **Step 4: Verify the dangling sourceMappingURL line is gone**

Run: `grep -c sourceMappingURL vendor/marked.esm.js vendor/purify.es.mjs`
Expected: `vendor/marked.esm.js:0` and `vendor/purify.es.mjs:0`.

- [ ] **Step 5: Verify re-running is deterministic (idempotent)**

Run: `npm run vendor && git diff --stat vendor/`
Expected: after the second run, `git diff` shows the *same* changes as after the first (no further churn between consecutive runs — the diff stat does not grow). This is what the CI guard relies on.

- [ ] **Step 6: Commit the script only (leave regenerated `vendor/` for Task 3)**

```bash
git add tools/vendor.mjs
git commit -m "chore: add tools/vendor.mjs to generate vendored deps"
```

Do NOT `git add vendor/` here — the regenerated files are committed in Task 3 as the marked upgrade.

---

## Task 3: Commit the regenerated vendor (marked 15 → 18 upgrade) and verify the suite

The working tree already carries the regenerated `vendor/` files from Task 2. This task proves the upgrade is safe and commits it.

**Files:**
- Modify: `vendor/marked.esm.js`, `vendor/purify.es.mjs` (already regenerated)
- Modify: `tests/convert.test.js`

- [ ] **Step 1: Confirm the vendored marked bundle is now v18**

Run: `grep -m1 "marked v" vendor/marked.esm.js`
Expected: a line containing `marked v18.0.4` (the upstream file header, now sitting under the banner).

- [ ] **Step 2: Run the full test suite against the upgraded libraries**

Run: `npm test`
Expected: PASS — all tests green. The suite asserts conversion output with order-independent attribute matching and `[\s\S]*` table/list matching, which marked v18 satisfies (verified against v18.0.4 output during design).

- [ ] **Step 3: If any test fails, reconcile (only if Step 2 was not green)**

For each failing test, run the file isolated to see actual vs expected:
`node --test --import ./tests/setup.js tests/convert.test.js`
Then decide per failure:
- **Accepted output change** (v18 renders valid-but-different HTML): update that test's assertion to match the new output, and note the change in the commit message.
- **Regression** (v18 produces wrong/unsafe HTML): fix `scripts/convert.js` to restore correct behavior; do not weaken a security assertion (the script-strip, `onerror`-strip, and `javascript:`-block tests must keep passing unchanged).
Re-run `npm test` until green. If Step 2 was already green, skip this step.

- [ ] **Step 4: Refresh the version-specific comments in `tests/convert.test.js`**

Replace (around line 63):
```js
  // marked v15 emits disabled="" before type="checkbox"; match both attributes regardless of order
```
with:
```js
  // marked emits the disabled and type="checkbox" attributes in varying order across versions; match both regardless of order
```

Replace (around line 95):
```js
  // marked v15 rejects the malformed image URL; use raw inline HTML to produce an <img onerror=...>
```
with:
```js
  // marked rejects the malformed image URL; use raw inline HTML to produce an <img onerror=...>
```

- [ ] **Step 5: Re-run the suite after the comment edits**

Run: `npm test`
Expected: PASS (comments only — behavior unchanged).

- [ ] **Step 6: Commit the upgrade**

```bash
git add vendor/marked.esm.js vendor/purify.es.mjs tests/convert.test.js
git commit -m "chore: regenerate vendor from npm deps; upgrade marked 15 -> 18"
```

---

## Task 4: Add the CI vendor-sync guard

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Edit `.github/workflows/test.yml`**

Replace the whole file so the job regenerates and diffs `vendor/` before running tests:

```yaml
name: tests

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci || npm install
      - run: npm run vendor
      - name: Verify vendor/ matches pinned dependency versions
        run: git diff --exit-code vendor/
      - run: npm test
```

- [ ] **Step 2: Reproduce the CI guard locally — it must pass on a synced tree**

Run: `npm run vendor && git diff --exit-code vendor/ && echo GUARD_OK`
Expected: prints `GUARD_OK` with exit code 0 (working tree is already synced from Task 3).

- [ ] **Step 3: Prove the guard actually catches drift (negative check)**

Run:
```bash
printf '\n// tampered\n' >> vendor/marked.esm.js
git diff --exit-code vendor/ ; echo "exit=$?"
git checkout -- vendor/marked.esm.js
```
Expected: the `git diff --exit-code` reports a diff and prints `exit=1` (guard would fail CI); the `git checkout` restores the file. Then run `git status -s` and confirm the tree is clean.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: regenerate and verify vendor/ in test workflow"
```

---

## Task 5: Add the scheduled dependency-update workflow

**Files:**
- Create: `.github/workflows/update-deps.yml`

- [ ] **Step 1: Create `.github/workflows/update-deps.yml`**

```yaml
name: update-deps

on:
  schedule:
    - cron: '0 6 * * 1' # weekly, Monday 06:00 UTC
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm install marked@latest dompurify@latest --save
      - run: npm run vendor
      - run: npm test
      - name: Open pull request
        uses: peter-evans/create-pull-request@v7
        with:
          branch: chore/update-deps
          delete-branch: true
          commit-message: 'chore(deps): update marked / dompurify'
          title: 'chore(deps): update marked / dompurify'
          body: |
            Automated weekly dependency refresh.

            - `marked` / `dompurify` bumped to latest via `npm install ...@latest --save`
            - `vendor/` regenerated by `npm run vendor`
            - test suite ran green before this PR was opened

            Review the regenerated `vendor/` diff and the version bump in `package.json`, then merge.
```

- [ ] **Step 2: Validate the YAML**

Run: `actionlint .github/workflows/update-deps.yml`
Expected: no output, exit code 0.
Fallback if `actionlint` is not installed (`brew install actionlint` to add it): run
`node -e "const f=require('fs').readFileSync('.github/workflows/update-deps.yml','utf8'); if(!/peter-evans\/create-pull-request/.test(f)||!/workflow_dispatch/.test(f)) throw new Error('workflow content check failed'); console.log('content OK')"`
Expected: `content OK`. (Full schema validation otherwise happens on GitHub when the file is pushed.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-deps.yml
git commit -m "ci: add weekly dependency-update workflow"
```

---

## Task 6: Document the vendor workflow for contributors

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a development section to `README.md`**

Add this section at the end of `README.md` (adjust the heading depth to match the file's existing top-level headings):

````markdown
## Updating vendored dependencies

Runtime libraries (`marked`, `dompurify`) are pinned in `package.json` and the
browser-ready ESM bundles live in `vendor/`. Those bundles are **generated** — do
not edit them by hand.

```bash
npm install            # install pinned dependencies
npm run vendor         # regenerate vendor/ from node_modules
npm test               # verify conversion still behaves
```

CI fails if `vendor/` is out of sync with the pinned versions. A weekly
`update-deps` workflow bumps the libraries to latest, regenerates `vendor/`, runs
the tests, and opens a pull request automatically.
````

- [ ] **Step 2: Verify nothing else changed and the tree is otherwise clean**

Run: `git status -s`
Expected: only `README.md` shows as modified.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document vendored dependency workflow"
```

---

## Self-Review Notes

- **Spec coverage:** package.json deps (Task 1); `tools/vendor.mjs` generator + banner + `tools/` location (Task 2); committed-but-generated `vendor/` (Tasks 2–3); marked 15→18 immediate deliverable (Task 3); CI guard with `git diff --exit-code` (Task 4); scheduled self-contained updater with `contents`/`pull-requests` write perms and `npm install` over `npm ci` (Task 5). README note (Task 6) supports the spec's clone-and-run constraint.
- **Lockfile:** every workflow uses `npm install` (or `npm ci || npm install`), so the gitignored `package-lock.json` is never required — consistent with the spec's out-of-scope decision.
- **No release.yml change:** it already ships `vendor/`; the runtime artifact shape is unchanged.
- **Security assertions preserved:** Task 3 Step 3 explicitly forbids weakening the script-strip / `onerror` / `javascript:` tests during reconciliation.
- **Type/name consistency:** the `VENDORED` array, `pkgVersion()` helper, banner text, and the `npm run vendor` script name are identical across Tasks 2, 4, 5, and 6.
