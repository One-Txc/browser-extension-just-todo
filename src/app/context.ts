import type { Repo } from '../shared/store.ts';
import type { TodoSettings } from '../shared/settings.ts';
import { loadRepo, persistRepo, hasRepoKey } from '../shared/store.ts';
import { buildSeedRepo } from '../shared/seed.ts';
import { setLocale, getResolvedLocale } from '../shared/i18n.ts';
import { loadSettings, saveSettings } from '../shared/settings.ts';
import { loadUiState, saveUiState, reconcileUiState } from '../shared/ui-state.ts';

export interface AppContext {
  root: HTMLElement;
  repo: Repo;
  settings: TodoSettings;
  currentGroup: 'all' | string;
  keyword: string;
  newGroupChoice: string;
  /** 归档区是否展开（默认折叠） */
  archiveOpen: boolean;
  /** 行内编辑中：跨标签页联动会跳过硬刷新，避免打断输入 */
  editing?: boolean;
  /** 弹层打开中：同上 */
  modalOpen?: boolean;
  reload(): Promise<void>;
  render(): void;
  mutate(fn: (repo: Repo) => void): Promise<void>;
  changeSettings(patch: Partial<TodoSettings>): Promise<void>;
  /** 切换分组 Tab：立即生效并记住位置（下次进入页面停在这里） */
  setCurrentGroup(gid: 'all' | string): Promise<void>;
  /** 「全部」标签下选中的新建分组：记住选择 */
  setNewTaskGroup(gid: string): Promise<void>;
  /** 展开/折叠归档区：记住状态 */
  setArchiveOpen(open: boolean): Promise<void>;
  toast(message: string): void;
}

const renderers: Array<(ctx: AppContext) => void> = [];
export function registerRenderer(fn: (ctx: AppContext) => void): void {
  renderers.push(fn);
}

export async function createContext(root: HTMLElement): Promise<AppContext> {
  const ctx: AppContext = {
    root,
    repo: { version: 1, groups: [], tasks: [], archived: [] },
    settings: null as unknown as TodoSettings,
    currentGroup: 'all',
    keyword: '',
    newGroupChoice: '',
    archiveOpen: false,
    editing: false,
    modalOpen: false,
    async reload() {
      const [repo, settings] = await Promise.all([loadRepo(), loadSettings()]);
      ctx.repo = repo;
      ctx.settings = settings;
    },
    render() {
      renderers.forEach((r) => r(ctx));
    },
    async mutate(fn) {
      fn(ctx.repo);
      await persistRepo(ctx.repo);
      ctx.render();
    },
    async changeSettings(patch) {
      ctx.settings = await saveSettings(patch);
      ctx.render();
    },
    async setCurrentGroup(gid) {
      ctx.currentGroup = gid;
      ctx.render();
      await saveUiState({ currentGroup: gid });
    },
    async setNewTaskGroup(gid) {
      ctx.newGroupChoice = gid;
      await saveUiState({ newTaskGroup: gid });
    },
    async setArchiveOpen(open) {
      ctx.archiveOpen = open;
      ctx.render();
      await saveUiState({ archiveOpen: open });
    },
    toast() {
      /* Task 11 接管 */
    },
  };
  await ctx.reload();
  // 示例数据的语言跟随「实际生效的语言」（手动选定的优先，否则看浏览器），
  // 所以先把设置里的 locale 交给 i18n 再解析；mountApp 里还会再设一次，这里重复设置无害
  setLocale(ctx.settings.locale);
  // 首次安装（storage 里还没有数据键）时播种示例数据，打开就能看到功能演示；
  // 之后即使把任务全删光也不再播种，避免打扰已上手的老用户
  if (!(await hasRepoKey())) {
    ctx.repo = buildSeedRepo(getResolvedLocale());
    await persistRepo(ctx.repo);
  }
  // 界面状态只在首次进入时读一次：跨标签页同步（storage.onChanged）不该把当前 Tab 拽走
  const ui = reconcileUiState(await loadUiState(), ctx.repo.groups.map((g) => g.id));
  ctx.currentGroup = ui.currentGroup;
  ctx.newGroupChoice = ui.newTaskGroup;
  ctx.archiveOpen = ui.archiveOpen;
  return ctx;
}
