export interface Group { id: string; name: string; createdAt: number }
export interface Task {
  id: string; title: string; done: boolean; gid: string | null;
  createdAt: number; completedAt: number | null;
  /** 列表内排序键（待办、已完成各自一段空间），由拖拽重排写入，见 moveTask */
  order: number;
}
export interface ArchivedTask {
  id: string; title: string; gid: string | null; groupName: string | null; archivedAt: number;
}
export interface Repo { version: 1; groups: Group[]; tasks: Task[]; archived: ArchivedTask[] }

const DATA_KEY = 'todo:data:v1';
export const EMPTY_REPO: Repo = { version: 1, groups: [], tasks: [], archived: [] };

let counter = 0;
export function newId(prefix: 'g' | 't' | 'a'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// Monotonic timestamp: guarantees strictly increasing values even within the
// same millisecond, so "newest kept" ordering in trimArchive is deterministic.
let lastTs = 0;
function now(): number {
  const t = Date.now();
  lastTs = t > lastTs ? t : lastTs + 1;
  return lastTs;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const gidOrNull = (v: unknown, groups: Group[]): string | null =>
  isStr(v) && groups.some(g => g.id === v) ? v : null;

/**
 * 旧数据没有 order 字段：待办回落到 createdAt 升序、已完成回落到 completedAt 倒序，
 * 也就是旧版本「待办按创建先后、已完成最新在前」的视觉顺序，升级后不会跳序。
 */
function taskOrder(raw: { done?: unknown; createdAt: number; completedAt?: unknown; order?: unknown }): number {
  if (isNum(raw.order)) return raw.order;
  const done = raw.done === true;
  return done ? -(isNum(raw.completedAt) ? raw.completedAt : raw.createdAt) : raw.createdAt;
}

export function normalizeRepo(raw: unknown): Repo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Repo>;
  const groups: Group[] = Array.isArray(r.groups)
    ? r.groups
        .filter((g): g is Group => !!g && isStr((g as Group).id) && isStr((g as Group).name) && isNum((g as Group).createdAt))
        .map(g => ({ id: g.id, name: g.name, createdAt: g.createdAt }))
    : [];
  const tasks: Task[] = Array.isArray(r.tasks)
    ? r.tasks
        .filter((t): t is Task => !!t && isStr((t as Task).id) && isStr((t as Task).title) && isBool((t as Task).done) && isNum((t as Task).createdAt))
        .map(t => ({
          id: t.id, title: t.title, done: t.done,
          gid: gidOrNull(t.gid, groups),
          createdAt: t.createdAt,
          completedAt: isNum(t.completedAt) ? t.completedAt : null,
          order: taskOrder(t),
        }))
    : [];
  const archived: ArchivedTask[] = Array.isArray(r.archived)
    ? r.archived
        .filter((a): a is ArchivedTask => !!a && isStr((a as ArchivedTask).id) && isStr((a as ArchivedTask).title) && isNum((a as ArchivedTask).archivedAt))
        .map(a => ({
          id: a.id, title: a.title,
          gid: isStr(a.gid) ? a.gid : null,
          groupName: isStr(a.groupName) ? a.groupName : null,
          archivedAt: a.archivedAt,
        }))
    : [];
  return { version: 1, groups, tasks, archived };
}

export async function loadRepo(): Promise<Repo> {
  const got = await chrome.storage.local.get(DATA_KEY);
  return normalizeRepo((got as Record<string, unknown>)[DATA_KEY]);
}
export async function persistRepo(repo: Repo): Promise<void> {
  await chrome.storage.local.set({ [DATA_KEY]: repo });
}

/** storage 里是否写过数据键：没有即视为首次安装（此时才播种示例数据，见 seed.ts） */
export async function hasRepoKey(): Promise<boolean> {
  const got = await chrome.storage.local.get(DATA_KEY);
  return DATA_KEY in (got as Record<string, unknown>);
}

function groupNameOf(repo: Repo, gid: string | null): string | null {
  if (!gid) return null;
  return repo.groups.find(g => g.id === gid)?.name ?? null;
}

/** 同一列表内的排序：order 为主，时间戳只做兜底，保证排序稳定 */
const byOrder = (a: Task, b: Task): number => a.order - b.order || a.createdAt - b.createdAt;

/**
 * 算出某个任务在同一列表里的排位。edge='back' 取「末尾之后」，edge='front' 取「最前之前」。
 * excludeId 用于跳过任务自己（它可能已经被改了 done）。
 */
function edgeOrder(repo: Repo, done: boolean, edge: 'front' | 'back', excludeId?: string): number {
  const orders = repo.tasks.filter(t => t.done === done && t.id !== excludeId).map(t => t.order);
  if (!orders.length) return 0;
  return edge === 'front' ? Math.min(...orders) - 1 : Math.max(...orders) + 1;
}

/**
 * 拖拽重排：把任务挪到同列表内 beforeId 之前（beforeId = null 表示挪到列表末尾）。
 * 跨列表（待办 ⇄ 已完成）不允许，返回 false；重排后把该列表的 order 重新编号为 0..n-1。
 */
export function moveTask(repo: Repo, id: string, beforeId: string | null): boolean {
  const task = repo.tasks.find(t => t.id === id);
  if (!task || beforeId === id) return false;
  const rest = repo.tasks.filter(t => t.done === task.done && t.id !== id).sort(byOrder);
  let index = rest.length;
  if (beforeId !== null) {
    const at = rest.findIndex(t => t.id === beforeId);
    if (at < 0) return false; // 目标不在同一列表（或已消失）
    index = at;
  }
  rest.splice(index, 0, task);
  rest.forEach((t, i) => { t.order = i; });
  return true;
}

export function addTask(repo: Repo, input: { title: string; gid: string | null; position?: 'first' | 'last' }, activeLimit: number)
  : { ok: true; task: Task } | { ok: false; reason: 'limit' } {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'limit' };
  if (repo.tasks.length >= activeLimit) return { ok: false, reason: 'limit' };
  const task: Task = {
    id: newId('t'), title, done: false,
    gid: input.gid && repo.groups.some(g => g.id === input.gid) ? input.gid : null,
    createdAt: now(), completedAt: null,
    order: edgeOrder(repo, false, input.position === 'first' ? 'front' : 'back'),
  };
  repo.tasks.push(task);
  return { ok: true, task };
}

function toArchive(repo: Repo, task: Task, archiveLimit: number): void {
  repo.archived.push({
    id: newId('a'), title: task.title, gid: task.gid,
    groupName: groupNameOf(repo, task.gid), archivedAt: now(),
  });
  repo.tasks = repo.tasks.filter(t => t.id !== task.id);
  trimArchive(repo, archiveLimit);
}

export function setTaskDone(repo: Repo, id: string, done: boolean,
  opts: { autoArchive: boolean; archiveLimit: number }): void {
  const t = repo.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = done;
  t.completedAt = done ? now() : null;
  // 勾选完成 → 排在已完成**最前**（最新完成的在最上面）；取消完成 → 回到待办**末尾**
  t.order = edgeOrder(repo, done, done ? 'front' : 'back', t.id);
  if (done && opts.autoArchive) toArchive(repo, t, opts.archiveLimit);
}

export function renameTask(repo: Repo, id: string, title: string): void {
  const t = repo.tasks.find(x => x.id === id);
  const v = title.trim();
  if (t && v) t.title = v;
}
export function removeTask(repo: Repo, id: string): void {
  repo.tasks = repo.tasks.filter(t => t.id !== id);
}
/** 手动改任务分组：gid 为 null 移出为未分组；不存在的分组 id 回落为 null（与 addTask 同规则） */
export function setTaskGroup(repo: Repo, id: string, gid: string | null): void {
  const t = repo.tasks.find(x => x.id === id);
  if (t) t.gid = gid && repo.groups.some(g => g.id === gid) ? gid : null;
}
export function archiveTask(repo: Repo, id: string, archiveLimit: number): void {
  const t = repo.tasks.find(x => x.id === id);
  if (t) toArchive(repo, t, archiveLimit);
}
export function archiveAllDone(repo: Repo, archiveLimit: number): number {
  const done = repo.tasks.filter(t => t.done);
  done.forEach(t => toArchive(repo, t, archiveLimit));
  return done.length;
}
export function restoreArchived(repo: Repo, archivedId: string, position: 'first' | 'last' = 'last'): void {
  const idx = repo.archived.findIndex(a => a.id === archivedId);
  if (idx < 0) return;
  const a = repo.archived[idx];
  repo.archived.splice(idx, 1);
  repo.tasks.push({
    id: newId('t'), title: a.title, done: false,
    gid: a.gid && repo.groups.some(g => g.id === a.gid) ? a.gid : null,
    createdAt: now(), completedAt: null,
    order: edgeOrder(repo, false, position === 'first' ? 'front' : 'back'),
  });
}
export function removeArchived(repo: Repo, archivedId: string): void {
  repo.archived = repo.archived.filter(a => a.id !== archivedId);
}
export function addGroup(repo: Repo, name: string): Group | null {
  const v = name.trim();
  if (!v) return null;
  const group: Group = { id: newId('g'), name: v, createdAt: now() };
  repo.groups.push(group);
  return group;
}
export function renameGroup(repo: Repo, id: string, name: string): void {
  const g = repo.groups.find(x => x.id === id);
  const v = name.trim();
  if (g && v) g.name = v;
}
export function removeGroup(repo: Repo, id: string): void {
  repo.groups = repo.groups.filter(g => g.id !== id);
  repo.tasks.forEach(t => { if (t.gid === id) t.gid = null; });
}
export function visibleTasks(repo: Repo, gid: 'all' | string): { undone: Task[]; done: Task[] } {
  const list = repo.tasks.filter(t => gid === 'all' || t.gid === gid);
  return {
    undone: list.filter(t => !t.done).sort(byOrder),
    done: list.filter(t => t.done).sort(byOrder),
  };
}
export function visibleArchived(repo: Repo, keyword: string, limit: number): ArchivedTask[] {
  const kw = keyword.trim().toLowerCase();
  const sorted = [...repo.archived].sort((a, b) => b.archivedAt - a.archivedAt);
  if (!kw) return sorted.slice(0, limit);
  return sorted.filter(a => a.title.toLowerCase().includes(kw) || (a.groupName ?? '').toLowerCase().includes(kw));
}
export function trimArchive(repo: Repo, archiveLimit: number): number {
  if (repo.archived.length <= archiveLimit) return 0;
  repo.archived.sort((a, b) => b.archivedAt - a.archivedAt);
  const removed = repo.archived.length - archiveLimit;
  repo.archived.length = archiveLimit;
  return removed;
}
