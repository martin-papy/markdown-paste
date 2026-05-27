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

function unquote(s) {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlSubset(lines) {
  const entries = [];
  let open = null; // { key, items: [], raw: [] } for a key awaiting indented children

  const flush = () => {
    if (!open) return;
    const value = open.items.length ? open.items.join(', ')
      : open.raw.length ? open.raw.join(', ')
      : '';
    entries.push([open.key, value]);
    open = null;
  };

  for (const line of lines) {
    if (line.trim() === '') continue;

    if (open && /^\s+/.test(line)) {
      const dash = line.match(/^\s*-\s+(.*)$/);
      if (dash) { open.items.push(unquote(dash[1].trim())); continue; }
      open.raw.push(line.trim()); // nested map / unrecognized indented line — preserved
      continue;
    }

    flush();
    const kv = line.match(/^([\w.\-]+):\s*(.*)$/);
    if (!kv) continue; // malformed top-level line — skipped
    const key = kv[1];
    const rest = kv[2].trim();
    if (rest === '') {
      open = { key, items: [], raw: [] };
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      const items = inner === '' ? [] : inner.split(',').map((s) => unquote(s.trim()));
      entries.push([key, items.join(', ')]);
    } else {
      entries.push([key, unquote(rest)]);
    }
  }
  flush();
  return entries;
}

/**
 * Split leading YAML frontmatter from the Markdown body.
 * @param {string} md
 * @returns {{ frontmatter: Array<[string,string]>|null, body: string }}
 */
export function extractFrontmatter(md) {
  const lines = md.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: null, body: md };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { frontmatter: null, body: md };

  const entries = parseYamlSubset(lines.slice(1, end));
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { frontmatter: entries.length ? entries : null, body };
}
