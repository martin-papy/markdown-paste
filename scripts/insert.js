// scripts/insert.js
/**
 * Insert sanitized HTML into a ProseMirror EditorView at the current selection.
 * Uses the editor's live schema so it adapts to whatever marks/nodes Foundry
 * (v13 or v14) configures for that surface.
 *
 * @param {EditorView} view - The originating ProseMirror EditorView.
 * @param {string} safeHtml - Already-sanitized HTML.
 */
export function insertHtml(view, safeHtml) {
  if (!view || !safeHtml) return;

  // Parse HTML string into a detached DOM tree using the browser standard
  // DOMParser. This is NOT the same as ProseMirror's DOMParser, which we use
  // below to convert the resulting DOM into a ProseMirror slice.
  const dom = new window.DOMParser()
    .parseFromString(safeHtml, 'text/html')
    .body;

  // ProseMirror.DOMParser is exposed by Foundry as part of the ProseMirror global.
  const parser = ProseMirror.DOMParser.fromSchema(view.state.schema);

  // Preferred path: parse an open slice and replace the selection. Open ends let
  // pasted inline content merge with surrounding text, which is the nicer result
  // for most pastes.
  //
  // Foundry treats any table carrying a <thead> (which every GFM table from
  // `marked` does) as an *isolating* "complex" table. When the parsed slice mixes
  // such a table with a sibling block — e.g. a table followed by a paragraph —
  // ProseMirror's fitter throws (TypeError: Cannot read properties of null) while
  // trying to fit the open slice. See issue #16. Building the transform does not
  // mutate state — only `dispatch` does — so catching here is safe: nothing has
  // been applied when we reach the fallback.
  let tr;
  try {
    tr = view.state.tr.replaceSelection(parser.parseSlice(dom));
  } catch {
    // Fallback: parse a full document and insert its content as a fully-closed
    // fragment via replaceWith. Closed content sidesteps the open-end fitting
    // that crashes on isolating tables, at the cost of inline merging.
    const { from, to } = view.state.selection;
    tr = view.state.tr.replaceWith(from, to, parser.parse(dom).content);
  }

  view.dispatch(tr);
}
