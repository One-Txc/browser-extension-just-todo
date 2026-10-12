import { registerRenderer, type AppContext } from '../context.ts';
import { t } from '../../shared/i18n.ts';
import { esc } from '../icons.ts';
import { openGroupModal } from './group-modal.ts';
import { focusNewTask } from './add-row.ts';

/** 分组 Tab 栏；末尾「+」打开分组管理弹层 */
function renderTabs(ctx: AppContext): void {
  const el = ctx.root.querySelector('#tabs');
  if (!el) return;
  const count = (gid: string) =>
    ctx.repo.tasks.filter((x) => !x.done && (gid === 'all' || x.gid === gid)).length;

  let html = `<button class="tab ${ctx.currentGroup === 'all' ? 'active' : ''}" data-g="all">${esc(t('tabAll'))}<span class="badge">${count('all')}</span></button>`;
  ctx.repo.groups.forEach((g) => {
    html += `<button class="tab ${ctx.currentGroup === g.id ? 'active' : ''}" data-g="${esc(g.id)}">${esc(g.name)}<span class="badge">${count(g.id)}</span></button>`;
  });
  html += `<button class="tab add" id="openGroupMgr" title="${esc(t('manageGroups'))}">+</button>`;
  el.innerHTML = html;

  el.querySelectorAll<HTMLElement>('.tab[data-g]').forEach((b) => {
    b.onclick = () => {
      // 记住停留的 Tab（下次进入页面还停在这里）；新建分组的选择保留，只有分组被删时才清。
      // 切完分组通常紧接着就要新增任务，所以顺手把光标放进新增输入框。
      void ctx.setCurrentGroup(b.dataset.g ?? 'all').then(() => focusNewTask(ctx));
    };
  });
  const mgr = el.querySelector('#openGroupMgr');
  if (mgr) (mgr as HTMLElement).onclick = () => openGroupModal();
}

registerRenderer(renderTabs);
