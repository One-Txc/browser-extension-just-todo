import css from './app.css';
import { setLocale, applyI18n, t } from '../shared/i18n.ts';
import { createContext, type AppContext } from './context.ts';
import { setTheme } from './theme-host.ts';
import { APP_HTML } from './app-template.ts';
import { trimArchive, persistRepo } from '../shared/store.ts';

import './components/tabs.ts';
import './components/task-list.ts';
import { focusNewTask } from './components/add-row.ts';
import './components/toast.ts';
import './components/group-modal.ts';
import './components/archive-list.ts';
import './components/settings-modal.ts';

/** 注入样式、渲染骨架、绑定跨标签页同步，返回可渲染的应用上下文 */
export async function mountApp(root: HTMLElement): Promise<AppContext> {
  const style = document.createElement('style');
  style.id = 'todo-app-style';
  style.textContent = css;
  document.head.append(style);

  root.innerHTML = APP_HTML;
  const ctx = await createContext(root);
  setLocale(ctx.settings.locale);
  setTheme(ctx.settings.theme);
  applyI18n(root);
  ctx.render();

  /*
   * 归档上限只在**页面加载**时落地：在设置面板里调小上限不会当场删归档（手滑输入就是数据丢失），
   * 刷新后才按新上限裁剪并提示。归档写入时的淘汰不受影响，照旧立即生效。
   */
  const trimmed = trimArchive(ctx.repo, ctx.settings.archiveLimit);
  if (trimmed > 0) {
    await persistRepo(ctx.repo);
    ctx.toast(t('archiveTrimmed', [String(ctx.settings.archiveLimit)]));
    ctx.render();
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (ctx.editing || ctx.modalOpen) return;
    if (changes['todo:data:v1'] || changes['todo:settings:v1']) {
      await ctx.reload();
      setLocale(ctx.settings.locale);
      setTheme(ctx.settings.theme);
      applyI18n(root);
      ctx.render();
    }
  });

  // 首次进入页面就把光标放进新增行：打开即可直接打字（app.html#settings 深链时由设置弹层抢回去）
  focusNewTask(ctx);

  return ctx;
}
