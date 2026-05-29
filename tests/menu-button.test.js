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
    // No application ancestor → resolves to 'enableElsewhere'.
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
// resolveSurfaceSetting calls view.dom.closest() once, with the application
// selector, so the helper just returns the chosen host element.
function viewFor(appEl) {
  return { dom: { closest: () => appEl } };
}

// Stub the two registries resolveSurfaceSetting consults, then resolve.
// ApplicationV2 instances live in foundry.applications.instances keyed by the
// element id; legacy V1 windows live in ui.windows keyed by the numeric appid.
function resolveWith({ appEl, instances = new Map(), windows = {} }) {
  const prevFoundry = globalThis.foundry;
  const prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances } };
  globalThis.ui = { windows };
  try {
    return resolveSurfaceSetting(viewFor(appEl));
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

test('surface with no host application maps to enableElsewhere', () => {
  assert.equal(resolveWith({ appEl: null }), 'enableElsewhere');
});

test('host application with an unrecognised document maps to enableElsewhere', () => {
  const appEl = { id: 'Settings-app', dataset: {} };
  const instances = new Map([[appEl.id, { document: { documentName: 'Setting' } }]]);
  assert.equal(resolveWith({ appEl, instances }), 'enableElsewhere');
});

// --- Access gate (allowNonGM) -------------------------------------------------
// resolveSurfaceSetting on makeMenu() returns 'enableElsewhere' (no host app).
// A keyed game.settings.get lets each test control allowNonGM vs the surface flag.

function withGame(user, getImpl, fn) {
  const prev = globalThis.game;
  globalThis.game = { user, settings: { get: getImpl } };
  try { return fn(); } finally { globalThis.game = prev; }
}

test('non-GM is blocked when allowNonGM is disabled', () => {
  withGame({ isGM: false }, (m, key) => (key === 'allowNonGM' ? false : true), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 0);
  });
});

test('non-GM is allowed when allowNonGM is enabled and the surface is enabled', () => {
  withGame({ isGM: false }, () => true, () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 1);
  });
});

test('non-GM allowed but surface disabled → no button (per-surface gate still applies)', () => {
  withGame({ isGM: false }, (m, key) => (key === 'allowNonGM' ? true : false), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 0);
  });
});

test('GM is allowed even when allowNonGM is disabled', () => {
  withGame({ isGM: true }, (m, key) => (key === 'allowNonGM' ? false : true), () => {
    registerMenuHook();
    const items = [];
    captured.getProseMirrorMenuItems(makeMenu(), items);
    assert.equal(items.length, 1);
  });
});
