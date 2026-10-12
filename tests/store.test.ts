import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import {
  EMPTY_REPO, normalizeRepo, loadRepo, persistRepo,
  addTask, setTaskDone, renameTask, removeTask, archiveTask, archiveAllDone,
  restoreArchived, removeArchived, addGroup, renameGroup, removeGroup,
  visibleTasks, visibleArchived, trimArchive, moveTask,
} from '../src/shared/store.ts';

const opts = (over = {}) => ({ autoArchive: false, archiveLimit: 100, ...over });

test('normalizeRepo: garbage -> empty repo', () => {
  assert.deepEqual(normalizeRepo(undefined), EMPTY_REPO);
  assert.deepEqual(normalizeRepo('x'), EMPTY_REPO);
  assert.deepEqual(normalizeRepo({ version: 1 }), EMPTY_REPO);
});
test('normalizeRepo: drops malformed entries and coerces fields', () => {
  const r = normalizeRepo({
    version: 1,
    groups: [{ id: 'g1', name: 'Work', createdAt: 1 }, { id: 2 }, null],
    tasks: [
      { id: 't1', title: 'a', done: false, gid: 'g1', createdAt: 2, completedAt: null },
      { id: 't2', title: 5, done: 'maybe', gid: 'ghost', createdAt: 'x', completedAt: 3 },
      null,
    ],
    archived: [{ id: 'a1', title: 'old', gid: 'g1', groupName: 'Work', archivedAt: 9 }],
  });
  assert.equal(r.groups.length, 1);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].gid, 'g1');
  assert.equal(r.archived.length, 1);
});
test('addTask respects activeLimit', () => {
  const repo = normalizeRepo(undefined);
  assert.equal(addTask(repo, { title: 'a', gid: null }, 1).ok, true);
  const second = addTask(repo, { title: 'b', gid: null }, 1);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'limit');
  assert.equal(repo.tasks.length, 1);
});
test('addTask trims title and rejects blank', () => {
  const repo = normalizeRepo(undefined);
  assert.equal(addTask(repo, { title: '   ', gid: null }, 50).ok, false);
  const r = addTask(repo, { title: '  hi ', gid: null }, 50);
  assert.equal(r.ok && r.task.title, 'hi');
});
test('setTaskDone toggles and completes timestamp; reopen clears it', () => {
  const repo = normalizeRepo(undefined);
  addTask(repo, { title: 'a', gid: null }, 50);
  const id = repo.tasks[0].id;
  setTaskDone(repo, id, true, opts());
  assert.equal(repo.tasks[0].done, true);
  assert.ok(typeof repo.tasks[0].completedAt === 'number');
  setTaskDone(repo, id, false, opts());
  assert.equal(repo.tasks[0].done, false);
  assert.equal(repo.tasks[0].completedAt, null);
});
test('autoArchive=true moves task directly to archive with group snapshot', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  assert.ok(g);
  addTask(repo, { title: 'a', gid: g.id }, 50);
  setTaskDone(repo, repo.tasks[0].id, true, opts({ autoArchive: true }));
  assert.equal(repo.tasks.length, 0);
  assert.equal(repo.archived.length, 1);
  assert.equal(repo.archived[0].groupName, 'Work');
  assert.equal(repo.archived[0].gid, g.id);
});
test('archive snapshot survives group rename and deletion', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  assert.ok(g);
  addTask(repo, { title: 'a', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100);
  renameGroup(repo, g.id, 'Job');
  assert.equal(repo.archived[0].groupName, 'Work');
  removeGroup(repo, g.id);
  assert.equal(repo.archived.length, 1);
  assert.equal(repo.archived[0].groupName, 'Work');
  assert.equal(repo.archived[0].gid, g.id);
  assert.equal(repo.tasks.filter(t => t.gid === g.id).length, 0);
});
test('archive limit trims OLDEST, newest kept', () => {
  const repo = normalizeRepo(undefined);
  for (let i = 0; i < 5; i++) {
    addTask(repo, { title: `t${i}`, gid: null }, 50);
    archiveTask(repo, repo.tasks[0].id, 100);
  }
  const n = trimArchive(repo, 3);
  assert.equal(n, 2);
  assert.equal(repo.archived.length, 3);
  assert.deepEqual(repo.archived.map(a => a.title), ['t4', 't3', 't2']);
});
test('archiving beyond limit in one call trims immediately', () => {
  const repo = normalizeRepo(undefined);
  for (let i = 0; i < 5; i++) addTask(repo, { title: `t${i}`, gid: null }, 50);
  const count = archiveAllDone(repo, 3); // none done yet -> 0
  assert.equal(count, 0);
  repo.tasks.forEach(t => setTaskDone(repo, t.id, true, opts()));
  const archivedCount = archiveAllDone(repo, 3);
  assert.equal(archivedCount, 5);
  assert.equal(repo.archived.length, 3);
  assert.deepEqual(repo.archived.map(a => a.title), ['t4', 't3', 't2']);
});
test('restoreArchived: existing group reuses it; missing group -> null', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  assert.ok(g);
  addTask(repo, { title: 'a', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100);
  restoreArchived(repo, repo.archived[0].id);
  assert.equal(repo.archived.length, 0);
  assert.equal(repo.tasks[0].gid, g.id);
  assert.equal(repo.tasks[0].done, false);
  // now the orphan case
  addTask(repo, { title: 'b', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100); // tasks[0] is 'b'
  removeGroup(repo, g.id);
  restoreArchived(repo, repo.archived[0].id);
  assert.equal(repo.tasks.find(t => t.title === 'b')?.gid, null);
});
test('group CRUD and removeGroup nullifies active tasks only', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'G');
  assert.ok(g);
  addTask(repo, { title: 'a', gid: g.id }, 50);
  addGroup(repo, '  '); // blank name rejected, still returns group? -> assert no extra group
  assert.equal(repo.groups.length, 1);
  renameGroup(repo, g.id, '  G2 ');
  assert.equal(repo.groups[0].name, 'G2');
  removeGroup(repo, g.id);
  assert.equal(repo.groups.length, 0);
  assert.equal(repo.tasks[0].gid, null);
});
test('visibleTasks 按 order 升序：新任务在末尾，完成的沉到已完成区', () => {
  const repo = normalizeRepo(undefined);
  addTask(repo, { title: 'first', gid: null }, 50);
  addTask(repo, { title: 'second', gid: null }, 50);
  setTaskDone(repo, repo.tasks[0].id, true, opts());
  const { undone, done } = visibleTasks(repo, 'all');
  assert.equal(undone[0].title, 'second');
  assert.equal(done[0].title, 'first');
});
test('visibleTasks filters by group', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'G');
  assert.ok(g);
  addTask(repo, { title: 'a', gid: g.id }, 50);
  addTask(repo, { title: 'b', gid: null }, 50);
  assert.equal(visibleTasks(repo, g.id).undone.length, 1);
  assert.equal(visibleTasks(repo, 'all').undone.length, 2);
});
test('visibleArchived ignores display limit, matches title and group snapshot', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  assert.ok(g);
  for (let i = 0; i < 12; i++) addTask(repo, { title: `item ${i}`, gid: i % 2 ? g.id : null }, 50);
  while (repo.tasks.length) archiveTask(repo, repo.tasks[0].id, 100);
  assert.equal(visibleArchived(repo, '', 10).length, 10);
  assert.equal(visibleArchived(repo, 'item', 10).length, 12);
  assert.ok(visibleArchived(repo, 'Work', 10).length >= 6);
  assert.equal(visibleArchived(repo, 'zzz', 10).length, 0);
});
test('rename/remove no-ops on missing ids do not throw', () => {
  const repo = normalizeRepo(undefined);
  renameTask(repo, 'nope', 'x');
  removeTask(repo, 'nope');
  archiveTask(repo, 'nope', 100);
  restoreArchived(repo, 'nope');
  removeArchived(repo, 'nope');
  renameGroup(repo, 'nope', 'x');
  removeGroup(repo, 'nope');
  assert.ok(true);
});
test('normalizeRepo: 旧数据缺 order 时按旧版视觉顺序回落', () => {
  const r = normalizeRepo({
    version: 1,
    tasks: [
      { id: 't1', title: 'old', done: false, gid: null, createdAt: 10, completedAt: null },
      { id: 't2', title: 'new', done: false, gid: null, createdAt: 20, completedAt: null },
      { id: 't3', title: 'done-early', done: true, gid: null, createdAt: 30, completedAt: 100 },
      { id: 't4', title: 'done-late', done: true, gid: null, createdAt: 40, completedAt: 200 },
    ],
  });
  assert.deepEqual(visibleTasks(r, 'all').undone.map(t => t.title), ['old', 'new']);
  // 旧版已完成区是「最新完成的在最上面」
  assert.deepEqual(visibleTasks(r, 'all').done.map(t => t.title), ['done-late', 'done-early']);
});

test('完成排到已完成最前，取消完成回到待办末尾', () => {
  const repo = normalizeRepo(undefined);
  ['a', 'b', 'c'].forEach(t => addTask(repo, { title: t, gid: null }, 50));
  const id = (title: string): string => {
    const t = repo.tasks.find(x => x.title === title);
    assert.ok(t, title);
    return t.id;
  };
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['a', 'b', 'c']);
  setTaskDone(repo, id('a'), true, opts());
  setTaskDone(repo, id('c'), true, opts());
  assert.deepEqual(visibleTasks(repo, 'all').done.map(t => t.title), ['c', 'a']);
  setTaskDone(repo, id('a'), false, opts());
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['b', 'a']);
});

test('moveTask 同列表内重排并重新编号；跨列表/无效目标不动', () => {
  const repo = normalizeRepo(undefined);
  ['a', 'b', 'c'].forEach(t => addTask(repo, { title: t, gid: null }, 50));
  const id = (title: string): string => {
    const t = repo.tasks.find(x => x.title === title);
    assert.ok(t, title);
    return t.id;
  };
  // c 拖到 a 前面
  assert.equal(moveTask(repo, id('c'), id('a')), true);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['c', 'a', 'b']);
  assert.deepEqual(repo.tasks.filter(t => !t.done).map(t => t.order).sort((x, y) => x - y), [0, 1, 2]);
  // 拖到末尾（beforeId = null）
  assert.equal(moveTask(repo, id('c'), null), true);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['a', 'b', 'c']);
  // 已完成列表内部独立重排
  setTaskDone(repo, id('a'), true, opts());
  setTaskDone(repo, id('b'), true, opts());
  assert.deepEqual(visibleTasks(repo, 'all').done.map(t => t.title), ['b', 'a']);
  assert.equal(moveTask(repo, id('a'), id('b')), true);
  assert.deepEqual(visibleTasks(repo, 'all').done.map(t => t.title), ['a', 'b']);
  // 跨列表、目标不存在、任务不存在 → 一律不动
  assert.equal(moveTask(repo, id('c'), id('a')), false);
  assert.equal(moveTask(repo, id('c'), 'nope'), false);
  assert.equal(moveTask(repo, 'nope', null), false);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['c']);
});

test('moveTask 在分组筛选下只改可见相对顺序，隐藏任务顺序不变', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'G');
  assert.ok(g);
  // 交错插入：a(G) b(未分组) c(G) d(未分组)
  addTask(repo, { title: 'a', gid: g.id }, 50);
  addTask(repo, { title: 'b', gid: null }, 50);
  addTask(repo, { title: 'c', gid: g.id }, 50);
  addTask(repo, { title: 'd', gid: null }, 50);
  const id = (title: string): string => {
    const t = repo.tasks.find(x => x.title === title);
    assert.ok(t, title);
    return t.id;
  };
  moveTask(repo, id('c'), id('a'));
  assert.deepEqual(visibleTasks(repo, g.id).undone.map(t => t.title), ['c', 'a']);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['c', 'a', 'b', 'd']);
});

test('newTaskPosition：first 插到最前，last 追加到末尾；恢复归档同样跟随', () => {
  const repo = normalizeRepo(undefined);
  const id = (title: string): string => {
    const t = repo.tasks.find(x => x.title === title);
    assert.ok(t, title);
    return t.id;
  };
  addTask(repo, { title: 'a', gid: null }, 50);
  addTask(repo, { title: 'b', gid: null }, 50);
  addTask(repo, { title: 'top', gid: null, position: 'first' }, 50);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['top', 'a', 'b']);
  addTask(repo, { title: 'bottom', gid: null, position: 'last' }, 50);
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['top', 'a', 'b', 'bottom']);

  archiveTask(repo, id('a'), 100);
  restoreArchived(repo, repo.archived[0].id, 'first');
  assert.deepEqual(visibleTasks(repo, 'all').undone.map(t => t.title), ['a', 'top', 'b', 'bottom']);
});

test('storage roundtrip', async () => {
  installChromeStub();
  const repo = normalizeRepo(undefined);
  addGroup(repo, 'Work');
  addTask(repo, { title: 'persisted', gid: repo.groups[0].id }, 50);
  await persistRepo(repo);
  const again = await loadRepo();
  assert.equal(again.groups[0].name, 'Work');
  assert.equal(again.tasks[0].title, 'persisted');
});
