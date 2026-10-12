/**
 * 生成主题预览页：previews/theme-preview.html
 *
 * 为什么用生成而不是手写一份 mockup：
 *   手写的预览稿会和 app.css 悄悄漂移（预览好看、真机走样）。这里直接读
 *   `src/app/app.css`（真实主题变量）+ `src/app/app-template.ts`（真实骨架）
 *   + `src/app/icons.ts`（真实图标）+ `_locales/zh_CN`（真实文案），
 *   拼成一个自包含静态页，另加一条只在预览里用的主题切换条。
 *
 * 用法：node scripts/make-preview.mjs   （改完 app.css 或骨架后重跑）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'previews/theme-preview.html';

const css = readFileSync('src/app/app.css', 'utf8');
const tplSrc = readFileSync('src/app/app-template.ts', 'utf8');
const APP_HTML = tplSrc.slice(tplSrc.indexOf('`') + 1, tplSrc.lastIndexOf('`'));
const messages = JSON.parse(readFileSync('_locales/zh_CN/messages.json', 'utf8'));
const M = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v.message]));

const iconSrc = readFileSync('src/app/icons.ts', 'utf8');
const ICON = {};
for (const m of iconSrc.matchAll(/^\s{2}(\w+):\s*'([^']*)'/gm)) ICON[m[1]] = m[2];

const sub = (key, ...args) => args.reduce((s, a) => s.replace('$1', a), M[key]);

/** 一条任务行（结构照抄 task-list.ts 的 rowHtml） */
const row = (title, { done = false, group = null } = {}) => `
    <li class="task${done ? ' done' : ''}" data-id="t">
      <span class="grip" aria-hidden="true">${ICON.grip}</span>
      <button class="check">${ICON.check}</button>
      <span class="title${done ? '' : ' editable'}"${done ? '' : ` title="${M.editHint}"`}>${title}</span>
      ${group ? `<span class="g-tag">${group}</span>` : ''}
      <span class="ops">${done
        ? `<button class="op">${ICON.undo}</button><button class="op">${ICON.box}</button>`
        : `<button class="op">${ICON.edit}</button>`}<button class="op del">${ICON.trash}</button></span>
    </li>`;

const aItem = (title, group, date) => `
      <li class="a-item" data-id="a"><span class="a-dot"></span><span class="a-title">${title}</span>
        <span class="g-tag">${group}</span><span class="a-date">${date}</span>
        <span class="ops"><button class="op">${ICON.undo}</button><button class="op del">${ICON.trash}</button></span>
      </li>`;

/** 设置弹层（结构照抄 settings-modal.ts，含两个分组 tab） */
const modal = `
  <div class="mask show" id="previewMask"><div class="modal">
    <h3>${M.settingsTitle}</h3>
    <p class="modal-note">${M.settingsAutoSave}</p>
    <nav class="modal-tabs">
      <button class="modal-tab active">${M.settingsBasic}</button>
      <button class="modal-tab">${M.settingsAdvanced}</button>
    </nav>
    <div class="settings-pane">
      <div class="setting-row"><div>${M.setTheme}</div><select><option>${M.themeAuto}</option><option>${M.themeSoft}</option><option>${M.themeMinimal}</option><option>${M.themeDark}</option><option selected>${M.themeEyeCare}</option></select></div>
      <div class="setting-row"><div>${M.setLocale}</div><select><option>${M.localeAuto}</option><option selected>简体中文</option><option>English</option></select></div>
      <div class="setting-row"><div><div>${M.setNewTaskPosition}</div><small>${M.setNewTaskPositionHint}</small></div><select><option selected>${M.newTaskLast}</option><option>${M.newTaskFirst}</option></select></div>
      <div class="setting-row"><div><div>${M.setAutoArchive}</div><small>${M.setAutoArchiveHint}</small></div><input type="checkbox" class="switch"></div>
      <div class="setting-row"><div><div>${M.setNewtab}</div><small>${M.setNewtabHint}</small></div><input type="checkbox" class="switch" checked></div>
    </div>
    <div class="settings-pane" hidden>
      <div class="setting-row"><div><div>${M.setArchiveVisible}</div><small>${M.setArchiveVisibleHint}</small></div><input type="number" value="10"></div>
      <div class="setting-row"><div><div>${M.setActiveLimit}</div><small>${M.setActiveLimitHint}</small></div><input type="number" value="50"></div>
      <div class="setting-row"><div><div>${M.setArchiveLimit}</div><small>${M.setArchiveLimitHint}</small></div><input type="number" value="100"></div>
    </div>
    <div class="modal-actions"><button class="btn primary">${M.close}</button></div>
  </div></div>`;

const tasks = [
  row('把季度复盘写成文档', { group: '工作' }),
  row('给设计稿补上暗色主题', { group: '工作' }),
  row('买猫粮和猫砂', { group: '生活' }),
  `    <div class="done-divider"><span>${sub('doneDivider', '2')}</span><span class="rule"></span><button class="archive-all">${sub('archiveAll', '2')}</button></div>`,
  row('回复上周的邮件', { done: true, group: '工作' }),
  row('整理桌面文件夹', { done: true }),
].join('');

const tabs = `
      <button class="tab active" data-g="all">${M.tabAll}<span class="badge">3</span></button>
      <button class="tab" data-g="g1">工作<span class="badge">2</span></button>
      <button class="tab" data-g="g2">生活<span class="badge">1</span></button>
      <button class="tab add" title="${M.manageGroups}">+</button>`;

const archives = [
  aItem('上线前的回归清单', '工作', '03-14'),
  aItem('把旧硬盘的资料归档', '生活', '03-12'),
  aItem('清理订阅与账单', '生活', '03-08'),
  aItem('整理面试题库', '工作', '02-28'),
].join('');

/** 把真实骨架里的占位换成示例内容 + 真实文案 */
const page = APP_HTML
  .replace('<nav class="tabs" id="tabs"></nav>', `<nav class="tabs" id="tabs">${tabs}</nav>`)
  .replace('<ul class="task-list" id="taskList"></ul>', `<ul class="task-list" id="taskList">${tasks}</ul>`)
  .replace('<span class="sub" id="archiveSub"></span>', `<span class="sub" id="archiveSub">${sub('archiveSubRecent', '4')}</span>`)
  .replace('<span class="a-count" id="archiveCount"></span>', '<span class="a-count" id="archiveCount">4</span>')
  .replace('<ul class="archive-list" id="archiveList"></ul>', `<ul class="archive-list" id="archiveList">${archives}</ul>`)
  .replace('<div class="archive-foot" id="archiveFoot"></div>', `<div class="archive-foot" id="archiveFoot">${sub('archiveFootTotal', '4')}</div>`)
  .replace('class="card archive-card collapsed"', 'class="card archive-card"') // 预览里展开归档，好一起看配色
  .replace('data-i18n-title="archiveToggleHint"', `title="${M.archiveToggleHint}"`)
  // 骨架里剩下的 data-i18n / placeholder / title 用真实语言包填上
  .replace(/(data-i18n=")([\w]+)("[^>]*>)/g, (_s, a, key, c) => `${a}${key}${c}${M[key] ?? key}`)
  .replace(/data-i18n-placeholder="([\w]+)"/g, (_s, key) => `placeholder="${M[key] ?? key}"`)
  .replace(/data-i18n-title="([\w]+)"/g, (_s, key) => `title="${M[key] ?? key}"`);

const THEMES = [
  ['auto', M.themeAuto],
  ['soft', M.themeSoft],
  ['minimal', M.themeMinimal],
  ['dark', M.themeDark],
  ['eyecare', M.themeEyeCare],
];

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="eyecare">
<head>
<meta charset="UTF-8">
<title>Todo Just 主题预览</title>
<style>
${css}
/* ---- 以下仅预览页使用，不进产物 ---- */
.preview-bar {
  position: fixed; right: 16px; bottom: 16px; z-index: 60; display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 999px; background: rgba(18, 22, 28, .86); color: #fff;
  font-size: 12.5px; font-family: inherit; box-shadow: 0 10px 30px rgba(0, 0, 0, .3); backdrop-filter: blur(6px);
}
.preview-bar button {
  border: 1px solid rgba(255, 255, 255, .22); background: transparent; color: inherit; font-family: inherit;
  font-size: 12.5px; padding: 5px 10px; border-radius: 999px; cursor: pointer; transition: .13s;
}
.preview-bar button:hover { background: rgba(255, 255, 255, .14) }
.preview-bar button.on { background: #fff; color: #12161c; border-color: #fff }
.preview-hint { color: rgba(255, 255, 255, .6); margin-right: 2px }
</style>
</head>
<body>
<div id="root">${page}</div>
${modal}

<div class="preview-bar">
  <span class="preview-hint">主题</span>
  ${THEMES.map(([id, label]) => `<button data-set="${id}"${id === 'eyecare' ? ' class="on"' : ''}>${label}</button>`).join('')}
  <button id="previewModal">设置弹层</button>
</div>

<script>
  // 主题切换（预览专用）：直接改 <html data-theme>，跟扩展里 setTheme 的做法一致
  const root = document.documentElement;
  const paint = (id) => {
    const resolved = id === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'soft')
      : id;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
    document.querySelectorAll('.preview-bar [data-set]').forEach((b) => b.classList.toggle('on', b.dataset.set === id));
  };
  document.querySelectorAll('.preview-bar [data-set]').forEach((b) => { b.onclick = () => paint(b.dataset.set); });
  // 支持 ?theme=dark 直接打开某套
  const wanted = new URLSearchParams(location.search).get('theme');
  paint(wanted || 'eyecare');

  // 设置弹层开关 + 两个分组 tab
  const mask = document.getElementById('previewMask');
  mask.classList.remove('show');
  document.getElementById('previewModal').onclick = () => mask.classList.toggle('show');
  mask.onclick = (e) => { if (e.target === mask) mask.classList.remove('show'); };
  document.querySelectorAll('.modal-tab').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.modal-tab').forEach((b) => b.classList.toggle('active', b === btn));
      const panes = document.querySelectorAll('.settings-pane');
      const index = [...document.querySelectorAll('.modal-tab')].indexOf(btn);
      panes.forEach((p, i) => { p.hidden = i !== index; });
    };
  });
</script>
</body>
</html>
`;

mkdirSync('previews', { recursive: true });
writeFileSync(OUT, html, 'utf8');
console.log(`[preview] ${OUT}  ${(html.length / 1024).toFixed(1)} KB  themes=${THEMES.map(([id]) => id).join('/')}`);
