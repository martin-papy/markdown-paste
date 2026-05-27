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
export function resolveSurfaceSetting(view) {
  const dom = view.dom;
  if (!dom) return 'enableElsewhere';

  // Chat composer detection — the chat form contains the ProseMirror editor
  // for chat messages on both v13 and v14.
  if (dom.closest('#chat-form, #chat-message, .chat-form')) {
    return 'enableInChat';
  }

  // Walk up to the host application element. ApplicationV2 (Journal/Item/Actor
  // sheets on v13/v14) renders its root with the `application` class; legacy V1
  // Application uses a numeric data-appid.
  const appEl = dom.closest('[data-appid], .application');
  if (!appEl) return 'enableElsewhere';

  // Resolve the host application instance. ApplicationV2 exposes its registry
  // id via the element's `id` attribute (Application#id) and is tracked in
  // foundry.applications.instances — NOT via a data-application-id dataset
  // attribute. Legacy V1 apps use the numeric data-appid keyed into ui.windows.
  const app =
    (appEl.id ? foundry.applications?.instances?.get(appEl.id) : null) ??
    (appEl.dataset.appid ? ui.windows?.[appEl.dataset.appid] : null) ??
    null;

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
