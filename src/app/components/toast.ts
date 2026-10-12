import { registerRenderer, type AppContext } from '../context.ts';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** 把 ctx.toast 接到页面底部的胶囊提示，1.8s 后淡出 */
function renderToastHost(ctx: AppContext): void {
  const host = ctx.root.querySelector('#toast') as HTMLElement | null;
  if (!host) return;
  ctx.toast = (message: string) => {
    host.textContent = message;
    host.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.classList.remove('show'), 1800);
  };
}

registerRenderer(renderToastHost);
