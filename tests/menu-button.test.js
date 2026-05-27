import { test } from 'node:test';
import assert from 'node:assert/strict';

// Foundry globals that menu-button.js / settings.js touch (only inside functions,
// so defining them before importing the module under test is sufficient).
const captured = {};
globalThis.Hooks = { on: (event, fn) => { captured[event] = fn; } };
globalThis.game = { settings: { get: () => true } }; // every surface enabled

const { registerMenuHook, resolveSurfaceSetting } = await import('../scripts/menu-button.js');

// Mirror of foundry.prosemirror.ProseMirrorMenu._MENU_ITEM_SCOPES
// (common/prosemirror/menu.mjs). The render loop only draws a button when
// item.scope is BOTH ("") or matches the active surface ("text" | "html").
const SCOPES = { BOTH: '', TEXT: 'text', HTML: 'html' };

function makeMenu() {
  return {
    // No chat form and no application ancestor → resolves to 'enableElsewhere'.
    view: { dom: { closest: () => null } },
    constructor: { _MENU_ITEM_SCOPES: SCOPES },
  };
}

test('registerMenuHook subscribes to getProseMirrorMenuItems', () => {
  registerMenuHook();
  assert.equal(typeof captured.getProseMirrorMenuItems, 'function');
});

test('pushed menu item declares a scope Foundry will render (regression: missing scope hid the button)', () => {
  registerMenuHook();
  const items = [];
  captured.getProseMirrorMenuItems(makeMenu(), items);

  assert.equal(items.length, 1, 'exactly one item pushed when surface is enabled');
  const item = items[0];

  // Foundry drops items whose scope is not in {BOTH, TEXT, HTML}; undefined was the bug.
  assert.notEqual(item.scope, undefined, 'item must set a scope or it is never rendered');
  assert.ok(
    [SCOPES.BOTH, SCOPES.TEXT, SCOPES.HTML].includes(item.scope),
    `item.scope must be a valid ProseMirror menu scope, got ${JSON.stringify(item.scope)}`,
  );
  assert.equal(item.action, 'markdown-paste');
});

test('button is omitted when its surface setting is disabled', () => {
  const prev = globalThis.game.settings.get;
  globalThis.game.settings.get = () => false; // surface disabled
  try {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 0);
  } finally {
    globalThis.game.settings.get = prev;
  }
});

// --- resolveSurfaceSetting: per-surface mapping (regression for issue #3) ---
//
// A fake ProseMirror view whose DOM resolves to a chosen host element.
// resolveSurfaceSetting calls view.dom.closest() twice: once with the chat
// selector, once with the application selector. We branch on the selector text
// so the helper stays independent of the exact application selector string.
function viewFor(appEl, { chat = false } = {}) {
  return {
    dom: {
      closest: (selector) =>
        selector.includes('chat') ? (chat ? {} : null) : appEl,
    },
  };
}

// Stub the two registries resolveSurfaceSetting consults, then resolve.
// ApplicationV2 instances live in foundry.applications.instances keyed by the
// element id; legacy V1 windows live in ui.windows keyed by the numeric appid.
function resolveWith({ appEl, chat = false, instances = new Map(), windows = {} }) {
  const prevFoundry = globalThis.foundry;
  const prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances } };
  globalThis.ui = { windows };
  try {
    return resolveSurfaceSetting(viewFor(appEl, { chat }));
  } finally {
    globalThis.foundry = prevFoundry;
    globalThis.ui = prevUi;
  }
}

test('ApplicationV2 Journal page surface maps to enableInJournals', () => {
  const appEl = { id: 'JournalEntryPageProseMirrorSheet-abc', dataset: {} };
  const instances = new Map([[appEl.id, { document: { documentName: 'JournalEntryPage' } }]]);
  assert.equal(resolveWith({ appEl, instances }), 'enableInJournals');
});

test('ApplicationV2 Item sheet surface maps to enableInItems', () => {
  const appEl = { id: 'ItemSheetV2-xyz', dataset: {} };
  const instances = new Map([[appEl.id, { document: { documentName: 'Item' } }]]);
  assert.equal(resolveWith({ appEl, instances }), 'enableInItems');
});

test('ApplicationV2 Actor sheet surface maps to enableInActors', () => {
  const appEl = { id: 'ActorSheetV2-123', dataset: {} };
  const instances = new Map([[appEl.id, { document: { documentName: 'Actor' } }]]);
  assert.equal(resolveWith({ appEl, instances }), 'enableInActors');
});

test('legacy V1 sheet resolves via data-appid + ui.windows (regression guard)', () => {
  const appEl = { id: 'actor-XYZ', dataset: { appid: '42' } };
  const windows = { 42: { object: { documentName: 'Actor' } } };
  assert.equal(resolveWith({ appEl, windows }), 'enableInActors');
});

test('chat composer surface maps to enableInChat', () => {
  assert.equal(resolveWith({ appEl: null, chat: true }), 'enableInChat');
});

test('surface with no host application maps to enableElsewhere', () => {
  assert.equal(resolveWith({ appEl: null }), 'enableElsewhere');
});

test('host application with an unrecognised document maps to enableElsewhere', () => {
  const appEl = { id: 'Settings-app', dataset: {} };
  const instances = new Map([[appEl.id, { document: { documentName: 'Setting' } }]]);
  assert.equal(resolveWith({ appEl, instances }), 'enableElsewhere');
});
