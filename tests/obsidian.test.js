import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from '../vendor/marked.esm.js';
import { canonicalType, CALLOUT_TYPES, extractFrontmatter, frontmatterToHtml, isolateTables, stripWikiLinks, transformCallouts, transformHighlights } from '../scripts/obsidian.js';

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

// --- isolateTables: terminate a table that is glued to following text -------
// GFM (and marked) absorb a pipe-less line directly after table rows as a
// single-cell row; Obsidian/Typora end the table there. issue #16.

test('isolateTables inserts a blank line between a table and a glued text line', () => {
  const md = '| a | b |\n| - | - |\n| 1 | 2 |\n*note text.*';
  assert.equal(isolateTables(md), '| a | b |\n| - | - |\n| 1 | 2 |\n\n*note text.*');
});

test('isolateTables leaves a table already separated by a blank line unchanged', () => {
  const md = '| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter.';
  assert.equal(isolateTables(md), md);
});

test('isolateTables keeps following pipe rows as part of the table', () => {
  const md = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';
  assert.equal(isolateTables(md), md);
});

test('isolateTables leaves prose without a table unchanged', () => {
  const md = 'Just a paragraph.\nAnother line.';
  assert.equal(isolateTables(md), md);
});

test('isolateTables handles a table at end of input without a trailing line', () => {
  const md = '| a | b |\n| - | - |\n| 1 | 2 |';
  assert.equal(isolateTables(md), md);
});

test('isolateTables does not treat a pipe-less header candidate as a table', () => {
  const md = 'no pipes here\n- - -\nstill prose';
  assert.equal(isolateTables(md), md);
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

test('extractFrontmatter keeps an empty value as an empty string', () => {
  const r = extractFrontmatter('---\nnote:\n---\nx');
  assert.deepEqual(r.frontmatter, [['note', '']]);
});

test('extractFrontmatter preserves a malformed line as a raw scalar (never dropped)', () => {
  const r = extractFrontmatter('---\ntype: pnj\norphan line\n---\nx');
  assert.deepEqual(r.frontmatter, [['type', 'pnj'], ['', 'orphan line']]);
});

test('extractFrontmatter handles CRLF line endings', () => {
  const r = extractFrontmatter('---\r\ntype: pnj\r\nname: Bob\r\n---\r\nBody');
  assert.deepEqual(r.frontmatter, [['type', 'pnj'], ['name', 'Bob']]);
});

test('extractFrontmatter preserves nested-map lines as a raw scalar', () => {
  const r = extractFrontmatter('---\nstats:\n  str: 10\n  con: 12\n---\nx');
  assert.deepEqual(r.frontmatter, [['stats', 'str: 10, con: 12']]);
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

test('stripWikiLinks falls back to the page name when the alias is empty', () => {
  assert.equal(stripWikiLinks('[[Note|]]'), 'Note');
});

test('transformCallouts wraps a callout in a classed blockquote with emoji + title', () => {
  const out = transformCallouts('> [!tip] Heads up\n> Body text', marked);
  assert.match(out, /<blockquote class="md-callout md-callout-tip">/);
  assert.match(out, /<p class="md-callout-title"><strong>💡 Heads up<\/strong><\/p>/);
  assert.match(out, /Body text/);
});

test('transformCallouts resolves aliases to the canonical type', () => {
  const out = transformCallouts('> [!summary] S', marked);
  assert.match(out, /md-callout-abstract/);
  assert.match(out, /📋 S/);
});

test('transformCallouts falls back to the type label when no title is given', () => {
  const out = transformCallouts('> [!note]\n> body', marked);
  assert.match(out, /<strong>📝 Note<\/strong>/);
});

test('transformCallouts accepts +/- fold markers', () => {
  const out = transformCallouts('> [!info]+ Title', marked);
  assert.match(out, /md-callout-info/);
  assert.match(out, /ℹ️ Title/);
});

test('transformCallouts renders body Markdown', () => {
  const out = transformCallouts('> [!note] T\n> - one\n> - two', marked);
  assert.match(out, /<li>one<\/li>/);
});

test('transformCallouts uses a generic class for unknown types', () => {
  const out = transformCallouts('> [!frobnicate] X', marked);
  assert.match(out, /class="md-callout"/);
  assert.match(out, /<strong>X<\/strong>/);
});

test('transformCallouts leaves ordinary blockquotes alone', () => {
  assert.equal(transformCallouts('> just a quote', marked), '> just a quote');
});

test('transformCallouts uses injected callout labels', () => {
  const out = transformCallouts('> [!note]', marked, { callouts: { note: 'Remarque' } });
  assert.match(out, /📝 Remarque/);
});

test('transformCallouts keeps adjacent callouts separate without a blank line', () => {
  const out = transformCallouts('> [!note] First\n> body\n> [!tip] Second\n> body2', marked);
  const blocks = out.match(/<blockquote class="md-callout/g) || [];
  assert.equal(blocks.length, 2);
  assert.match(out, /md-callout-note/);
  assert.match(out, /md-callout-tip/);
});

test('transformHighlights wraps ==text== in <mark class="md-highlight">', () => {
  assert.equal(transformHighlights('His name was ==Johnny Silverhand==.'), 'His name was <mark class="md-highlight">Johnny Silverhand</mark>.');
});

test('transformHighlights handles multiple highlights on one line', () => {
  assert.equal(transformHighlights('==foo== and ==bar=='), '<mark class="md-highlight">foo</mark> and <mark class="md-highlight">bar</mark>');
});

test('transformHighlights does not span newlines', () => {
  assert.equal(transformHighlights('==foo\nbar=='), '==foo\nbar==');
});

test('transformHighlights leaves ==== (empty) alone', () => {
  assert.equal(transformHighlights('===='), '====');
});

test('transformHighlights leaves plain text unchanged', () => {
  assert.equal(transformHighlights('no highlights here'), 'no highlights here');
});

test('CALLOUT_EMOJI is exported with an entry for every callout type', async () => {
  const { CALLOUT_EMOJI, CALLOUT_TYPES } = await import('../scripts/obsidian.js');
  assert.equal(typeof CALLOUT_EMOJI, 'object');
  for (const type of CALLOUT_TYPES) {
    assert.equal(typeof CALLOUT_EMOJI[type], 'string');
    assert.ok(CALLOUT_EMOJI[type].length > 0, `missing emoji: ${type}`);
  }
});
