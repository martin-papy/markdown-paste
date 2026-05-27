// scripts/main.js
import { registerSettings, MODULE_ID } from './settings.js';
import { registerMenuHook } from './menu-button.js';

Hooks.once('init', () => {
  console.info(
    `${MODULE_ID} | Initializing on Foundry release `
    + `${game.release?.generation}.${game.release?.build}`
  );
  registerSettings();
  registerMenuHook();
});
