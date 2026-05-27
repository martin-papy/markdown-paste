import { extractFrontmatter, frontmatterToHtml, stripWikiLinks, transformCallouts } from './obsidian.js';

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

  // ADD_ATTR keeps target="_blank" / rel="noopener" on raw-HTML links authors paste.
  // DOMPurify still blocks javascript:, data:, and vbscript: protocols unconditionally,
  // so this does not widen the XSS surface — don't remove it during a security audit.
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  });
}
