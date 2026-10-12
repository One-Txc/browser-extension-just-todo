import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const VERSION = pkg.version;
const NAME = 'Todo Just';

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
    permissions: ['storage'],
    icons: ICONS,
    chrome_url_overrides: { newtab: p('newtab.html') },
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
