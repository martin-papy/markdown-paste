import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalType, CALLOUT_TYPES } from '../scripts/obsidian.js';

test('canonicalType returns canonical types unchanged (case-insensitive)', () => {
  assert.equal(canonicalType('tip'), 'tip');
  assert.equal(canonicalType('NOTE'), 'note');
});

test('canonicalType resolves aliases to canonical', () => {
  assert.equal(canonicalType('summary'), 'abstract');
  assert.equal(canonicalType('hint'), 'tip');
  assert.equal(canonicalType('error'), 'danger');
  assert.equal(canonicalType('cite'), 'quote');
});

test('canonicalType returns null for unknown types', () => {
  assert.equal(canonicalType('frobnicate'), null);
});

test('CALLOUT_TYPES lists the 13 canonical types', () => {
  assert.equal(CALLOUT_TYPES.length, 13);
  assert.ok(CALLOUT_TYPES.includes('tip'));
});
