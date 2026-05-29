// scripts/callout-color-menu.js
// Foundry-only ApplicationV2 form. Imported only by main.js (never by settings.js
// or tests), because it references foundry.applications.api at class-definition time.
// Structure mirrors a known-working core/system settings menu: a `form` PART plus a
// standard `footer` PART, with per-part context built in _preparePartContext.
import { MODULE_ID, getSetting } from './settings.js';
import { CALLOUT_TYPES, CALLOUT_EMOJI } from './obsidian.js';
import { DEFAULT_CALLOUT_COLORS, isValidHexColor } from './callout-colors.js';

export class CalloutColorMenu extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: 'markdown-paste-callout-colors',
    tag: 'form',
    window: {
      title: 'markdown-paste.calloutColors.title',
      icon: 'fa-solid fa-palette',
      contentClasses: ['standard-form'],
    },
    position: { width: 520 },
    form: {
      handler: CalloutColorMenu.#onSubmit,
      closeOnSubmit: true,
    },
    actions: {
      reset: CalloutColorMenu.#onReset,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/callout-color-menu.hbs`,
      scrollable: [''],
    },
    footer: {
      template: 'templates/generic/form-footer.hbs',
    },
  };

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch (partId) {
      case 'form': {
        const stored = getSetting('calloutColors') || {};
        context.rows = CALLOUT_TYPES.map((type) => ({
          type,
          emoji: CALLOUT_EMOJI[type],
          label: game.i18n.localize(`markdown-paste.callouts.${type}`),
          color: isValidHexColor(stored[type]) ? stored[type] : DEFAULT_CALLOUT_COLORS[type],
        }));
        break;
      }
      case 'footer':
        context.buttons = [
          {
            type: 'button',
            action: 'reset',
            icon: 'fa-solid fa-rotate-left',
            label: game.i18n.localize('markdown-paste.calloutColors.reset'),
          },
          {
            type: 'submit',
            icon: 'fa-solid fa-floppy-disk',
            label: game.i18n.localize('markdown-paste.calloutColors.save'),
          },
        ];
        break;
    }
    return context;
  }

  /** @inheritdoc — wire live preview swatches after the parts render. */
  async _renderHTML(context, options) {
    const parts = await super._renderHTML(context, options);
    parts.form?.querySelectorAll('input[type="color"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const preview = parts.form.querySelector(`[data-preview="${event.target.name}"]`);
        if (preview) preview.style.setProperty('--md-callout-color', event.target.value);
      });
    });
    return parts;
  }

  /** Reset every picker to the default palette and refresh its preview. */
  static #onReset() {
    for (const type of CALLOUT_TYPES) {
      const input = this.element.querySelector(`input[name="${type}"]`);
      if (!input) continue;
      input.value = DEFAULT_CALLOUT_COLORS[type];
      const preview = this.element.querySelector(`[data-preview="${type}"]`);
      if (preview) preview.style.setProperty('--md-callout-color', DEFAULT_CALLOUT_COLORS[type]);
    }
  }

  /** Persist the chosen colors (hex-validated) to the world setting. */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
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
