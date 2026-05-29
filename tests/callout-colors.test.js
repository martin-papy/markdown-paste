import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CALLOUT_TYPES } from '../scripts/obsidian.js';
import {
  DEFAULT_CALLOUT_COLORS,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_COLORS,
  isValidHexColor,
  buildCalloutColorCss,
  applyCalloutColors,
} from '../scripts/callout-colors.js';

test('DEFAULT_COLORS combines the 13 callouts plus a valid highlight color', () => {
  assert.equal(Object.keys(DEFAULT_COLORS).length, 14);
  assert.ok(isValidHexColor(DEFAULT_HIGHLIGHT_COLOR));
  assert.equal(DEFAULT_COLORS.highlight, DEFAULT_HIGHLIGHT_COLOR);
});

test('buildCalloutColorCss emits --md-highlight-bg, validated with default fallback', () => {
  assert.ok(buildCalloutColorCss(DEFAULT_COLORS).includes(`--md-highlight-bg:${DEFAULT_HIGHLIGHT_COLOR};`));
  assert.ok(buildCalloutColorCss({}).includes(`--md-highlight-bg:${DEFAULT_HIGHLIGHT_COLOR};`));
  assert.ok(buildCalloutColorCss({ highlight: '#abcdef' }).includes('--md-highlight-bg:#abcdef;'));
  assert.ok(buildCalloutColorCss({ highlight: 'evil; }body{x' }).includes(`--md-highlight-bg:${DEFAULT_HIGHLIGHT_COLOR};`));
});

test('DEFAULT_CALLOUT_COLORS has a valid hex value for all 13 callout types', () => {
  assert.equal(Object.keys(DEFAULT_CALLOUT_COLORS).length, 13);
  for (const type of CALLOUT_TYPES) {
    assert.ok(isValidHexColor(DEFAULT_CALLOUT_COLORS[type]), `missing/invalid: ${type}`);
  }
});

test('isValidHexColor accepts #rgb and #rrggbb in any case', () => {
  assert.ok(isValidHexColor('#abc'));
  assert.ok(isValidHexColor('#AABBCC'));
  assert.ok(isValidHexColor('#ff9800'));
});

test('isValidHexColor rejects non-hex, wrong length, and injection attempts', () => {
  assert.equal(isValidHexColor(''), false);
  assert.equal(isValidHexColor('red'), false);
  assert.equal(isValidHexColor('#gggggg'), false);
  assert.equal(isValidHexColor('#12'), false);
  assert.equal(isValidHexColor('#fff;}body{display:none'), false);
  assert.equal(isValidHexColor(123), false);
  assert.equal(isValidHexColor(null), false);
  assert.equal(isValidHexColor(undefined), false);
});

test('buildCalloutColorCss emits a --md-callout-<type> declaration for all 13 types', () => {
  const css = buildCalloutColorCss(DEFAULT_CALLOUT_COLORS);
  assert.ok(css.startsWith(':root{'));
  assert.ok(css.endsWith('}'));
  for (const type of CALLOUT_TYPES) {
    assert.ok(css.includes(`--md-callout-${type}:${DEFAULT_CALLOUT_COLORS[type]};`), type);
  }
});

test('buildCalloutColorCss substitutes the default for invalid or missing values', () => {
  const css = buildCalloutColorCss({ warning: 'red; } body {}', note: undefined });
  assert.ok(css.includes(`--md-callout-warning:${DEFAULT_CALLOUT_COLORS.warning};`));
  assert.ok(css.includes(`--md-callout-note:${DEFAULT_CALLOUT_COLORS.note};`));
  assert.equal(css.includes('body'), false);
});

test('applyCalloutColors injects exactly one <style> and updates it on re-call', () => {
  const { document } = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>').window;

  applyCalloutColors({ ...DEFAULT_CALLOUT_COLORS, warning: '#000000' }, document);
  let styles = document.querySelectorAll('#markdown-paste-callout-colors');
  assert.equal(styles.length, 1);
  assert.ok(styles[0].textContent.includes('--md-callout-warning:#000000;'));

  applyCalloutColors({ ...DEFAULT_CALLOUT_COLORS, warning: '#ffffff' }, document);
  styles = document.querySelectorAll('#markdown-paste-callout-colors');
  assert.equal(styles.length, 1, 're-call must update, not duplicate');
  assert.ok(styles[0].textContent.includes('--md-callout-warning:#ffffff;'));
});
