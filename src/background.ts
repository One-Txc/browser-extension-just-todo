import { actionApi } from './shared/action-compat.ts';
import { isNativeNewtabUrl, shouldTakeOverNewtab } from './shared/newtab-url.ts';
import { loadSettings, watchSettings } from './shared/settings.ts';

/** 接管后的新标签页地址 */
const TODO_NEWTAB_URL = chrome.runtime.getURL('build/newtab.html');

/** 点扩展图标：已有 app 标签页则激活，否则新开一个 */
async function openOrFocusApp(): Promise<void> {
  const url = chrome.runtime.getURL('build/app.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing?.id !== undefined) {
    if (existing.windowId !== undefined) await chrome.windows?.update?.(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }
  await chrome.tabs.create({ url });
}

/*
 * 新标签页接管（见 docs/设计文档.md 第 11 节）。
 *
 * 刻意**不**声明 chrome_url_overrides：那是清单静态声明，没有运行时开关，一旦声明
 * 新标签页就永远归扩展，「关闭接管」也只能显示一张空白页。改成监听新标签页事件再
 * 重定向后，开关就是真开关 —— 关闭即不干预，浏览器原生新标签页照旧。
 *
 * 代价：需要 tabs 权限读标签页地址；重定向发生在原生页提交之后，可能闪一帧原生页。
 */

/** 接管开关的内存缓存；null = 本次后台生命周期内还没读到设置 */
let takeover: boolean | null = null;

watchSettings((s) => {
  takeover = s.newtabOverride;
});

/** 读开关：热路径上尽量不同步等一次 storage */
async function takeoverEnabled(): Promise<boolean> {
  if (takeover === null) takeover = (await loadSettings()).newtabOverride;
  return takeover;
}

/** 正在重定向的标签页：onCreated 与 onUpdated 会对同一个新标签页各报一次 */
const redirecting = new Set<number>();

/** 新标签页事件入口：命中原生新标签页且开关打开时，把该页换成待办页 */
async function maybeTakeOver(tabId: number | undefined, url: string | null | undefined): Promise<void> {
  if (tabId === undefined || redirecting.has(tabId) || !isNativeNewtabUrl(url)) return;
  redirecting.add(tabId);
  try {
    if (!shouldTakeOverNewtab(url, await takeoverEnabled())) return;
    await chrome.tabs.update(tabId, { url: TODO_NEWTAB_URL });
  } catch {
    // 标签页可能在重定向前就被关掉了，忽略
  } finally {
    // 一秒后放开：同一标签页之后回到新标签页（例如按后退）仍应被接管
    setTimeout(() => redirecting.delete(tabId), 1000);
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  // pendingUrl 比 url 更早可用，能赶在原生页渲染前换掉它（减少闪帧）
  void maybeTakeOver(tab.id, tab.pendingUrl ?? tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab.pendingUrl ?? tab.url;
  if (url !== undefined) void maybeTakeOver(tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  redirecting.delete(tabId);
});

actionApi().onClicked.addListener(() => {
  void openOrFocusApp();
});
