import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalType, CALLOUT_TYPES, extractFrontmatter, frontmatterToHtml, stripWikiLinks } from '../scripts/obsidian.js';

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

test('frontmatterToHtml renders a titled key/value table', () => {
  const html = frontmatterToHtml([['type', 'pnj'], ['tags', 'a, b']]);
  assert.match(html, /<p class="md-frontmatter-title"><strong>Properties<\/strong><\/p>/);
  assert.match(html, /<table class="md-frontmatter">/);
  assert.match(html, /<tr><td><strong>type<\/strong><\/td><td>pnj<\/td><\/tr>/);
  assert.match(html, /<tr><td><strong>tags<\/strong><\/td><td>a, b<\/td><\/tr>/);
});

test('frontmatterToHtml uses the injected title label', () => {
  const html = frontmatterToHtml([['type', 'pnj']], { properties: 'Propriétés' });
  assert.match(html, /<strong>Propriétés<\/strong>/);
});

test('frontmatterToHtml escapes key and value content', () => {
  const html = frontmatterToHtml([['x', '<script>alert(1)</script>']]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('stripWikiLinks converts a plain wikilink to its text', () => {
  assert.equal(stripWikiLinks('see [[Montague Edwards]] now'), 'see Montague Edwards now');
});

test('stripWikiLinks uses the alias after a pipe', () => {
  assert.equal(stripWikiLinks('[[St. Agnes|son lieu]]'), 'son lieu');
});

test('stripWikiLinks drops heading/block refs', () => {
  assert.equal(stripWikiLinks('[[Note#Heading]]'), 'Note');
});

test('stripWikiLinks leaves Foundry command rolls alone', () => {
  assert.equal(stripWikiLinks('roll [[/r 1d20]]'), 'roll [[/r 1d20]]');
});

test('stripWikiLinks leaves Foundry inline rolls alone', () => {
  assert.equal(stripWikiLinks('[[1d20+5]]'), '[[1d20+5]]');
});

test('stripWikiLinks leaves embeds alone', () => {
  assert.equal(stripWikiLinks('![[image.png]]'), '![[image.png]]');
});

test('stripWikiLinks does not touch @UUID tokens', () => {
  assert.equal(stripWikiLinks('@UUID[Actor.x]{Bob}'), '@UUID[Actor.x]{Bob}');
});
