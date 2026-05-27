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
  const slice = ProseMirror.DOMParser
    .fromSchema(view.state.schema)
    .parseSlice(dom);

  view.dispatch(view.state.tr.replaceSelection(slice));
}
