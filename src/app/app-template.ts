/** 独立页静态骨架（结构取自预览稿 option-a，静态文案一律用 data-i18n 标记） */
export const APP_HTML = `
<div class="app">
  <header class="topbar">
    <div class="brand"><span class="logo">&#x2726;</span><span data-i18n="appTitle"></span></div>
    <button class="icon-btn" id="settingsBtn" data-i18n-title="settingsTitle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </header>

  <section class="card">
    <nav class="tabs" id="tabs"></nav>
    <!-- 新增行常驻在列表上方：任务变多时不用滚到底部才能新增；分组选择钉在右侧 -->
    <div class="add-row">
      <span class="plus">+</span>
      <input id="newTask" data-i18n-placeholder="addPlaceholder">
      <span id="groupPicker"></span>
    </div>
    <ul class="task-list" id="taskList"></ul>
  </section>

  <section class="card archive-card collapsed" id="archiveCard">
    <!-- 头部整行可点：默认折叠，点一下展开（状态记在 ui-state 里） -->
    <div class="archive-head" id="archiveHead" role="button" tabindex="0" aria-expanded="false" data-i18n-title="archiveToggleHint">
      <div class="archive-title">&#x1F4E6;<span data-i18n="archiveTitle"></span><span class="sub" id="archiveSub"></span><span class="a-count" id="archiveCount"></span></div>
      <div class="search-box" id="archiveSearchWrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" data-i18n-placeholder="searchPlaceholder">
      </div>
      <span class="chevron" aria-hidden="true"></span>
    </div>
    <div class="archive-body" id="archiveBody">
      <ul class="archive-list" id="archiveList"></ul>
      <div class="archive-foot" id="archiveFoot"></div>
    </div>
  </section>
</div>

<div class="mask" id="settingsMask"><div class="modal" id="settingsBody"></div></div>
<div class="mask" id="groupMask"><div class="modal" id="groupBody"></div></div>
<div class="toast" id="toast"></div>
`;
