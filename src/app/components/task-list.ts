import { registerRenderer, type AppContext } from '../context.ts';
import { t } from '../../shared/i18n.ts';
import { ICON, esc } from '../icons.ts';
import {
  visibleTasks, setTaskDone, renameTask, removeTask, archiveTask, archiveAllDone, moveTask, persistRepo, type Task,
} from '../../shared/store.ts';

/**
 * 拖拽排序状态。一次拖拽横跨 dragstart→dragover→drop 多次事件，
 * 所以放在模块级而不是渲染闭包里。
 * dropBefore：落点 = 该行之前；null = 列表末尾；undefined = 当前没有有效落点。
 */
let dragId: string | null = null;
let dropBefore: string | null | undefined;
let dropRow: HTMLElement | null = null;
let dropIsAfter = false;

/** 清掉落点指示线与拖拽态 */
function clearDragState(listEl?: HTMLElement): void {
  dropRow?.classList.remove('drop-before', 'drop-after');
  dropRow = null;
  dropIsAfter = false;
  dropBefore = undefined;
  listEl?.querySelectorAll('.task.dragging').forEach((el) => el.classList.remove('dragging'));
}

/** 目标行之后第一个「同一列表」的行；没有就表示要挪到该列表末尾 */
function nextSameKindId(ctx: AppContext, done: boolean, row: HTMLElement): string | null {
  let el = row.nextElementSibling as HTMLElement | null;
  while (el) {
    const id = el.classList.contains('task') ? el.dataset.id : undefined;
    const t = id ? ctx.repo.tasks.find((x) => x.id === id) : undefined;
    if (t && t.done === done) return t.id;
    el = el.nextElementSibling as HTMLElement | null;
  }
  return null;
}

function rowHtml(ctx: AppContext, task: Task, isDone: boolean, showGroup: boolean): string {
  const gname = task.gid ? ctx.repo.groups.find((g) => g.id === task.gid)?.name ?? null : null;
  const ops = isDone
    ? `<button class="op" data-act="reopen" title="${esc(t('opReopen'))}">${ICON.undo}</button><button class="op" data-act="archive" title="${esc(t('opArchive'))}">${ICON.box}</button>`
    : `<button class="op" data-act="rename" title="${esc(t('opRename'))}">${ICON.edit}</button>`;
  return `<li class="task ${isDone ? 'done' : ''}" data-id="${esc(task.id)}">
    <span class="grip" draggable="true" aria-hidden="true" title="${esc(t('dragHint'))}">${ICON.grip}</span>
    <button class="check" data-act="toggle">${ICON.check}</button>
    <span class="title${isDone ? '' : ' editable'}"${isDone ? '' : ` title="${esc(t('editHint'))}"`}><span class="t-text">${esc(task.title)}</span><span class="t-fill" draggable="true" aria-hidden="true"></span></span>
    ${showGroup ? `<span class="g-tag${gname ? '' : ' none'}">${esc(gname ?? t('ungrouped'))}</span>` : ''}
    <span class="ops">${ops}<button class="op del" data-act="del" title="${esc(t('opDelete'))}">${ICON.trash}</button></span>
  </li>`;
}

function inlineEdit(ctx: AppContext, row: HTMLElement): void {
  const id = row.dataset.id ?? '';
  const task = ctx.repo.tasks.find((x) => x.id === id);
  const titleEl = row.querySelector('.title') as HTMLElement | null;
  if (!task || !titleEl || task.done) return;

  const input = document.createElement('input');
  input.value = task.title;
  input.className = 'title-input';

  ctx.editing = true;
  // 锁住进入编辑前的高度：单行标题本来就零跳动，多行标题换成单行输入框时也不会塌陷
  row.style.minHeight = `${row.offsetHeight}px`;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save: boolean) => {
    if (finished) return;
    finished = true;
    ctx.editing = false;
    if (save) {
      renameTask(ctx.repo, id, input.value);
      await persistRepo(ctx.repo);
    }
    ctx.render();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
    else if (e.key === 'Escape') { void finish(false); }
  };
  input.onblur = () => { void finish(true); };
}

function renderTaskList(ctx: AppContext): void {
  const listEl = ctx.root.querySelector('#taskList') as HTMLElement | null;
  if (!listEl) return;
  const { undone, done } = visibleTasks(ctx.repo, ctx.currentGroup);
  const showGroup = ctx.currentGroup === 'all';

  let html = undone.map((tk) => rowHtml(ctx, tk, false, showGroup)).join('');
  if (done.length) {
    // 「全部归档」放在分隔行右侧：归档的是**所有**已完成任务（含其他分组），所以数量单算
    const allDone = ctx.repo.tasks.filter((tk) => tk.done).length;
    html +=
      `<div class="done-divider"><span>${esc(t('doneDivider', [String(done.length)]))}</span>` +
      `<span class="rule"></span>` +
      `<button class="archive-all" data-act="archive-all">${esc(t('archiveAll', [String(allDone)]))}</button></div>` +
      done.map((tk) => rowHtml(ctx, tk, true, showGroup)).join('');
  }
  if (!undone.length && !done.length) {
    html = `<div class="empty">${esc(t(ctx.currentGroup === 'all' ? 'emptyAll' : 'emptyGroup'))}</div>`;
  }
  listEl.innerHTML = html;

  listEl.ondragstart = (e) => {
    const row = (e.target as HTMLElement).closest('.task') as HTMLElement | null;
    if (!row?.dataset.id) return;
    // 正在行内编辑的那一行不给拖：拖完会重渲染，未保存的输入就丢了
    if (row.querySelector('input')) return;
    dragId = row.dataset.id;
    row.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox 不写数据就不会触发后续 drop
      e.dataTransfer.setData('text/plain', dragId);
      // 只有手柄可拖（整行可拖会抢掉文字选择），所以拿整行当拖拽影像，视觉上仍是"拖这一行"
      e.dataTransfer.setDragImage(row, 10, row.offsetHeight / 2);
    }
  };

  // 只在同一个列表（待办 / 已完成）内部允许重排：跨过分隔线不算有效落点
  listEl.ondragover = (e) => {
    const dragged = dragId ? ctx.repo.tasks.find((x) => x.id === dragId) : undefined;
    const row = (e.target as HTMLElement).closest('.task') as HTMLElement | null;
    const over = row?.dataset.id ? ctx.repo.tasks.find((x) => x.id === row.dataset.id) : undefined;
    if (!dragged || !row || !over || over.id === dragged.id || over.done !== dragged.done) {
      if (dropRow) clearDragState(listEl);
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (dropRow !== row || dropIsAfter !== after) {
      dropRow?.classList.remove('drop-before', 'drop-after');
      dropRow = row;
      dropIsAfter = after;
      row.classList.add(after ? 'drop-after' : 'drop-before');
    }
    // 落在下半行 = 挪到下一行之前（没有下一行就是列表末尾）
    dropBefore = after ? nextSameKindId(ctx, dragged.done, row) : over.id;
  };

  listEl.ondrop = async (e) => {
    e.preventDefault();
    const id = dragId;
    const before = dropBefore;
    dragId = null;
    clearDragState(listEl);
    if (!id || before === undefined) return;
    if (!moveTask(ctx.repo, id, before)) return;
    await persistRepo(ctx.repo);
    ctx.render();
  };

  listEl.ondragend = () => {
    dragId = null;
    clearDragState(listEl);
  };

  listEl.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    // 「全部归档」在已完成分隔行上，不属于任何任务行，先单独处理
    if (btn.dataset.act === 'archive-all') {
      archiveAllDone(ctx.repo, ctx.settings.archiveLimit);
      await persistRepo(ctx.repo);
      ctx.render();
      ctx.toast(
        ctx.repo.archived.length >= ctx.settings.archiveLimit
          ? t('archiveTrimmed', [String(ctx.settings.archiveLimit)])
          : t('toastArchived')
      );
      return;
    }
    const row = btn.closest('.task') as HTMLElement | null;
    if (!row) return;
    const id = row.dataset.id ?? '';
    const task = ctx.repo.tasks.find((x) => x.id === id);
    if (!task) return;
    const act = btn.dataset.act;

    if (act === 'toggle') {
      const willArchive = !task.done && ctx.settings.autoArchive;
      setTaskDone(ctx.repo, id, !task.done, {
        autoArchive: ctx.settings.autoArchive,
        archiveLimit: ctx.settings.archiveLimit,
      });
      await persistRepo(ctx.repo);
      ctx.render();
      if (willArchive && !ctx.repo.tasks.some((x) => x.id === id)) ctx.toast(t('toastArchived'));
    } else if (act === 'reopen') {
      setTaskDone(ctx.repo, id, false, {
        autoArchive: ctx.settings.autoArchive,
        archiveLimit: ctx.settings.archiveLimit,
      });
      await persistRepo(ctx.repo);
      ctx.render();
    } else if (act === 'archive') {
      archiveTask(ctx.repo, id, ctx.settings.archiveLimit);
      await persistRepo(ctx.repo);
      ctx.render();
      ctx.toast(
        ctx.repo.archived.length >= ctx.settings.archiveLimit
          ? t('archiveTrimmed', [String(ctx.settings.archiveLimit)])
          : t('toastArchived')
      );
    } else if (act === 'del') {
      removeTask(ctx.repo, id);
      await persistRepo(ctx.repo);
      ctx.render();
    } else if (act === 'rename') {
      inlineEdit(ctx, row);
    }
  };

  listEl.ondblclick = (e) => {
    const title = (e.target as HTMLElement).closest('.title.editable') as HTMLElement | null;
    if (!title) return;
    const row = title.closest('.task') as HTMLElement | null;
    if (row) inlineEdit(ctx, row);
  };
}

registerRenderer(renderTaskList);
