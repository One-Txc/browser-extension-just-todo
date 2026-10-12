import { mountApp } from '../app/mount.ts';

/**
 * 新标签页壳。
 *
 * 这里只做一件事：渲染 Todo。**不再按接管开关分流视图** —— 是否会被接管由
 * background 的重定向决定（见 docs/设计文档.md 第 11 节）；开关关掉后新标签页
 * 交还浏览器，而任何真的落到本页的情况（直接打开、开关刚被关掉）都显示 Todo。
 *
 * 设置变化（含开关本身）由 mountApp 内部的 storage.onChanged 处理，无需整页 reload。
 */
async function boot(): Promise<void> {
  const root = document.querySelector('#root');
  if (!root) return;
  await mountApp(root as HTMLElement);
}

void boot();
