// scripts/menu-button.js
import { openPasteDialog } from './dialog.js';
import { getSetting } from './settings.js';

/**
 * Walk up from the ProseMirror view's DOM to find the host Application and
 * resolve which setting controls visibility for this surface.
 *
 * @param {EditorView} view
 * @returns {string} The settings key that gates this surface.
 */
function resolveSurfaceSetting(view) {
  const dom = view.dom;
  if (!dom) return 'enableElsewhere';

  // Chat composer detection — the chat form contains the ProseMirror editor
  // for chat messages on both v13 and v14.
  if (dom.closest('#chat-form, #chat-message, .chat-form')) {
    return 'enableInChat';
  }

  // Walk up to the application element. ApplicationV2 marks itself with
  // [data-application-id]; legacy Application uses .window-app / [data-appid].
  const appEl = dom.closest('[data-application-id], [data-appid], .application');
  if (!appEl) return 'enableElsewhere';

  // Try to resolve the host document type via the application instance.
  const appId = appEl.dataset.applicationId || appEl.dataset.appid;
  const app = appId
    ? (foundry.applications.instances?.get(appId) ?? ui.windows?.[appId])
    : null;

  const docName = app?.document?.documentName ?? app?.object?.documentName ?? null;

  switch (docName) {
    case 'JournalEntry':
    case 'JournalEntryPage': return 'enableInJournals';
    case 'Item':             return 'enableInItems';
    case 'Actor':            return 'enableInActors';
    default:                 return 'enableElsewhere';
  }
}

export function registerMenuHook() {
  Hooks.on('getProseMirrorMenuItems', (menu, items) => {
    const settingKey = resolveSurfaceSetting(menu.view);
    if (!getSetting(settingKey)) return;

    items.push({
      action: 'markdown-paste',
      title: 'markdown-paste.button.title',
      icon: '<i class="fa-brands fa-markdown"></i>',
      // ProseMirrorMenu#render only draws items whose `scope` matches the active
      // editing surface (_MENU_ITEM_SCOPES: BOTH="" / TEXT="text" / HTML="html").
      // Without a scope the item is silently dropped. 'text' shows the button in
      // the rich-text editor, not the raw HTML source view (where PM insertion
      // wouldn't apply anyway).
      scope: 'text',
      group: 5,
      priority: 50,
      cmd: () => {
        openPasteDialog(menu.view);
        return true;
      },
    });
  });
}
