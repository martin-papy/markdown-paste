import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalType, CALLOUT_TYPES, extractFrontmatter } from '../scripts/obsidian.js';

test('canonicalType returns canonical types unchanged (case-insensitive)', () => {
  assert.equal(canonicalType('tip'), 'tip');
  assert.equal(canonicalType('NOTE'), 'note');
});

test('canonicalType resolves aliases to canonical', () => {
  assert.equal(canonicalType('summary'), 'abstract');
  assert.equal(canonicalType('hint'), 'tip');
  assert.equal(canonicalType('error'), 'danger');
  assert.equal(canonicalType('cite'), 'quote');
});

test('canonicalType returns null for unknown types', () => {
  assert.equal(canonicalType('frobnicate'), null);
});

test('CALLOUT_TYPES lists the 13 canonical types', () => {
  assert.equal(CALLOUT_TYPES.length, 13);
  assert.ok(CALLOUT_TYPES.includes('tip'));
});

test('extractFrontmatter returns null when there is no leading fence', () => {
  const r = extractFrontmatter('# Title\n\nBody');
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, '# Title\n\nBody');
});

test('extractFrontmatter parses scalars and strips the block from the body', () => {
  const r = extractFrontmatter('---\ntype: pnj\nchapitre: 1\n---\n\n# Body');
  assert.deepEqual(r.frontmatter, [['type', 'pnj'], ['chapitre', '1']]);
  assert.equal(r.body, '# Body');
});

test('extractFrontmatter joins block lists with commas', () => {
  const r = extractFrontmatter('---\ntags:\n  - pnj\n  - victime\n---\nBody');
  assert.deepEqual(r.frontmatter, [['tags', 'pnj, victime']]);
});

test('extractFrontmatter joins inline lists with commas', () => {
  const r = extractFrontmatter('---\ntags: [a, b, c]\n---\nx');
  assert.deepEqual(r.frontmatter, [['tags', 'a, b, c']]);
});

test('extractFrontmatter strips surrounding quotes from scalars', () => {
  const r = extractFrontmatter('---\nstatut: "prêt"\n---\nx');
  assert.deepEqual(r.frontmatter, [['statut', 'prêt']]);
});

test('extractFrontmatter preserves key order', () => {
  const r = extractFrontmatter('---\nz: 1\na: 2\nm: 3\n---\nx');
  assert.deepEqual(r.frontmatter.map((e) => e[0]), ['z', 'a', 'm']);
});

test('extractFrontmatter leaves a mid-document --- untouched', () => {
  const md = '# Title\n\n---\n\nMore';
  const r = extractFrontmatter(md);
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, md);
});

test('extractFrontmatter returns the input unchanged when the fence never closes', () => {
  const md = '---\ntype: pnj\n# no close';
  const r = extractFrontmatter(md);
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, md);
});
