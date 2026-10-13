import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import { t, setLocale, getResolvedLocale } from '../src/shared/i18n.ts';
import zh from '../_locales/zh_CN/messages.json';
import en from '../_locales/en/messages.json';

test('default (auto, no chrome.i18n) falls back to zh_CN', () => {
  installChromeStub();
  setLocale('auto');
  assert.equal(t('appTitle'), '我的待办');
  assert.equal(getResolvedLocale(), 'zh_CN');
});
test('manual en works', () => {
  installChromeStub();
  setLocale('en');
  assert.equal(t('appTitle'), 'My Tasks');
});
test('$1 substitution', () => {
  installChromeStub();
  setLocale('zh_CN');
  assert.equal(t('doneDivider', ['3']), '已完成 3');
});
test('missing key in en falls back to zh then key itself', () => {
  installChromeStub();
  setLocale('en');
  assert.equal(t('__only_in_zh__'), '__only_in_zh__');
});
test('auto follows chrome.i18n.getUILanguage when en', () => {
  const stub = installChromeStub();
  (globalThis as { chrome: typeof chrome }).chrome.i18n = { getUILanguage: () => 'en-US' } as typeof chrome.i18n;
  setLocale('auto');
  assert.equal(getResolvedLocale(), 'en');
  assert.equal(t('appTitle'), 'My Tasks');
  void stub;
});
test('locale key sets are equal', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});

test('extName / extDescription 在商店限制内，且都含 todo 关键词', () => {
  // Chrome 硬性限制：name <= 75 字符、description <= 132 字符（超了扩展会加载失败）。
  // 商店没有独立的关键词字段，能被搜到的就是这两段文本，所以两边都要显式带上 todo。
  for (const [locale, table] of [['zh_CN', zh], ['en', en]] as const) {
    const extName = table.extName.message;
    const extDesc = table.extDescription.message;
    assert.ok(extName.length <= 75, `${locale} extName 超长：${extName.length}`);
    assert.ok(extDesc.length <= 132, `${locale} extDescription 超长：${extDesc.length}`);
    assert.match(extName.toLowerCase(), /todo/, `${locale} extName 缺 todo 关键词`);
    assert.match(extDesc.toLowerCase(), /todo/, `${locale} extDescription 缺 todo 关键词`);
  }
});
