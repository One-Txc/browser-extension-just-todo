/**
 * 原生新标签页地址识别。
 *
 * 为什么需要它：本扩展不再用 `chrome_url_overrides` 静态接管新标签页，而是由
 * background 监听新标签页事件后重定向到扩展页 —— 这样「关闭接管」才有真实语义
 * （不声明就没有覆盖，关闭即交还浏览器）。取舍与代价见 docs/设计文档.md 第 11 节。
 *
 * 纯函数、与运行环境无关，可直接在 node 下测试。
 */

/** 原生新标签页可能出现的 scheme（Chromium 系各家 + Firefox） */
const NEWTAB_SCHEMES = new Set(['chrome:', 'edge:', 'brave:', 'opera:', 'vivaldi:', 'about:']);

/** 原生新标签页的路径部分（chrome://newtab/、edge://startpage/、about:home …） */
const NEWTAB_PATHS = new Set(['newtab', 'home', 'startpage']);

/**
 * 该地址是不是浏览器原生新标签页。
 *
 * 例：`chrome://newtab/`、`edge://newtab/`、`about:newtab`、`about:home` 为真；
 * `about:blank`、`chrome://extensions/`、`https://…` 与扩展页地址为假。
 * 查询串与 hash 会被忽略（`about:newtab#x` 仍算原生页）。
 */
export function isNativeNewtabUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const cut = url.search(/[?#]/);
  const clean = (cut >= 0 ? url.slice(0, cut) : url).replace(/\/+$/, '');
  const m = /^([a-z][a-z0-9+.-]*):(?:\/\/)?(.*)$/i.exec(clean);
  if (!m) return false;
  return NEWTAB_SCHEMES.has(`${m[1].toLowerCase()}:`) && NEWTAB_PATHS.has(m[2].toLowerCase());
}

/** 只有在接管开关打开时，命中的新标签页才需要被换成待办页 */
export function shouldTakeOverNewtab(url: string | null | undefined, override: boolean): boolean {
  return override && isNativeNewtabUrl(url);
}
