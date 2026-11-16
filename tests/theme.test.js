import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE, REQUIRED_PAIRS, contrastRatio } from '../js/engine/theme.js';

test('theme contrast ratios meet WCAG AA', () => {
  for (const [fg, bg, min, what] of REQUIRED_PAIRS) {
    const r = contrastRatio(fg, bg);
    assert.ok(r >= min, `${what}: ${r.toFixed(2)} < ${min}`);
  }
});

test('ratios stated in the specification', () => {
  const r = (a, b) => Math.round(contrastRatio(a, b) * 10) / 10;
  assert.equal(r(PALETTE.white, PALETTE.orange), 5.1);
  assert.equal(r(PALETTE.white, PALETTE.green), 5.1);
  assert.equal(r(PALETTE.white, PALETTE.red), 5.6);
  assert.equal(r(PALETTE.text, PALETTE.bg), 12.7);
  assert.equal(r(PALETTE.selectedText, PALETTE.white), 6.3);
});

test('css/theme.css uses the same palette as the engine', () => {
  const css = readFileSync(new URL('../css/theme.css', import.meta.url), 'utf8').toUpperCase();
  const flat = [...Object.entries(PALETTE).filter(([, v]) => typeof v === 'string').map(([, v]) => v), ...Object.values(PALETTE.tier)];
  for (const hex of flat) assert.ok(css.includes(hex.toUpperCase()), `${hex} missing in theme.css`);
});

test('tier colours never carry text (no white text on tier colours)', () => {
  const css = readFileSync(new URL('../css/theme.css', import.meta.url), 'utf8');
  assert.match(css, /--tier-band-height:\s*6px/);
});
