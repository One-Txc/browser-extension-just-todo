import { registerRenderer, type AppContext } from '../context.ts';
import { t, applyI18n, setLocale } from '../../shared/i18n.ts';
import { THEME_OPTIONS } from '../../shared/themes.ts';
import { setTheme } from '../theme-host.ts';
import { esc } from '../icons.ts';
import type { TodoSettings, ThemeId, LocaleId } from '../../shared/settings.ts';

let current: AppContext | null = null;

/** 当前设置分组：打开弹层时总是回到「基本」，保存导致的重渲染不会把它切走 */
type SettingsTab = 'basic' | 'advanced';
let activeTab: SettingsTab = 'basic';

function fillBody(ctx: AppContext): void {
  const body = ctx.root.querySelector('#settingsBody') as HTMLElement | null;
  if (!body) return;
  const s = ctx.settings;
  const themeOpts = THEME_OPTIONS.map(
    (o) => `<option value="${esc(o.id)}"${s.theme === o.id ? ' selected' : ''}>${esc(t(o.labelKey))}</option>`
  ).join('');
  // 语言名以各自母语书写，与当前界面语言无关
  const localeOpts =
    `<option value="auto"${s.locale === 'auto' ? ' selected' : ''}>${esc(t('localeAuto'))}</option>` +
    `<option value="zh_CN"${s.locale === 'zh_CN' ? ' selected' : ''}>简体中文</option>` +
    `<option value="en"${s.locale === 'en' ? ' selected' : ''}>English</option>`;
  const posOpts =
    `<option value="last"${s.newTaskPosition === 'last' ? ' selected' : ''}>${esc(t('newTaskLast'))}</option>` +
    `<option value="first"${s.newTaskPosition === 'first' ? ' selected' : ''}>${esc(t('newTaskFirst'))}</option>`;

  body.innerHTML = `
    <h3 data-i18n="settingsTitle"></h3>
    <p class="modal-note" data-i18n="settingsAutoSave"></p>
    <nav class="modal-tabs">
      <button class="modal-tab${activeTab === 'basic' ? ' active' : ''}" data-tab="basic" data-i18n="settingsBasic"></button>
      <button class="modal-tab${activeTab === 'advanced' ? ' active' : ''}" data-tab="advanced" data-i18n="settingsAdvanced"></button>
    </nav>
    <div class="settings-pane" data-pane="basic"${activeTab === 'basic' ? '' : ' hidden'}>
      <div class="setting-row"><div data-i18n="setTheme"></div><select id="setTheme">${themeOpts}</select></div>
      <div class="setting-row"><div data-i18n="setLocale"></div><select id="setLocale">${localeOpts}</select></div>
      <div class="setting-row"><div><div data-i18n="setNewTaskPosition"></div><small data-i18n="setNewTaskPositionHint"></small></div><select id="setNewTaskPosition">${posOpts}</select></div>
      <div class="setting-row"><div><div data-i18n="setAutoArchive"></div><small data-i18n="setAutoArchiveHint"></small></div><input type="checkbox" class="switch" id="setAutoArchive"${s.autoArchive ? ' checked' : ''}></div>
      <div class="setting-row"><div><div data-i18n="setNewtab"></div><small data-i18n="setNewtabHint"></small></div><input type="checkbox" class="switch" id="setNewtab"${s.newtabOverride ? ' checked' : ''}></div>
    </div>
    <div class="settings-pane" data-pane="advanced"${activeTab === 'advanced' ? '' : ' hidden'}>
      <div class="setting-row"><div><div data-i18n="setArchiveVisible"></div><small data-i18n="setArchiveVisibleHint"></small></div><input type="number" id="setArchiveVisible" value="${s.archiveVisible}"></div>
      <div class="setting-row"><div><div data-i18n="setActiveLimit"></div><small data-i18n="setActiveLimitHint"></small></div><input type="number" id="setActiveLimit" value="${s.activeLimit}"></div>
      <div class="setting-row"><div><div data-i18n="setArchiveLimit"></div><small data-i18n="setArchiveLimitHint"></small></div><input type="number" id="setArchiveLimit" value="${s.archiveLimit}"></div>
    </div>
    <div class="modal-actions"><button class="btn primary" id="settingsDone" data-i18n="close"></button></div>
  `;
  applyI18n(body);
  // 切分组不重渲染：只翻 active / hidden，输入焦点不受影响
  body.querySelectorAll<HTMLElement>('.modal-tab').forEach((btn) => {
    btn.onclick = () => {
      activeTab = (btn.dataset.tab as SettingsTab | undefined) ?? 'basic';
      body.querySelectorAll<HTMLElement>('.modal-tab').forEach((b) => b.classList.toggle('active', b === btn));
      body.querySelectorAll<HTMLElement>('.settings-pane').forEach((p) => {
        p.hidden = p.dataset.pane !== activeTab;
      });
    };
  });
  const done = body.querySelector('#settingsDone');
  if (done) (done as HTMLElement).onclick = () => closeSettingsModal(ctx);
  // 改动即保存：change 覆盖下拉/勾选框的即时选择，以及数字框失焦或回车提交时。
  // 按钮因此只负责关弹层，不存在"忘了点保存"的情况。
  body.onchange = () => { void saveFromForm(ctx); };
}

/**
 * 设置生效后的副作用：语言/主题即时应用。
 *
 * 注意这里**不裁剪数据**：archiveLimit 调小只在页面加载时生效（见 mount.ts），
 * activeLimit 调小也不动已有任务，只在新增时拦（见 store.addTask）。
 */
export function applySettingsSideEffects(ctx: AppContext): void {
  setLocale(ctx.settings.locale);
  setTheme(ctx.settings.theme);
  applyI18n(ctx.root);
  ctx.render();
}

/** 从表单读一份完整设置（纯读 DOM，不落盘）；越界/非法值交给 normalizeSettings 收敛 */
function readForm(body: HTMLElement): Partial<TodoSettings> {
  const val = (id: string) => (body.querySelector('#' + id) as HTMLInputElement).value;
  const chk = (id: string) => (body.querySelector('#' + id) as HTMLInputElement).checked;
  return {
    theme: val('setTheme') as ThemeId,
    locale: val('setLocale') as LocaleId,
    archiveVisible: Number(val('setArchiveVisible')),
    autoArchive: chk('setAutoArchive'),
    activeLimit: Number(val('setActiveLimit')),
    archiveLimit: Number(val('setArchiveLimit')),
    newtabOverride: chk('setNewtab'),
    newTaskPosition: val('setNewTaskPosition') as TodoSettings['newTaskPosition'],
  };
}

/** 自动保存：把表单当前值写进设置并跑副作用（同值重写也安全） */
async function saveFromForm(ctx: AppContext): Promise<void> {
  const body = ctx.root.querySelector('#settingsBody') as HTMLElement | null;
  if (!body) return;
  await ctx.changeSettings(readForm(body));
  applySettingsSideEffects(ctx);
}

export function openSettingsModal(): void {
  if (!current) return;
  activeTab = 'basic'; // 每次打开都从「基本设置」开始
  current.modalOpen = true;
  fillBody(current);
  current.root.querySelector('#settingsMask')?.classList.add('show');
  (current.root.querySelector('#setTheme') as HTMLElement | null)?.focus();
}

function closeSettingsModal(ctx: AppContext): void {
  ctx.modalOpen = false;
  ctx.root.querySelector('#settingsMask')?.classList.remove('show');
}

function renderSettings(ctx: AppContext): void {
  current = ctx;
  const btn = ctx.root.querySelector('#settingsBtn');
  if (btn) (btn as HTMLElement).onclick = () => openSettingsModal();
  const mask = ctx.root.querySelector('#settingsMask') as HTMLElement | null;
  if (mask) {
    mask.onclick = (e) => {
      if (e.target === mask) closeSettingsModal(ctx);
    };
    if (mask.classList.contains('show')) {
      // 每次自动保存都会重渲染，弹层内容被重建：把焦点还给同一个控件，键盘操作不中断
      const focused = (document.activeElement as HTMLElement | null)?.id ?? '';
      fillBody(ctx);
      if (focused) (ctx.root.querySelector('#' + focused) as HTMLElement | null)?.focus();
    }
  }
}

registerRenderer(renderSettings);
