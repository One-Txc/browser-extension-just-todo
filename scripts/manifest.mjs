import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const VERSION = pkg.version;
const NAME = 'Just Todo';

export const LAYOUT = {
  chrome:  { extRoot: 'output/MV3', outDir: 'output/MV3/build', manifestPath: 'output/MV3/manifest.json', needsPrefix: true },
  firefox: { extRoot: 'output/MV2', outDir: 'output/MV2/build', manifestPath: 'output/MV2/manifest.json', needsPrefix: true },
};
const GECKO_ID = 'todo-just@local.extension';
const GECKO_MIN_VERSION = '128.0';
const ICONS = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };

export function buildManifest(target) {
  const p = (f) => (LAYOUT[target].needsPrefix ? `build/${f}` : f);
  const common = {
    name: '__MSG_extName__',
    version: VERSION,
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    /*
     * 不声明 chrome_url_overrides：静态覆盖没有运行时开关，关掉「接管」也只能显示
     * 一张空白页。改为 background 监听新标签页事件后重定向（需要 tabs 权限读地址），
     * 关闭开关即可真正交还浏览器原生新标签页。见 docs/设计文档.md 第 11 节。
     */
    permissions: ['storage', 'tabs'],
    icons: ICONS,
  };
  if (target === 'firefox') {
    return {
      ...common,
      manifest_version: 2,
      background: { scripts: [p('background.js')], persistent: false },
      browser_action: { default_title: NAME, default_icon: ICONS },
      browser_specific_settings: { gecko: { id: GECKO_ID, strict_min_version: GECKO_MIN_VERSION } },
    };
  }
  return {
    ...common,
    manifest_version: 3,
    minimum_chrome_version: '111',
    background: { service_worker: p('background.js'), type: 'classic' },
    action: { default_title: NAME, default_icon: ICONS },
  };
}
