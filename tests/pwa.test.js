import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('Service Worker caches every app file (offline after first visit)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const files = ['js', 'css', 'icons'].flatMap((d) => walk(join(root, d))).map((p) => `./${relative(root, p).split('\\').join('/')}`);
  files.push('./index.html', './manifest.webmanifest');
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `${f} missing from sw.js`);
});

test('manifest: relative paths, standalone, portrait, theme colour, icons 192 and 512', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.theme_color, '#2B2B30');
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  for (const i of m.icons) assert.ok(i.src.startsWith('./'));
});

test('no absolute paths and no remote resources in the app', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(src|href)="\/(?!\/)/);
  assert.doesNotMatch(html, /(src|href)="https?:/);
  for (const f of walk(join(root, 'js'))) {
    const code = readFileSync(f, 'utf8');
    assert.doesNotMatch(code, /from\s+['"]https?:/, f);
    assert.doesNotMatch(code, /fetch\(\s*['"]https?:/, f);
    assert.doesNotMatch(code, /localStorage/, `${f} must not use localStorage`);
  }
});
