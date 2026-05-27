import { test } from 'node:test';
import assert from 'node:assert/strict';

// Foundry globals that menu-button.js / settings.js touch (only inside functions,
// so defining them before importing the module under test is sufficient).
const captured = {};
globalThis.Hooks = { on: (event, fn) => { captured[event] = fn; } };
globalThis.game = { settings: { get: () => true } }; // every surface enabled

const { registerMenuHook } = await import('../scripts/menu-button.js');

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
