import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNativeNewtabUrl, shouldTakeOverNewtab } from '../src/shared/newtab-url.ts';

test('识别各家浏览器原生新标签页地址', () => {
  const native = [
    'chrome://newtab/',
    'chrome://newtab',
    'chrome://newtab/?x=1',
    'edge://newtab/',
    'brave://newtab/',
    'chrome://startpage/',
    'about:newtab',
    'about:newtab#top',
    'about:home',
  ];
  for (const url of native) assert.equal(isNativeNewtabUrl(url), true, url);
});

test('普通页面与扩展页不算原生新标签页', () => {
  const other = [
    'about:blank',
    'chrome://extensions/',
    'chrome://settings/',
    'https://example.com/newtab',
    'chrome-extension://abcdefghijklmnop/build/newtab.html',
    '',
    null,
    undefined,
  ];
  for (const url of other) assert.equal(isNativeNewtabUrl(url), false, String(url));
});

test('接管开关关闭时不做任何重定向', () => {
  assert.equal(shouldTakeOverNewtab('chrome://newtab/', true), true);
  assert.equal(shouldTakeOverNewtab('chrome://newtab/', false), false);
  assert.equal(shouldTakeOverNewtab('https://example.com', true), false);
});
