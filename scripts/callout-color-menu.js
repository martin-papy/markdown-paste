// scripts/callout-color-menu.js
// Foundry-only: the class extends ApplicationV2 at import time, so this module is
// loaded exclusively from main.js (init hook), never from settings.js or tests.
import { MODULE_ID, getSetting } from './settings.js';
import { CALLOUT_TYPES, CALLOUT_EMOJI } from './obsidian.js';
import { DEFAULT_CALLOUT_COLORS, isValidHexColor } from './callout-colors.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CalloutColorMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'markdown-paste-callout-colors',
    tag: 'form',
    window: {
      title: 'markdown-paste.calloutColors.title',
      icon: 'fa-solid fa-palette',
      contentClasses: ['standard-form'],
    },
    position: { width: 520, height: 'auto' },
    form: { handler: CalloutColorMenu.#onSubmit, closeOnSubmit: true },
    actions: { reset: CalloutColorMenu.#onReset },
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/callout-color-menu.hbs` },
  };

  async _prepareContext() {
    const stored = getSetting('calloutColors') || {};
    const rows = CALLOUT_TYPES.map((type) => ({
      type,
      emoji: CALLOUT_EMOJI[type],
      label: game.i18n.localize(`markdown-paste.callouts.${type}`),
      color: isValidHexColor(stored[type]) ? stored[type] : DEFAULT_CALLOUT_COLORS[type],
    }));
    return { rows };
  }

  /** Wire live previews: changing a picker updates its swatch's accent color. */
  _onRender() {
    for (const input of this.element.querySelectorAll('input[type="color"]')) {
      input.addEventListener('input', (event) => {
        const preview = this.element.querySelector(`[data-preview="${event.target.name}"]`);
        if (preview) preview.style.setProperty('--md-callout-color', event.target.value);
      });
    }
  }

  /** Reset every picker to the default palette and refresh previews. */
  static #onReset() {
    for (const type of CALLOUT_TYPES) {
      const input = this.element.querySelector(`input[name="${type}"]`);
      if (!input) continue;
      input.value = DEFAULT_CALLOUT_COLORS[type];
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
  }

  /** Persist the chosen colors (hex-validated) to the world setting. */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const colors = {};
    for (const type of CALLOUT_TYPES) {
      colors[type] = isValidHexColor(data[type]) ? data[type] : DEFAULT_CALLOUT_COLORS[type];
    }
    await game.settings.set(MODULE_ID, 'calloutColors', colors);
  }
}

/** Register the color sub-form under the module's settings (GM-only). */
export function registerColorMenu() {
  game.settings.registerMenu(MODULE_ID, 'calloutColorsMenu', {
    name: 'markdown-paste.settings.calloutColors.name',
    label: 'markdown-paste.settings.calloutColors.label',
    hint: 'markdown-paste.settings.calloutColors.hint',
    icon: 'fa-solid fa-palette',
    type: CalloutColorMenu,
    restricted: true,
  });
}
