import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom.ts';
import { installChromeStub } from './helpers/chrome.ts';
import { mountApp } from '../src/app/mount.ts';
import { openGroupModal } from '../src/app/components/group-modal.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  setupDom();
  installChromeStub();
  const root = document.querySelector('#root') as HTMLElement;
  const ctx = await mountApp(root);
  return ctx;
}

function enter(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

test('add task via Enter appears in list and persists', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, '写周报');
  await tick();
  assert.match(ctx.root.textContent ?? '', /写周报/);
  const { loadRepo } = await import('../src/shared/store.ts');
  assert.equal((await loadRepo()).tasks[0].title, '写周报');
});

test('completing a task sinks it under divider and shows count', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, 'a');
  await tick();
  enter(input, 'b');
  await tick();
  (ctx.root.querySelectorAll('.task .check')[0] as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task.done').length, 1);
  assert.match(ctx.root.querySelector('.done-divider')?.textContent ?? '', /1/);
});

test('active limit blocks adding and shows limit message', async () => {
  const ctx = await boot();
  await ctx.changeSettings({ activeLimit: 20 });
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  for (let i = 0; i < 20; i++) {
    enter(input, `t${i}`);
    await tick();
  }
  assert.equal(ctx.root.querySelectorAll('.task').length, 20);
  enter(input, 'overflow');
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task').length, 20);
  assert.match(ctx.root.textContent ?? '', /上限|Limit/);
});

test('double-click title edits and Enter renames', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, 'orig');
  await tick();
  const titleEl = ctx.root.querySelector('.task:not(.done) .title') as HTMLElement;
  titleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const edit = ctx.root.querySelector('.task input') as HTMLInputElement;
  assert.ok(edit);
  enter(edit, 'renamed');
  await tick();
  assert.match(ctx.root.textContent ?? '', /renamed/);
});

test('reopen returns a completed task to the active list', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, 'r');
  await tick();
  (ctx.root.querySelectorAll('.task .check')[0] as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task.done').length, 1);
  (ctx.root.querySelector('.task.done [data-act="reopen"]') as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task.done').length, 0);
  assert.equal(ctx.root.querySelectorAll('.task:not(.done)').length, 1);
});

test('group modal: add group appears as tab; delete nullifies active task group', async () => {
  const ctx = await boot();
  openGroupModal();
  const ng = ctx.root.querySelector('#newGroup') as HTMLInputElement;
  ng.value = '生活';
  ng.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  assert.match(ctx.root.textContent ?? '', /生活/);

  const pick = ctx.root.querySelector('#groupSelect') as HTMLSelectElement;
  pick.value = ctx.repo.groups[0].id;
  pick.dispatchEvent(new Event('change', { bubbles: true }));
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, '买菜');
  await tick();

  (ctx.root.querySelector('.g-del') as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.repo.tasks[0].gid, null);
  assert.equal(ctx.newGroupChoice, '');
});

test('archive button moves task to archive list; restore returns it', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  enter(input, 'x');
  await tick();
  (ctx.root.querySelectorAll('.task .check')[0] as HTMLButtonElement).click();
  await tick();
  (ctx.root.querySelector('.task.done [data-act="archive"]') as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task').length, 0);
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 1);
  (ctx.root.querySelector('.a-item [data-act="restore"]') as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.root.querySelectorAll('.task:not(.done)').length, 1);
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 0);
});

test('archive search covers beyond visible limit and matches group snapshot', async () => {
  const ctx = await boot();
  await ctx.changeSettings({ archiveVisible: 5 });
  openGroupModal();
  const ng = ctx.root.querySelector('#newGroup') as HTMLInputElement;
  ng.value = 'Work';
  ng.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  const pick = ctx.root.querySelector('#groupSelect') as HTMLSelectElement;
  pick.value = ctx.repo.groups[0].id;
  pick.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 7; i++) {
    const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
    enter(input, `task-${i}`);
    await tick();
  }
  const { archiveAllDone, persistRepo } = await import('../src/shared/store.ts');
  ctx.repo.tasks.forEach((tk) => {
    tk.done = true;
    tk.completedAt = Date.now();
  });
  archiveAllDone(ctx.repo, 100);
  await persistRepo(ctx.repo);
  ctx.render();
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 5);

  const search = ctx.root.querySelector('#search') as HTMLInputElement;
  search.value = 'task';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 7);
  assert.match(ctx.root.querySelector('.a-item .g-tag')?.textContent ?? '', /Work/);
});

test('settings: switching theme sets data-theme; language re-renders text; number clamps', async () => {
  const ctx = await boot();
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();
  const theme = ctx.root.querySelector('#setTheme') as HTMLSelectElement;
  theme.value = 'dark';
  theme.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await tick();
  assert.equal(document.documentElement.dataset.theme, 'dark');

  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();
  const loc = ctx.root.querySelector('#setLocale') as HTMLSelectElement;
  loc.value = 'en';
  loc.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await tick();
  assert.match(ctx.root.querySelector('.brand')?.textContent ?? '', /My Tasks/);

  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();
  const vis = ctx.root.querySelector('#setArchiveVisible') as HTMLInputElement;
  vis.value = '99999';
  vis.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.settings.archiveVisible, 100);
});

test('拖拽任务行调整待办顺序并持久化；跨列表拖拽无效', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  for (const title of ['a', 'b', 'c']) {
    enter(input, title);
    await tick();
  }
  const rows = [...ctx.root.querySelectorAll<HTMLElement>('.task:not(.done)')];
  // 只有手柄可拖：整行可拖会抢掉标题的文字选择
  assert.equal(rows[0].getAttribute('draggable'), null);
  assert.ok(rows[0].querySelector('.grip'));
  assert.equal(rows[0].querySelector('.grip')?.getAttribute('draggable'), 'true');

  // jsdom 没有 DragEvent/DataTransfer，手工造一个带 dataTransfer 的普通事件
  const drag = (type: string, target: HTMLElement): void => {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    ev.dataTransfer = {
      effectAllowed: '', dropEffect: '', setData: () => undefined, setDragImage: () => undefined,
    };
    Object.defineProperty(ev, 'clientY', { value: 0 }); // 0 落在行的上半部分 → 插到该行之前
    target.dispatchEvent(ev);
  };
  const titles = () => [...ctx.root.querySelectorAll('.task:not(.done) .title')].map((el) => el.textContent);
  const persisted = async (): Promise<string[]> => {
    const { loadRepo, visibleTasks } = await import('../src/shared/store.ts');
    return visibleTasks(await loadRepo(), 'all').undone.map((t) => t.title);
  };

  drag('dragstart', rows[2]);
  drag('dragover', rows[0]);
  drag('drop', rows[0]);
  await tick();
  assert.deepEqual(titles(), ['c', 'a', 'b']);
  assert.deepEqual(await persisted(), ['c', 'a', 'b']);

  // 完成一个任务，再把它拖到待办行上：跨列表应被拒绝
  (ctx.root.querySelector('.task:not(.done) .check') as HTMLButtonElement).click();
  await tick();
  const doneRow = ctx.root.querySelector('.task.done') as HTMLElement;
  const undoneRow = ctx.root.querySelector('.task:not(.done)') as HTMLElement;
  drag('dragstart', doneRow);
  drag('dragover', undoneRow);
  drag('drop', undoneRow);
  await tick();
  assert.deepEqual(titles(), ['a', 'b']);
  assert.equal(ctx.root.querySelectorAll('.task.done').length, 1);
});

test('设置项改动即时保存，不需要点按钮', async () => {
  const ctx = await boot();
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();

  const auto = ctx.root.querySelector('#setAutoArchive') as HTMLInputElement;
  auto.checked = true;
  auto.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(ctx.settings.autoArchive, true);
  const { loadSettings } = await import('../src/shared/settings.ts');
  assert.equal((await loadSettings()).autoArchive, true);
  // 按钮只负责关闭，弹层仍开着
  assert.ok((ctx.root.querySelector('#settingsMask') as HTMLElement).classList.contains('show'));

  // 数字框在 change（失焦/回车）时保存，且越界值被 clamp 后回填到表单
  const vis = ctx.root.querySelector('#setArchiveVisible') as HTMLInputElement;
  vis.value = '33';
  vis.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(ctx.settings.archiveVisible, 33);
  assert.equal((ctx.root.querySelector('#setArchiveVisible') as HTMLInputElement).value, '33');
});

test('归档上限：调小不当场裁剪，刷新页面后才生效', async () => {
  const ctx = await boot();
  await ctx.changeSettings({ archiveLimit: 60 });
  const { addTask, archiveTask, persistRepo } = await import('../src/shared/store.ts');
  for (let i = 0; i < 60; i++) addTask(ctx.repo, { title: `a${i}`, gid: null }, 1000);
  while (ctx.repo.tasks.length) archiveTask(ctx.repo, ctx.repo.tasks[0].id, 60);
  await persistRepo(ctx.repo);
  assert.equal(ctx.repo.archived.length, 60);

  // 设置里调小到 50：值存下来了，但一条归档都不删
  await ctx.changeSettings({ archiveLimit: 50 });
  assert.equal(ctx.settings.archiveLimit, 50);
  assert.equal(ctx.repo.archived.length, 60);

  // 模拟刷新页面：重新挂载，加载时按新上限裁剪
  const reloaded = await mountApp(ctx.root);
  assert.equal(reloaded.repo.archived.length, 50);
});

test('待办上限：立即生效但不裁剪已有任务，只在新增时拦', async () => {
  const ctx = await boot();
  const { addTask, persistRepo } = await import('../src/shared/store.ts');
  for (let i = 0; i < 25; i++) addTask(ctx.repo, { title: `t${i}`, gid: null }, 1000);
  await persistRepo(ctx.repo);

  // 上限降到 20（此时已有 25 条）：不删任务，列表照旧全显示
  await ctx.changeSettings({ activeLimit: 20 });
  assert.equal(ctx.repo.tasks.length, 25);
  assert.equal(ctx.root.querySelectorAll('.task').length, 25);

  // 只在新增加入时被拦
  assert.equal(addTask(ctx.repo, { title: 'overflow', gid: null }, ctx.settings.activeLimit).ok, false);
});

test('停留的分组 Tab 会被记住，下次进入仍停在这里', async () => {
  const ctx = await boot();
  const { addGroup, persistRepo } = await import('../src/shared/store.ts');
  const g = addGroup(ctx.repo, 'Work');
  assert.ok(g);
  await persistRepo(ctx.repo);
  ctx.render();

  (ctx.root.querySelector(`.tab[data-g="${g.id}"]`) as HTMLButtonElement).click();
  await tick();
  assert.equal(ctx.currentGroup, g.id);

  // 模拟刷新页面：仍停在那个分组 Tab
  const reloaded = await mountApp(ctx.root);
  assert.equal(reloaded.currentGroup, g.id);
  assert.equal(
    (reloaded.root.querySelector(`.tab[data-g="${g.id}"]`) as HTMLElement).classList.contains('active'),
    true
  );
});

test('「全部」标签下选中的新建分组会被记住', async () => {
  const ctx = await boot();
  const { addGroup, persistRepo } = await import('../src/shared/store.ts');
  const g = addGroup(ctx.repo, 'Life');
  assert.ok(g);
  await persistRepo(ctx.repo);
  ctx.render();

  const pick = ctx.root.querySelector('#groupSelect') as HTMLSelectElement;
  pick.value = g.id;
  pick.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert.equal(ctx.newGroupChoice, g.id);

  const reloaded = await mountApp(ctx.root);
  assert.equal(reloaded.newGroupChoice, g.id);
  assert.equal((reloaded.root.querySelector('#groupSelect') as HTMLSelectElement).value, g.id);
});

test('分组被删除后，界面状态回落（不会停在空 Tab）', async () => {
  const ctx = await boot();
  ctx.repo.groups.push({ id: 'g_gone', name: 'Gone', createdAt: 1 });
  await ctx.setCurrentGroup('g_gone');
  await ctx.setNewTaskGroup('g_gone');
  const { removeGroup, persistRepo } = await import('../src/shared/store.ts');
  removeGroup(ctx.repo, 'g_gone');
  if (ctx.currentGroup === 'g_gone') await ctx.setCurrentGroup('all');
  if (ctx.newGroupChoice === 'g_gone') await ctx.setNewTaskGroup('');
  await persistRepo(ctx.repo);

  const reloaded = await mountApp(ctx.root);
  assert.equal(reloaded.currentGroup, 'all');
  assert.equal(reloaded.newGroupChoice, '');
});

test('设置弹层分「基本/高级」两个 tab，默认基本、容量类在高级', async () => {
  const ctx = await boot();
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();

  const tabs = [...ctx.root.querySelectorAll<HTMLElement>('.modal-tab')];
  assert.deepEqual(tabs.map((b) => b.textContent), ['基本设置', '高级设置']);
  assert.equal(tabs[0].classList.contains('active'), true);

  const pane = (n: string) => ctx.root.querySelector(`.settings-pane[data-pane="${n}"]`) as HTMLElement;
  const inPane = (n: string, sel: string) => pane(n).querySelector(sel) !== null;
  for (const sel of ['#setArchiveVisible', '#setActiveLimit', '#setArchiveLimit']) {
    assert.equal(inPane('advanced', sel), true, `高级应含 ${sel}`);
    assert.equal(inPane('basic', sel), false, `基本不应含 ${sel}`);
  }
  for (const sel of ['#setTheme', '#setLocale', '#setNewTaskPosition', '#setAutoArchive', '#setNewtab']) {
    assert.equal(inPane('basic', sel), true, `基本应含 ${sel}`);
  }
  assert.equal(pane('basic').hidden, false);
  assert.equal(pane('advanced').hidden, true);

  // 切到高级
  tabs[1].click();
  assert.equal(tabs[1].classList.contains('active'), true);
  assert.equal(pane('basic').hidden, true);
  assert.equal(pane('advanced').hidden, false);

  // 关掉再打开 → 回到基本
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await tick();
  assert.equal(
    ([...ctx.root.querySelectorAll<HTMLElement>('.modal-tab')][0]).classList.contains('active'),
    true
  );
  assert.equal((ctx.root.querySelector('.settings-pane[data-pane="basic"]') as HTMLElement).hidden, false);
});

test('归档区默认折叠，点头部展开并记住状态', async () => {
  const ctx = await boot();
  const card = () => ctx.root.querySelector('#archiveCard') as HTMLElement;
  const head = () => ctx.root.querySelector('#archiveHead') as HTMLElement;
  assert.equal(card().classList.contains('collapsed'), true);
  assert.equal(head().getAttribute('aria-expanded'), 'false');

  head().click();
  await tick();
  assert.equal(card().classList.contains('collapsed'), false);
  assert.equal(head().getAttribute('aria-expanded'), 'true');

  // 点搜索框不应把它折起来
  (ctx.root.querySelector('#search') as HTMLInputElement).click();
  await tick();
  assert.equal(card().classList.contains('collapsed'), false);

  // 重新加载页面后仍是展开态
  const reloaded = await mountApp(ctx.root);
  assert.equal((reloaded.root.querySelector('#archiveCard') as HTMLElement).classList.contains('collapsed'), false);
});

test('切换分组 Tab 后光标落到新增输入框', async () => {
  const ctx = await boot();
  const { addGroup, persistRepo } = await import('../src/shared/store.ts');
  const g = addGroup(ctx.repo, 'Work');
  assert.ok(g);
  await persistRepo(ctx.repo);
  ctx.render();

  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  assert.equal(document.activeElement, input); // 进入页面本来就聚焦在这里
  input.blur();
  assert.notEqual(document.activeElement, input);

  (ctx.root.querySelector(`.tab[data-g="${g.id}"]`) as HTMLButtonElement).click();
  await tick();
  assert.equal(document.activeElement, input);
});

test('storage.onChanged refreshes another context but not while editing', async () => {
  setupDom();
  const stub = installChromeStub();
  const rootA = document.querySelector('#root') as HTMLElement;
  const a = await mountApp(rootA);

  const { addTask, persistRepo } = await import('../src/shared/store.ts');
  addTask(a.repo, { title: 'remote', gid: null }, 50);
  await persistRepo(a.repo);
  await tick();
  assert.match(a.root.textContent ?? '', /remote/);

  a.editing = true;
  addTask(a.repo, { title: 'remote2', gid: null }, 50);
  await persistRepo(a.repo);
  await tick();
  assert.doesNotMatch(a.root.textContent ?? '', /remote2/);
  assert.equal(stub.listeners.length > 0, true);
});
