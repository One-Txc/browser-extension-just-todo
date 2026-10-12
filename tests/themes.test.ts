import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, THEME_OPTIONS } from '../src/shared/themes.ts';
import css from '../src/app/app.css';

test('explicit theme passes through', () => {
  assert.equal(resolveTheme('soft', true), 'soft');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('minimal', true), 'minimal');
  // 护眼模式是浅色系的固定主题，不跟系统深浅色走
  assert.equal(resolveTheme('eyecare', true), 'eyecare');
  assert.equal(resolveTheme('eyecare', false), 'eyecare');
});
test('auto maps to dark/soft by system preference', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'soft');
});

test('每套主题都定义了同一组 CSS 变量（漏一个就会串到别的主题的色）', () => {
  const blocks = new Map<string, string[]>();
  for (const m of css.matchAll(/:root\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g)) {
    blocks.set(
      m[1],
      [...m[2].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]).sort()
    );
  }
  const ids = THEME_OPTIONS.filter((o) => o.id !== 'auto').map((o) => o.id);
  const base = blocks.get('soft');
  assert.ok(base, 'app.css 里找不到 soft 主题变量块');
  assert.ok(base.length > 40, `soft 变量太少（${base.length}），正则可能没抓对`);
  for (const id of ids) {
    assert.deepEqual(blocks.get(id), base, `:root[data-theme="${id}"] 的变量集合与 soft 不一致`);
  }
});
