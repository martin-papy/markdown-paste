// scripts/main.js
import { registerSettings, getSetting, MODULE_ID } from './settings.js';
import { registerMenuHook } from './menu-button.js';
import { registerColorMenu, openCalloutColorMenu } from './callout-color-menu.js';
import { applyCalloutColors } from './callout-colors.js';

Hooks.once('init', () => {
  console.info(
    `${MODULE_ID} | Initializing on Foundry release `
    + `${game.release?.generation}.${game.release?.build}`
  );
  registerSettings();
  registerColorMenu();
  registerMenuHook();
  enhanceSettingsConfig();
});

Hooks.once('ready', () => {
  // Apply the world's callout palette on every client (GM and players).
  applyCalloutColors(getSetting('calloutColors'));
});

/**
 * Enhance the Settings Configuration form for this module: prepend a heading at
 * the top of the module's category panel, and wire the callout-colors button to
 * open the form directly (Foundry's native `openSubmenu` action does not open
 * ApplicationV2 menus in some builds). Best-effort and UI-only: no-op if the
 * expected markup is absent, so it never throws.
 */
function enhanceSettingsConfig() {
  Hooks.on('renderSettingsConfig', (app, html) => {
    const root = html instanceof window.HTMLElement ? html : html?.[0];
    if (!root) return;

    // Any element belonging to this module anchors us to its category panel.
    // The registerMenu button reliably carries data-key="<module>.<menu>".
    const anchor =
      root.querySelector(`[data-key^="${MODULE_ID}."]`)
      ?? root.querySelector(`[data-setting-id^="${MODULE_ID}."]`)
      ?? root.querySelector(`[name^="${MODULE_ID}."]`);
    if (!anchor) return;

    // Heading: prepend to the top of the module's category section.
    const section = anchor.closest('section.tab') ?? anchor.closest('.form-group')?.parentElement;
    if (section && !section.querySelector('.markdown-paste-settings-heading')) {
      const heading = document.createElement('h3');
      heading.className = 'markdown-paste-settings-heading';
      heading.textContent = game.i18n.localize('markdown-paste.settings.heading.global');
      section.prepend(heading);
    }

    // Wire the callout-colors button to open the form directly.
    const menuBtn = root.querySelector(`[data-key="${MODULE_ID}.calloutColorsMenu"]`);
    if (menuBtn && !menuBtn.dataset.mdpWired) {
      menuBtn.dataset.mdpWired = '1';
      menuBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCalloutColorMenu();
      });
    }
  });
}
