// scripts/settings.js
export const MODULE_ID = 'markdown-paste';

const SETTINGS = [
  { key: 'enableInJournals', def: true,  nameKey: 'markdown-paste.settings.enableInJournals.name',  hintKey: 'markdown-paste.settings.enableInJournals.hint' },
  { key: 'enableInItems',    def: true,  nameKey: 'markdown-paste.settings.enableInItems.name',     hintKey: 'markdown-paste.settings.enableInItems.hint' },
  { key: 'enableInActors',   def: true,  nameKey: 'markdown-paste.settings.enableInActors.name',    hintKey: 'markdown-paste.settings.enableInActors.hint' },
  { key: 'enableInChat',     def: false, nameKey: 'markdown-paste.settings.enableInChat.name',      hintKey: 'markdown-paste.settings.enableInChat.hint' },
  { key: 'enableElsewhere',  def: true,  nameKey: 'markdown-paste.settings.enableElsewhere.name',   hintKey: 'markdown-paste.settings.enableElsewhere.hint' },
  { key: 'gfmBreaks',        def: false, nameKey: 'markdown-paste.settings.gfmBreaks.name',         hintKey: 'markdown-paste.settings.gfmBreaks.hint' },
];

export function registerSettings() {
  for (const s of SETTINGS) {
    game.settings.register(MODULE_ID, s.key, {
      name: s.nameKey,
      hint: s.hintKey,
      scope: 'client',
      config: true,
      type: Boolean,
      default: s.def,
    });
  }
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
