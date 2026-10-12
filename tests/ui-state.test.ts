import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import {
  DEFAULT_UI_STATE, normalizeUiState, reconcileUiState, loadUiState, saveUiState,
} from '../src/shared/ui-state.ts';

test('normalizeUiState: 脏数据回落默认值', () => {
  assert.deepEqual(normalizeUiState(undefined), DEFAULT_UI_STATE);
  assert.deepEqual(normalizeUiState('x'), DEFAULT_UI_STATE);
  assert.deepEqual(normalizeUiState({ currentGroup: '', newTaskGroup: 5 }), DEFAULT_UI_STATE);
});

test('normalizeUiState: 正常值原样保留', () => {
  assert.deepEqual(
    normalizeUiState({ currentGroup: 'g1', newTaskGroup: 'g2', archiveOpen: true }),
    { currentGroup: 'g1', newTaskGroup: 'g2', archiveOpen: true }
  );
  // 归档折叠态只认布尔值
  assert.equal(normalizeUiState({ archiveOpen: 'yes' }).archiveOpen, false);
});

test('reconcileUiState: 分组被删后回落到 all / 未分组，折叠态不受影响', () => {
  assert.deepEqual(
    reconcileUiState({ currentGroup: 'g1', newTaskGroup: 'g2', archiveOpen: true }, ['g1']),
    { currentGroup: 'g1', newTaskGroup: '', archiveOpen: true }
  );
  assert.deepEqual(reconcileUiState({ currentGroup: 'gone', newTaskGroup: 'gone', archiveOpen: false }, []), DEFAULT_UI_STATE);
  assert.deepEqual(reconcileUiState({ currentGroup: 'all', newTaskGroup: '', archiveOpen: false }, []), DEFAULT_UI_STATE);
});

test('load/save roundtrip（两次保存互不覆盖）', async () => {
  installChromeStub();
  assert.deepEqual(await loadUiState(), DEFAULT_UI_STATE);
  await saveUiState({ currentGroup: 'g1' });
  await saveUiState({ newTaskGroup: 'g2' });
  await saveUiState({ archiveOpen: true });
  assert.deepEqual(await loadUiState(), { currentGroup: 'g1', newTaskGroup: 'g2', archiveOpen: true });
});
