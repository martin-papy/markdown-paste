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
