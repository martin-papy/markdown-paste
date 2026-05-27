// scripts/obsidian.js
// Pure Obsidian-syntax transforms. No Foundry imports — unit-testable in Node + jsdom.

const CALLOUT_EMOJI = {
  note: '📝', abstract: '📋', info: 'ℹ️', todo: '☑️', tip: '💡',
  success: '✅', question: '❓', warning: '⚠️', failure: '❌',
  danger: '⚡', bug: '🐛', example: '📑', quote: '💬',
};

const CALLOUT_ALIAS = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip', important: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger', cite: 'quote',
};

const DEFAULT_LABELS = {
  properties: 'Properties',
  callouts: {
    note: 'Note', abstract: 'Abstract', info: 'Info', todo: 'To-do', tip: 'Tip',
    success: 'Success', question: 'Question', warning: 'Warning', failure: 'Failure',
    danger: 'Danger', bug: 'Bug', example: 'Example', quote: 'Quote',
  },
};

/** The 13 canonical callout types, in display order. */
export const CALLOUT_TYPES = Object.keys(CALLOUT_EMOJI);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve a raw callout type token to its canonical type, or null if unknown.
 * @param {string} raw
 * @returns {string|null}
 */
export function canonicalType(raw) {
  const t = String(raw).toLowerCase();
  if (CALLOUT_EMOJI[t]) return t;
  if (CALLOUT_ALIAS[t]) return CALLOUT_ALIAS[t];
  return null;
}
