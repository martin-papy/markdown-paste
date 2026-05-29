// scripts/callout-colors.js
// Pure callout-color helpers. No Foundry imports; `document` is only touched
// inside applyCalloutColors (default arg evaluated at call time), so this module
// is safe to import in Node + jsdom.
import { CALLOUT_TYPES } from './obsidian.js';

/** Default callout accent colors — mirrors the :root values in markdown-paste.css. */
export const DEFAULT_CALLOUT_COLORS = Object.freeze({
  note: '#448aff', abstract: '#00b8d4', info: '#448aff', todo: '#448aff',
  tip: '#00bfa5', success: '#00c853', question: '#f2c037', warning: '#ff9800',
  failure: '#ff5252', danger: '#ff1744', bug: '#f50057', example: '#7c4dff',
  quote: '#9e9e9e',
});

/** Default background color for ==highlight== (<mark class="md-highlight">). */
export const DEFAULT_HIGHLIGHT_COLOR = '#fff3a3';

/** Combined default for the calloutColors world setting (callouts + highlight). */
export const DEFAULT_COLORS = Object.freeze({
  ...DEFAULT_CALLOUT_COLORS,
  highlight: DEFAULT_HIGHLIGHT_COLOR,
});

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @param {unknown} value
 * @returns {boolean} true only for "#rgb" / "#rrggbb" strings.
 */
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

const STYLE_ID = 'markdown-paste-callout-colors';

/**
 * Build a :root stylesheet overriding the callout color variables. Each value is
 * validated; invalid/missing entries fall back to the default so a tampered world
 * setting cannot inject arbitrary CSS through the <style> sink.
 * @param {Record<string,string>} [colors]
 * @returns {string}
 */
export function buildCalloutColorCss(colors = {}) {
  // Coerce non-objects (e.g. null from a cleared/corrupted setting) to {} so
  // the reads below are always safe.
  if (colors === null || typeof colors !== 'object') colors = {};
  const decls = CALLOUT_TYPES.map((type) => {
    const raw = colors[type];
    const safe = isValidHexColor(raw) ? raw : DEFAULT_CALLOUT_COLORS[type];
    return `--md-callout-${type}:${safe};`;
  });
  const highlight = isValidHexColor(colors.highlight) ? colors.highlight : DEFAULT_HIGHLIGHT_COLOR;
  decls.push(`--md-highlight-bg:${highlight};`);
  return `:root{${decls.join('')}}`;
}

/**
 * Inject or update the single callout-color <style> element in <head>.
 * @param {Record<string,string>} colors
 * @param {Document} [doc]
 * @returns {HTMLStyleElement}
 */
export function applyCalloutColors(colors, doc = document) {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildCalloutColorCss(colors);
  return style;
}
