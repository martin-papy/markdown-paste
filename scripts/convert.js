import { extractFrontmatter, frontmatterToHtml, stripWikiLinks, transformCallouts } from './obsidian.js';

/**
 * Force rel="noopener noreferrer" on every target="_blank" link to block
 * reverse-tabnabbing. Registered once per DOMPurify instance (idempotent),
 * so repeated convert() calls don't stack duplicate hooks.
 */
function ensureLinkHardening(DOMPurify) {
  if (DOMPurify.__mdPasteHardened) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  DOMPurify.__mdPasteHardened = true;
}

/**
 * Convert a Markdown string to sanitized HTML.
 * Dependencies are injected so the function is unit-testable in Node + jsdom
 * and decoupled from how Foundry loads marked/DOMPurify at runtime.
 *
 * @param {string} md - Markdown source.
 * @param {{ marked: object, DOMPurify: object }} deps - Injected libs.
 * @param {{ gfmBreaks?: boolean, obsidian?: boolean, labels?: object }} [options]
 *   - gfmBreaks: treat single newlines as <br>.
 *   - obsidian: run the Obsidian compatibility layer (frontmatter, callouts, wikilinks). Default true.
 *   - labels: localized strings injected into the Obsidian layer ({ properties, callouts }).
 * @returns {string} Sanitized HTML.
 */
export function convert(md, deps, options = {}) {
  if (!md) return '';
  const { marked, DOMPurify } = deps;
  const { gfmBreaks = false, obsidian = true, labels } = options;

  let source = md;
  if (obsidian) {
    const { frontmatter, body } = extractFrontmatter(source);
    let processed = stripWikiLinks(body);
    processed = transformCallouts(processed, marked, labels);
    source = (frontmatter ? `${frontmatterToHtml(frontmatter, labels)}\n\n` : '') + processed;
  }

  const html = marked.parse(source, {
    gfm: true,
    breaks: gfmBreaks,
  });

  ensureLinkHardening(DOMPurify);

  // ADD_ATTR keeps author-supplied target/rel on raw-HTML links; the hook above
  // then forces rel="noopener noreferrer" whenever target="_blank" is present.
  // FORBID_ATTR drops inline style to block CSS-injection — url() beacons that
  // phone home on view, and position overlays used for clickjacking. DOMPurify
  // still blocks javascript:, data:, and vbscript: protocols unconditionally,
  // so this config does not widen the XSS surface — don't loosen it in an audit.
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_ATTR: ['style'],
  });
}
