/**
 * 界面状态：与「数据」和「设置」分开存的一份小状态，只记用户上次的浏览位置。
 *
 * 为什么独立一份而不是塞进 settings：
 *   - settings 是设置面板的表单语义（每个字段都在面板里有对应控件），界面位置不是"设置项"；
 *   - 这份状态只在**页面首次加载**时读取：跨标签页同步（storage.onChanged）不该把当前
 *     标签页的 tab 拽到别的页面刚切过去的位置上。
 *
 * 与运行环境无关（只依赖 chrome.storage），可直接在 node 下测试。
 */

export interface UiState {
  /** 上次停留的分组 Tab：'all' 或某个分组 id */
  currentGroup: 'all' | string;
  /** 「全部」标签下新增行选中的分组：'' = 未分组 */
  newTaskGroup: string;
  /** 归档区是否展开（默认折叠：多数时候用户不关心它） */
  archiveOpen: boolean;
}

const UI_KEY = 'todo:ui:v1';
export const DEFAULT_UI_STATE: UiState = { currentGroup: 'all', newTaskGroup: '', archiveOpen: false };

export function normalizeUiState(raw: unknown): UiState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<UiState>;
  return {
    currentGroup: typeof r.currentGroup === 'string' && r.currentGroup ? r.currentGroup : 'all',
    newTaskGroup: typeof r.newTaskGroup === 'string' ? r.newTaskGroup : '',
    archiveOpen: typeof r.archiveOpen === 'boolean' ? r.archiveOpen : false,
  };
}

/**
 * 分组可能已经被删除：把指向不存在分组的界面状态回落，
 * 否则刷新后会停在一个空 tab 或选中一个不存在的分组。
 */
export function reconcileUiState(ui: UiState, groupIds: readonly string[]): UiState {
  return {
    ...ui,
    currentGroup: ui.currentGroup === 'all' || groupIds.includes(ui.currentGroup) ? ui.currentGroup : 'all',
    newTaskGroup: ui.newTaskGroup === '' || groupIds.includes(ui.newTaskGroup) ? ui.newTaskGroup : '',
  };
}

export async function loadUiState(): Promise<UiState> {
  const got = await chrome.storage.local.get(UI_KEY);
  return normalizeUiState((got as Record<string, unknown>)[UI_KEY]);
}

export async function saveUiState(patch: Partial<UiState>): Promise<UiState> {
  const next = normalizeUiState({ ...(await loadUiState()), ...patch });
  await chrome.storage.local.set({ [UI_KEY]: next });
  return next;
}
