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
