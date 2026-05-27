// scripts/dialog.js
import { convert } from './convert.js';
import { insertHtml } from './insert.js';
import { getSetting } from './settings.js';
import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';

/**
 * Open the Paste Markdown dialog for a given ProseMirror view.
 * Captures `view` and its current selection so the dialog can outlive
 * focus changes and still target the originating editor.
 *
 * @param {EditorView} view
 */
export async function openPasteDialog(view) {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <div class="markdown-paste-dialog">
      <textarea name="md" rows="20" autofocus
        placeholder="${game.i18n.localize('markdown-paste.dialog.placeholder')}"></textarea>
      <p class="hint">${game.i18n.localize('markdown-paste.dialog.hint')}</p>
    </div>
  `;

  await DialogV2.wait({
    window: { title: 'markdown-paste.dialog.title' },
    content,
    buttons: [
      {
        action: 'insert',
        label: 'markdown-paste.dialog.insert',
        default: true,
        callback: (event, button, dialog) => {
          const md = dialog.element.querySelector('textarea[name="md"]').value;
          if (!md) return;
          try {
            const safeHtml = convert(md, { marked, DOMPurify }, {
              gfmBreaks: getSetting('gfmBreaks'),
            });
            if (!view.dom || !document.contains(view.dom)) {
              ui.notifications.warn(game.i18n.localize('markdown-paste.errors.editorClosed'));
              return;
            }
            insertHtml(view, safeHtml);
          } catch (err) {
            console.error('markdown-paste: conversion failed', err);
            ui.notifications.error(game.i18n.localize('markdown-paste.errors.parseFailed'));
          }
        },
      },
      {
        action: 'cancel',
        label: 'markdown-paste.dialog.cancel',
      },
    ],
    render: (event, dialog) => {
      const textarea = dialog.element.querySelector('textarea[name="md"]');
      const insertBtn = dialog.element.querySelector('button[data-action="insert"]');
      const update = () => { insertBtn.disabled = textarea.value.trim().length === 0; };
      textarea.addEventListener('input', update);
      update();
    },
  });
}
