import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  normalizeSettings,
  loadSettings,
  saveSettings,
  watchSettings,
} from '../src/shared/settings.ts';

test('normalizeSettings: undefined -> defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
});

test('normalizeSettings: null/garbage -> defaults', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('x'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(42), DEFAULT_SETTINGS);
});

test('normalizeSettings: partial merge + invalid enum/boolean fall back', () => {
  const out = normalizeSettings({
    theme: 'dark',
    locale: 'en',
    autoArchive: 'yes',
    newtabOverride: false,
    newTaskPosition: 'top',
    archiveVisible: 0,
    activeLimit: 99999,
    archiveLimit: 1,
  });
  assert.equal(out.theme, 'dark');
  assert.equal(out.locale, 'en');
  assert.equal(out.autoArchive, DEFAULT_SETTINGS.autoArchive);
  assert.equal(out.newtabOverride, false);
  assert.equal(out.newTaskPosition, DEFAULT_SETTINGS.newTaskPosition);
  assert.equal(out.archiveVisible, LIMITS.archiveVisible.min);
  assert.equal(out.activeLimit, LIMITS.activeLimit.max);
  assert.equal(out.archiveLimit, LIMITS.archiveLimit.min);
});

test('normalizeSettings: newTaskPosition 只接受 first/last', () => {
  assert.equal(normalizeSettings({ newTaskPosition: 'first' }).newTaskPosition, 'first');
  assert.equal(normalizeSettings({ newTaskPosition: 'last' }).newTaskPosition, 'last');
});

test('normalizeSettings: 护眼模式在主题白名单内', () => {
  assert.equal(normalizeSettings({ theme: 'eyecare' }).theme, 'eyecare');
  assert.equal(normalizeSettings({ theme: 'sepia' }).theme, DEFAULT_SETTINGS.theme);
});

test('normalizeSettings: unknown keys are dropped', () => {
  const out = normalizeSettings({ evil: 1, theme: 'soft' }) as unknown as Record<string, unknown>;
  assert.equal('evil' in out, false);
  assert.equal(out.theme, 'soft');
});

test('load/save roundtrip and default values', async () => {
  installChromeStub();
  assert.deepEqual(await loadSettings(), DEFAULT_SETTINGS);
  const s = await saveSettings({ autoArchive: true, archiveVisible: 25 });
  assert.equal(s.autoArchive, true);
  assert.equal(s.archiveVisible, 25);
  assert.equal((await loadSettings()).archiveVisible, 25);
});

test('save clamps before persist', async () => {
  installChromeStub();
  const s = await saveSettings({ activeLimit: -5 });
  assert.equal(s.activeLimit, LIMITS.activeLimit.min);
});

test('watchSettings fires on local change and unsub works', async () => {
  const stub = installChromeStub();
  const seen: unknown[] = [];
  const off = watchSettings((s) => seen.push(s));
  await saveSettings({ theme: 'dark' });
  assert.equal(seen.length, 1);
  assert.equal((seen[0] as { theme: string }).theme, 'dark');
  off();
  await saveSettings({ theme: 'soft' });
  assert.equal(seen.length, 1);
  void stub;
});
