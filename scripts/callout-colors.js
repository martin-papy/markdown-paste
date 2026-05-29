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
  const decls = CALLOUT_TYPES.map((type) => {
    const raw = colors[type];
    const safe = isValidHexColor(raw) ? raw : DEFAULT_CALLOUT_COLORS[type];
    return `--md-callout-${type}:${safe};`;
  }).join('');
  return `:root{${decls}}`;
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
