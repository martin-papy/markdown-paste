/**
 * Convert a Markdown string to sanitized HTML.
 * Dependencies are injected so the function is unit-testable in Node + jsdom
 * and decoupled from how Foundry loads marked/DOMPurify at runtime.
 *
 * @param {string} md - Markdown source.
 * @param {{ marked: object, DOMPurify: object }} deps - Injected libs.
 * @param {{ gfmBreaks?: boolean }} [options]
 * @returns {string} Sanitized HTML.
 */
export function convert(md, deps, options = {}) {
  if (!md) return '';
  const { marked, DOMPurify } = deps;
  const { gfmBreaks = false } = options;

  const html = marked.parse(md, {
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
