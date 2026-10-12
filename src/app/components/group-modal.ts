import { registerRenderer, type AppContext } from '../context.ts';
import { t, applyI18n } from '../../shared/i18n.ts';
import { ICON, esc } from '../icons.ts';
import { addGroup, renameGroup, removeGroup, persistRepo } from '../../shared/store.ts';

let current: AppContext | null = null;

function countForGroup(ctx: AppContext, gid: string): number {
  const active = ctx.repo.tasks.filter((x) => x.gid === gid).length;
  const archived = ctx.repo.archived.filter((a) => a.gid === gid).length;
  return active + archived;
}

function rowsHtml(ctx: AppContext): string {
  return ctx.repo.groups
    .map(
      (g) => `<li class="g-edit-item" data-id="${esc(g.id)}">
        <span class="gname" contenteditable="true">${esc(g.name)}</span>
        <span class="g-count">${esc(t('groupTaskCount', [String(countForGroup(ctx, g.id))]))}</span>
        <button class="g-del" title="${esc(t('opDelete'))}">${ICON.trash}</button>
      </li>`
    )
    .join('');
}

async function commitRename(ctx: AppContext, id: string, span: HTMLElement): Promise<void> {
  renameGroup(ctx.repo, id, span.textContent ?? '');
  await persistRepo(ctx.repo);
  ctx.render();
}

function wire(ctx: AppContext): void {
  const body = ctx.root.querySelector('#groupBody') as HTMLElement | null;
  if (!body) return;

  const add = async () => {
    const input = body.querySelector('#newGroup') as HTMLInputElement | null;
    if (!input || !input.value.trim()) return;
    addGroup(ctx.repo, input.value);
    input.value = '';
    await persistRepo(ctx.repo);
    ctx.render();
  };
  const addBtn = body.querySelector('#addGroupBtn');
  if (addBtn) (addBtn as HTMLElement).onclick = () => void add();
  const newGroup = body.querySelector('#newGroup') as HTMLInputElement | null;
  if (newGroup) {
    newGroup.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void add();
      }
    };
  }

  body.querySelectorAll<HTMLElement>('.g-del').forEach((btn) => {
    btn.onclick = async () => {
      const li = btn.closest('.g-edit-item') as HTMLElement | null;
      const id = li?.dataset.id ?? '';
      removeGroup(ctx.repo, id);
      // 删掉的正好是当前停留的 Tab / 正在选的新建分组 → 一并回落并记住
      if (ctx.currentGroup === id) await ctx.setCurrentGroup('all');
      if (ctx.newGroupChoice === id) await ctx.setNewTaskGroup('');
      await persistRepo(ctx.repo);
      ctx.render();
    };
  });

  body.querySelectorAll<HTMLElement>('.gname').forEach((span) => {
    const li = span.closest('.g-edit-item') as HTMLElement | null;
    const id = li?.dataset.id ?? '';
    span.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        span.blur();
      }
    };
    span.onblur = () => void commitRename(ctx, id, span);
  });

  const done = body.querySelector('#groupDone');
  if (done) (done as HTMLElement).onclick = () => closeGroupModal(ctx);
}

function fillBody(ctx: AppContext): void {
  const body = ctx.root.querySelector('#groupBody');
  if (!body) return;
  body.innerHTML = `
    <h3 data-i18n="groupMgrTitle"></h3>
    <div class="g-new">
      <input id="newGroup" data-i18n-placeholder="newGroupPlaceholder">
      <button id="addGroupBtn">+</button>
    </div>
    <ul class="g-edit-list" id="groupEditList">${rowsHtml(ctx)}</ul>
    <div class="g-tip" data-i18n="groupTip"></div>
    <div class="modal-actions"><button class="btn primary" id="groupDone" data-i18n="done"></button></div>
  `;
  applyI18n(body);
  wire(ctx);
}

export function openGroupModal(): void {
  if (!current) return;
  current.modalOpen = true;
  fillBody(current);
  current.root.querySelector('#groupMask')?.classList.add('show');
  (current.root.querySelector('#newGroup') as HTMLInputElement | null)?.focus();
}

function closeGroupModal(ctx: AppContext): void {
  ctx.modalOpen = false;
  ctx.root.querySelector('#groupMask')?.classList.remove('show');
}

function renderGroupModal(ctx: AppContext): void {
  current = ctx;
  const mask = ctx.root.querySelector('#groupMask') as HTMLElement | null;
  if (mask) {
    mask.onclick = (e) => {
      if (e.target === mask) closeGroupModal(ctx);
    };
    if (mask.classList.contains('show')) fillBody(ctx);
  }
}

registerRenderer(renderGroupModal);
