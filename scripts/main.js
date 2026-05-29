// scripts/main.js
import { registerSettings, getSetting, MODULE_ID } from './settings.js';
import { registerMenuHook } from './menu-button.js';
import { registerColorMenu } from './callout-color-menu.js';
import { applyCalloutColors } from './callout-colors.js';

Hooks.once('init', () => {
  console.info(
    `${MODULE_ID} | Initializing on Foundry release `
    + `${game.release?.generation}.${game.release?.build}`
  );
  registerSettings();
  registerColorMenu();
  registerMenuHook();
  registerSettingsHeading();
});

Hooks.once('ready', () => {
  // Apply the world's callout palette on every client (GM and players).
  applyCalloutColors(getSetting('calloutColors'));
});

/**
 * Inject a "Global Settings" heading before this module's first setting in the
 * Settings Configuration form. Best-effort and UI-only: no-op if the expected
 * markup is absent, so it never throws.
 */
function registerSettingsHeading() {
  Hooks.on('renderSettingsConfig', (app, html) => {
    const root = html instanceof window.HTMLElement ? html : html?.[0];
    if (!root) return;

    // Anchor on the module's first setting. Different Foundry versions expose it
    // via a data-setting-id attribute or a form field named "<module>.<key>";
    // try both so the heading lands regardless of the exact settings markup.
    const anchor =
      root.querySelector(`[data-setting-id^="${MODULE_ID}."]`)
      ?? root.querySelector(`[name^="${MODULE_ID}."]`);
    const group = anchor?.closest('.form-group');
    if (!group?.parentElement) return;

    // Idempotent: don't inject twice if the form re-renders.
    if (group.previousElementSibling?.classList?.contains('markdown-paste-settings-heading')) return;

    const heading = document.createElement('h3');
    heading.className = 'markdown-paste-settings-heading';
    heading.textContent = game.i18n.localize('markdown-paste.settings.heading.global');
    group.parentElement.insertBefore(heading, group);
  });
}
