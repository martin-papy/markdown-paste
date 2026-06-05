import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// insert.js touches two runtime globals: `window` (for the standard DOMParser)
// and `ProseMirror` (Foundry's bundled ProseMirror). Both only inside the
// function body, so defining them before importing the module is enough.
const jsdom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = jsdom.window;

const { insertHtml } = await import('../scripts/insert.js');

/**
 * Build a fake ProseMirror + EditorView pair.
 *
 * Foundry treats any table containing <thead> (which every GFM table from
 * `marked` carries) as an *isolating* "complex" table. When the parsed slice is
 * `[isolating table, paragraph]` — e.g. a table followed by a paragraph — the
 * ProseMirror fitter throws `TypeError: Cannot read properties of null` from
 * `replaceSelection`. This was confirmed against the real prosemirror-tables
 * fitter using Foundry's own schema (see issue #16). `sliceThrows` simulates
 * that crash so the test stays free of the heavy ProseMirror dependency.
 */
function makeHarness({ sliceThrows }) {
  const calls = { parseSlice: 0, parse: 0, replaceSelection: 0, replaceWith: 0, dispatch: 0 };
  const fragment = { __fragment: true };

  const parser = {
    parseSlice: () => { calls.parseSlice++; return { __slice: true }; },
    parse: () => { calls.parse++; return { content: fragment }; },
  };

  globalThis.ProseMirror = { DOMParser: { fromSchema: () => parser } };

  const tr = {
    replaceSelection() {
      calls.replaceSelection++;
      if (sliceThrows) throw new TypeError("Cannot read properties of null (reading 'type')");
      return this;
    },
    replaceWith(from, to, content) {
      calls.replaceWith++;
      assert.equal(content, fragment, 'fallback inserts the parsed document content');
      return this;
    },
  };

  const view = {
    dom: jsdom.window.document.body,
    state: { schema: {}, selection: { from: 3, to: 3 }, tr },
    dispatch() { calls.dispatch++; },
  };

  return { view, calls };
}

const HTML = '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><p>After.</p>';

test('happy path: a fittable slice is inserted via replaceSelection', () => {
  const { view, calls } = makeHarness({ sliceThrows: false });
  insertHtml(view, HTML);
  assert.equal(calls.replaceSelection, 1);
  assert.equal(calls.replaceWith, 0, 'no fallback needed when the slice fits');
  assert.equal(calls.dispatch, 1);
});

test('regression (issue #16): a fitter crash falls back to replaceWith instead of throwing', () => {
  const { view, calls } = makeHarness({ sliceThrows: true });
  // Before the fix this threw, bubbling up to dialog.js as "conversion failed".
  assert.doesNotThrow(() => insertHtml(view, HTML));
  assert.equal(calls.replaceSelection, 1, 'still attempts the slice path first');
  assert.equal(calls.parse, 1, 'falls back to a full parse()');
  assert.equal(calls.replaceWith, 1, 'inserts fully-closed content on fallback');
  assert.equal(calls.dispatch, 1, 'the document is still updated');
});
