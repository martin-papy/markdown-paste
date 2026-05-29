// scripts/settings.js
import { applyCalloutColors, DEFAULT_CALLOUT_COLORS } from './callout-colors.js';

export const MODULE_ID = 'markdown-paste';

const SETTINGS = [
  { key: 'enableInJournals', def: true,  nameKey: 'markdown-paste.settings.enableInJournals.name',  hintKey: 'markdown-paste.settings.enableInJournals.hint' },
  { key: 'enableInItems',    def: true,  nameKey: 'markdown-paste.settings.enableInItems.name',     hintKey: 'markdown-paste.settings.enableInItems.hint' },
  { key: 'enableInActors',   def: true,  nameKey: 'markdown-paste.settings.enableInActors.name',    hintKey: 'markdown-paste.settings.enableInActors.hint' },
  { key: 'enableElsewhere',  def: true,  nameKey: 'markdown-paste.settings.enableElsewhere.name',   hintKey: 'markdown-paste.settings.enableElsewhere.hint' },
  { key: 'gfmBreaks',        def: false, nameKey: 'markdown-paste.settings.gfmBreaks.name',         hintKey: 'markdown-paste.settings.gfmBreaks.hint' },
  { key: 'processObsidian',  def: true,  nameKey: 'markdown-paste.settings.processObsidian.name',   hintKey: 'markdown-paste.settings.processObsidian.hint' },
  { key: 'allowNonGM',       def: false, nameKey: 'markdown-paste.settings.allowNonGM.name',        hintKey: 'markdown-paste.settings.allowNonGM.hint' },
];

export function registerSettings() {
  for (const s of SETTINGS) {
    game.settings.register(MODULE_ID, s.key, {
      name: s.nameKey,
      hint: s.hintKey,
      scope: 'world',
      config: true,
      type: Boolean,
      default: s.def,
    });
  }

  // Callout colors: world-scoped object, edited via the registerMenu sub-form
  // (see callout-color-menu.js). onChange re-applies the palette live.
  game.settings.register(MODULE_ID, 'calloutColors', {
    scope: 'world',
    config: false,
    type: Object,
    default: DEFAULT_CALLOUT_COLORS,
    onChange: (value) => applyCalloutColors(value),
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
