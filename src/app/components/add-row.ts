import { registerRenderer, type AppContext } from '../context.ts';
import { t } from '../../shared/i18n.ts';
import { addTask, persistRepo } from '../../shared/store.ts';
import { esc } from '../icons.ts';

/** 把光标放进新增任务输入框：首次进入页面、切换分组 Tab 后都走这里 */
export function focusNewTask(ctx: AppContext): void {
  (ctx.root.querySelector('#newTask') as HTMLInputElement | null)?.focus();
}

function renderPicker(ctx: AppContext): void {
  const el = ctx.root.querySelector('#groupPicker');
  if (!el) return;
  if (ctx.currentGroup === 'all') {
    const opts = ctx.repo.groups
      .map(
        (g) =>
          `<option value="${esc(g.id)}" ${ctx.newGroupChoice === g.id ? 'selected' : ''}>${esc(g.name)}</option>`
      )
      .join('');
    el.innerHTML = `<span class="select-wrap"><select id="groupSelect"><option value="">${esc(t('pickerUngrouped'))}</option>${opts}</select></span>`;
    const sel = el.querySelector('#groupSelect') as HTMLSelectElement | null;
    if (sel) sel.onchange = () => { void ctx.setNewTaskGroup(sel.value); };
  } else {
    const g = ctx.repo.groups.find((x) => x.id === ctx.currentGroup);
    el.innerHTML = `<span class="g-tag${g ? '' : ' none'}">${esc(g ? g.name : t('ungrouped'))}</span>`;
  }
}

/** 新增任务行（在任务列表上方；「全部归档」按钮归 task-list 的已完成分隔行管） */
function renderAddRow(ctx: AppContext): void {
  renderPicker(ctx);

  const input = ctx.root.querySelector('#newTask') as HTMLInputElement | null;
  if (input) {
    input.onkeydown = async (e) => {
      if (e.key !== 'Enter') return;
      const v = input.value.trim();
      if (!v) return;
      const gid =
        ctx.currentGroup === 'all'
          ? ctx.repo.groups.some((g) => g.id === ctx.newGroupChoice)
            ? ctx.newGroupChoice
            : null
          : ctx.currentGroup;
      const result = addTask(
        ctx.repo,
        { title: input.value, gid, position: ctx.settings.newTaskPosition },
        ctx.settings.activeLimit
      );
      if (!result.ok) {
        ctx.toast(t('limitReached', [String(ctx.settings.activeLimit)]));
        input.value = '';
        return;
      }
      input.value = '';
      await persistRepo(ctx.repo);
      ctx.render();
    };
  }
}

registerRenderer(renderAddRow);
