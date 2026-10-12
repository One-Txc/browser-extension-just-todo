import { registerRenderer, type AppContext } from '../context.ts';
import { t } from '../../shared/i18n.ts';
import { ICON, esc, formatDate } from '../icons.ts';
import { visibleArchived, restoreArchived, removeArchived, persistRepo, type ArchivedTask } from '../../shared/store.ts';

function rowHtml(a: ArchivedTask): string {
  return `<li class="a-item" data-id="${esc(a.id)}">
    <span class="a-dot"></span>
    <span class="a-title">${esc(a.title)}</span>
    <span class="g-tag${a.groupName ? '' : ' none'}">${esc(a.groupName ?? t('ungrouped'))}</span>
    <span class="a-date">${esc(formatDate(a.archivedAt))}</span>
    <span class="ops"><button class="op" data-act="restore" title="${esc(t('opRestore'))}">${ICON.undo}</button><button class="op del" data-act="del" title="${esc(t('opDelete'))}">${ICON.trash}</button></span>
  </li>`;
}

function renderArchive(ctx: AppContext): void {
  const listEl = ctx.root.querySelector('#archiveList') as HTMLElement | null;
  const subEl = ctx.root.querySelector('#archiveSub');
  const footEl = ctx.root.querySelector('#archiveFoot');
  const countEl = ctx.root.querySelector('#archiveCount');
  const card = ctx.root.querySelector('#archiveCard');
  const head = ctx.root.querySelector('#archiveHead') as HTMLElement | null;
  const search = ctx.root.querySelector('#search') as HTMLInputElement | null;
  if (!listEl) return;

  // 折叠开关：卡片 class 决定可见性，头部整行可点（搜索框除外），状态记在 ui-state
  if (card) card.classList.toggle('collapsed', !ctx.archiveOpen);
  if (head) {
    head.setAttribute('aria-expanded', String(ctx.archiveOpen));
    head.onclick = (e) => {
      if ((e.target as HTMLElement).closest('#archiveSearchWrap')) return;
      void ctx.setArchiveOpen(!ctx.archiveOpen);
    };
    head.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      void ctx.setArchiveOpen(!ctx.archiveOpen);
    };
  }

  const kw = ctx.keyword.trim();
  const total = ctx.repo.archived.length;
  if (countEl) countEl.textContent = total ? String(total) : '';
  const items = kw
    ? visibleArchived(ctx.repo, ctx.keyword, total)
    : visibleArchived(ctx.repo, '', ctx.settings.archiveVisible);

  listEl.innerHTML = items.length
    ? items.map(rowHtml).join('')
    : `<div class="empty">${esc(t(kw ? 'emptySearch' : 'emptyArchive'))}</div>`;

  if (subEl) {
    subEl.textContent = !kw && total ? t('archiveSubRecent', [String(Math.min(items.length, total))]) : '';
  }

  if (footEl) {
    let foot = '';
    if (kw) foot = t('archiveSearchFoot', [String(total), kw, String(items.length)]);
    else if (total > ctx.settings.archiveVisible)
      foot = t('archiveFootLimited', [String(ctx.settings.archiveVisible), String(total)]);
    else if (total) foot = t('archiveFootTotal', [String(total)]);
    if (total >= ctx.settings.archiveLimit) {
      const trimmed = t('archiveTrimmed', [String(ctx.settings.archiveLimit)]);
      foot = foot ? `${trimmed} · ${foot}` : trimmed;
    }
    footEl.textContent = foot;
  }

  listEl.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    const li = btn.closest('.a-item') as HTMLElement | null;
    if (!li) return;
    const id = li.dataset.id ?? '';
    if (btn.dataset.act === 'restore') {
      restoreArchived(ctx.repo, id, ctx.settings.newTaskPosition);
      await persistRepo(ctx.repo);
      ctx.render();
      ctx.toast(t('toastRestored'));
    } else {
      removeArchived(ctx.repo, id);
      await persistRepo(ctx.repo);
      ctx.render();
    }
  };

  if (search) {
    search.oninput = () => {
      ctx.keyword = search.value;
      renderArchive(ctx);
    };
  }
}

registerRenderer(renderArchive);
