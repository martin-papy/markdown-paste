import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from '../vendor/marked.esm.js';
import DOMPurifyFactory from '../vendor/purify.es.mjs';
import { convert } from '../scripts/convert.js';
import { readFileSync } from 'node:fs';
const fixture = readFileSync(new URL('./test-file-obsidian.md', import.meta.url), 'utf8');

const window = new JSDOM('').window;
const DOMPurify = DOMPurifyFactory(window);
const deps = { marked, DOMPurify };

test('headings render as h1..h6', () => {
  const html = convert('# H1\n\n## H2\n\n###### H6', deps);
  assert.match(html, /<h1[^>]*>H1<\/h1>/);
  assert.match(html, /<h2[^>]*>H2<\/h2>/);
  assert.match(html, /<h6[^>]*>H6<\/h6>/);
});

test('paragraphs render as p', () => {
  const html = convert('Hello world.\n\nSecond paragraph.', deps);
  assert.match(html, /<p>Hello world\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test('emphasis renders bold and italic', () => {
  const html = convert('**bold** and *italic*', deps);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test('GFM strikethrough renders as del', () => {
  const html = convert('~~struck~~', deps);
  assert.match(html, /<del>struck<\/del>/);
});

test('inline code renders as code span', () => {
  const html = convert('Use `foo()`.', deps);
  assert.match(html, /<code>foo\(\)<\/code>/);
});

test('fenced code blocks render as pre/code', () => {
  const html = convert('```js\nconst x = 1;\n```', deps);
  assert.match(html, /<pre><code[^>]*>const x = 1;\n<\/code><\/pre>/);
});

test('blockquotes render as blockquote', () => {
  const html = convert('> a quote', deps);
  assert.match(html, /<blockquote>\s*<p>a quote<\/p>\s*<\/blockquote>/);
});

test('unordered lists render as ul/li', () => {
  const html = convert('- one\n- two', deps);
  assert.match(html, /<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
});

test('ordered lists render as ol/li', () => {
  const html = convert('1. one\n2. two', deps);
  assert.match(html, /<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ol>/);
});

test('GFM task lists render with checkboxes', () => {
  const html = convert('- [ ] todo\n- [x] done', deps);
  // marked emits the disabled and type="checkbox" attributes in varying order across versions; match both regardless of order
  assert.match(html, /<input[^>]*type="checkbox"[^>]*/);
  assert.match(html, /<input[^>]*disabled[^>]*/);
  assert.match(html, /<input[^>]*checked[^>]*>/);
});

test('GFM tables render as table/thead/tbody', () => {
  const md = '| a | b |\n|---|---|\n| 1 | 2 |';
  const html = convert(md, deps);
  assert.match(html, /<table>/);
  assert.match(html, /<thead>[\s\S]*<th>a<\/th>[\s\S]*<\/thead>/);
  assert.match(html, /<tbody>[\s\S]*<td>1<\/td>[\s\S]*<\/tbody>/);
});

test('links render as a tags', () => {
  const html = convert('[foundry](https://foundryvtt.com)', deps);
  assert.match(html, /<a href="https:\/\/foundryvtt\.com">foundry<\/a>/);
});

test('images render as img with src and alt', () => {
  const html = convert('![map](https://example.com/m.png)', deps);
  assert.match(html, /<img[^>]*src="https:\/\/example\.com\/m\.png"[^>]*alt="map"/);
});

test('script tags are stripped', () => {
  const html = convert('Hi <script>alert(1)</script> there', deps);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Hi/);
  assert.match(html, /there/);
});

test('onerror attributes are stripped', () => {
  // marked rejects the malformed image URL; use raw inline HTML to produce an <img onerror=...>
  const html = convert('<img src="https://e.com/x.png" onerror="alert(1)">', deps);
  assert.doesNotMatch(html, /onerror=/i);
});

test('javascript: hrefs are blocked', () => {
  const html = convert('[x](javascript:alert(1))', deps);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('inline style attributes are stripped (CSS-injection: beacons/clickjacking)', () => {
  const beacon = convert('<p style="background:url(https://attacker.example/track.png)">x</p>', deps);
  assert.doesNotMatch(beacon, /style=/i);
  assert.doesNotMatch(beacon, /attacker\.example/i);
  const overlay = convert('<div style="position:fixed;top:0;width:100%;height:100%">x</div>', deps);
  assert.doesNotMatch(overlay, /style=/i);
});

test('target="_blank" links are forced to rel="noopener noreferrer"', () => {
  const html = convert('<a href="https://example.com" target="_blank">x</a>', deps);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('target="_blank" matching is case-insensitive (_BLANK is hardened too)', () => {
  const html = convert('<a href="https://example.com" target="_BLANK">x</a>', deps);
  assert.match(html, /rel="[^"]*\bnoopener\b[^"]*"/);
  assert.match(html, /rel="[^"]*\bnoreferrer\b[^"]*"/);
});

test('existing rel tokens are preserved when hardening target="_blank"', () => {
  const html = convert('<a href="https://example.com" target="_blank" rel="nofollow">x</a>', deps);
  assert.match(html, /\bnofollow\b/);
  assert.match(html, /\bnoopener\b/);
  assert.match(html, /\bnoreferrer\b/);
});

test('rel hardening is idempotent across repeated conversions', () => {
  convert('<a href="https://example.com" target="_blank">x</a>', deps);
  const html = convert('<a href="https://example.com" target="_blank">x</a>', deps);
  // exactly one rel attribute, no stacked/duplicate values from repeated hooks
  assert.equal((html.match(/rel=/g) || []).length, 1);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('Foundry @UUID tokens pass through unchanged', () => {
  const html = convert('See @UUID[Actor.abc]{Bob} for details.', deps);
  assert.match(html, /@UUID\[Actor\.abc\]\{Bob\}/);
});

test('Foundry [[/r 1d20]] tokens pass through unchanged', () => {
  const html = convert('Roll [[/r 1d20]] now.', deps);
  assert.match(html, /\[\[\/r 1d20\]\]/);
});

test('gfmBreaks=false: single newlines do NOT become br', () => {
  const html = convert('line one\nline two', deps, { gfmBreaks: false });
  assert.doesNotMatch(html, /<br/);
});

test('gfmBreaks=true: single newlines become br', () => {
  const html = convert('line one\nline two', deps, { gfmBreaks: true });
  assert.match(html, /<br/);
});

test('empty input returns empty string', () => {
  assert.equal(convert('', deps), '');
});

test('convert renders Obsidian frontmatter as a Properties table by default', () => {
  const html = convert('---\ntype: pnj\n---\n\n# Title', deps);
  assert.match(html, /class="md-frontmatter"/);
  assert.match(html, /<td><strong>type<\/strong><\/td><td>pnj<\/td>/);
});

test('convert renders Obsidian callouts by default', () => {
  const html = convert('> [!tip] Hint\n> Body', deps);
  assert.match(html, /md-callout-tip/);
  assert.match(html, /💡 Hint/);
});

test('convert strips wikilinks but keeps Foundry rolls', () => {
  const html = convert('See [[Bob]] then roll [[/r 1d20]]', deps);
  assert.match(html, /See Bob then roll/);
  assert.match(html, /\[\[\/r 1d20\]\]/);
});

test('convert with obsidian:false leaves Obsidian syntax unprocessed', () => {
  const html = convert('---\ntype: pnj\n---\n> [!tip] Hint\n\n[[Page]]', deps, { obsidian: false });
  assert.doesNotMatch(html, /md-callout/);      // callouts off
  assert.doesNotMatch(html, /md-frontmatter/);  // frontmatter off
  assert.match(html, /\[!tip\]/);               // callout syntax raw
  assert.match(html, /\[\[Page\]\]/);           // wikilinks raw
});

test('convert injects localized labels', () => {
  const html = convert('---\ntype: pnj\n---\n> [!note]\n> body', deps, {
    labels: { properties: 'Propriétés', callouts: { note: 'Remarque' } },
  });
  assert.match(html, /Propriétés/);
  assert.match(html, /📝 Remarque/);
});

test('convert handles the Obsidian reference fixture end-to-end', () => {
  const html = convert(fixture, deps);
  assert.match(html, /class="md-frontmatter"/);          // Properties table present
  assert.match(html, /md-callout-info/);                 // first callout
  assert.match(html, /md-callout-quote/);                // quote callouts
  assert.match(html, /Montague Edwards/);                // wikilink reduced to text
  assert.doesNotMatch(html, /\[\[Montague Edwards\]\]/); // brackets gone
  assert.doesNotMatch(html, /<script/);                  // still sanitized
});

test('convert renders ==highlight== as <mark> and survives DOMPurify', () => {
  const html = convert('His name was ==Johnny Silverhand==.', deps);
  assert.match(html, /<mark class="md-highlight">Johnny Silverhand<\/mark>/);
});

test('convert leaves ==highlight== raw when obsidian:false', () => {
  const html = convert('==raw==', deps, { obsidian: false });
  assert.doesNotMatch(html, /<mark>/);
  assert.match(html, /==raw==/);
});
