// scripts/callout-color-menu.js
// Foundry-only ApplicationV2 form. Imported only by main.js (never by settings.js
// or tests), because it references foundry.applications.api at class-definition time.
// Structure mirrors a known-working core/system settings menu: a `form` PART plus a
// standard `footer` PART, with per-part context built in _preparePartContext.
import { MODULE_ID, getSetting } from './settings.js';
import { CALLOUT_TYPES, CALLOUT_EMOJI } from './obsidian.js';
import { DEFAULT_COLORS, isValidHexColor } from './callout-colors.js';

// All editable color keys: the 13 callout types plus the highlight (<mark>) color.
const COLOR_KEYS = [...CALLOUT_TYPES, 'highlight'];

export class CalloutColorMenu extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    // NOTE: must differ from the injected <style id="markdown-paste-callout-colors">
    // (see callout-colors.js). ApplicationV2._insertElement uses getElementById(id)
    // to place the window; a shared id makes it replace the <style> in <head> and
    // the window never reaches <body>.
    id: 'markdown-paste-callout-color-menu',
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
        const colorFor = (key) => (isValidHexColor(stored[key]) ? stored[key] : DEFAULT_COLORS[key]);
        context.rows = [
          ...CALLOUT_TYPES.map((type) => ({
            type,
            isHighlight: false,
            cssVar: '--md-callout-color',
            emoji: CALLOUT_EMOJI[type],
            label: game.i18n.localize(`markdown-paste.callouts.${type}`),
            color: colorFor(type),
          })),
          {
            type: 'highlight',
            isHighlight: true,
            cssVar: '--md-highlight-bg',
            emoji: '🖍️',
            label: game.i18n.localize('markdown-paste.calloutColors.highlight'),
            color: colorFor('highlight'),
          },
        ];
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
        if (preview) preview.style.setProperty(preview.dataset.cssVar || '--md-callout-color', event.target.value);
      });
    });
    return parts;
  }

  /** Reset every picker to the default palette and refresh its preview. */
  static #onReset() {
    for (const key of COLOR_KEYS) {
      const input = this.element.querySelector(`input[name="${key}"]`);
      if (!input) continue;
      input.value = DEFAULT_COLORS[key];
      const preview = this.element.querySelector(`[data-preview="${key}"]`);
      if (preview) preview.style.setProperty(preview.dataset.cssVar || '--md-callout-color', DEFAULT_COLORS[key]);
    }
  }

  /** Persist the chosen colors (hex-validated) to the world setting. */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const colors = {};
    for (const key of COLOR_KEYS) {
      colors[key] = isValidHexColor(data[key]) ? data[key] : DEFAULT_COLORS[key];
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
