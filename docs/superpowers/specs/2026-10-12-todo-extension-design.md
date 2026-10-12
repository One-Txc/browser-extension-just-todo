# Todo 浏览器插件 · 设计文档（V1）

- 日期：2026-10-12
- 状态：**需求决策已确认（2026-10-12，见第 15 节）**，下一步编写实现计划（writing-plans）
- 交互基线：`previews/` 下三套静态预览（已逐轮确认：全页面、极简字段、完成沉底、归档显示分组、新建可选分组、双击编辑、已完成可恢复）
- 工程基线：参照 `D:\workspace\google-plugs\markdown_reader`（TypeScript + 原生 DOM + esbuild 自写构建）

---

## 1. 产品概述

一个纯本地的 Todo 浏览器扩展，点击图标在标签页打开；可选接管浏览器空白新标签页。

**核心功能（交互细节以预览稿为准）：**

- 任务增删改；状态：待办 ⇄ 已完成 → 归档
- 上部：待办与已完成混排，勾选即删除线置灰沉底，再点可恢复；分组 Tab（全部 + 自定义分组，带待办角标）
- 下部：归档区，默认显示最近 N 条，搜索覆盖**全部**归档；归档可恢复为待办、彻底删除
- 分组管理：新增 / 双击重命名 / 删除（活跃任务变「未分组」；**归档任务永久保留归档时的分组名**）
- 设置：三套主题、语言、归档显示条数、自动归档、新标签页接管开关、容量上限

**非目标（V1 不做）：**

- 云同步、账号体系、任务备注/截止日期/优先级/标签、拖拽排序、提醒通知、弹窗 Popup 形态

---

## 2. 入口与信息架构

两个 HTML 页面入口 + 一个 background，**共用同一份 Todo 应用代码**：

```
┌────────────────────────────────────────────────────────────┐
│  manifest（静态声明，无法运行时开关）                        │
│  · action（无 default_popup）                                │
│  · chrome_url_overrides.newtab = newtab.html                │
└────────────────────────────────────────────────────────────┘
        │ 点击图标                        │ 打开新标签页
        ▼                                 ▼
 background.ts                    newtab.html / newtab.ts
 chrome.action.onClicked          启动时读取 settings.newtabOverride
   ├─ 已存在 app 标签页 → 激活它      ├─ true  → mountApp()（与独立页完全相同）
   └─ 否则 chrome.tabs.create        └─ false → 渲染「已停用」极简空白页
        (app.html)                             （内含「打开 Todo / 重新开启」入口）
                                       并监听 storage.onChanged 实时切换
        ▼
 app.html / app.ts（独立全页面）
   mountApp()：加载设置 → 初始化 i18n/主题 → 渲染整个 Todo 界面
   app.html#settings 可直接打开设置弹层（供停用页跳转）
```

**为什么 newtab 必须用「停用页」而不是真的恢复原生新标签页**：见第 11 节（浏览器安全限制）。

---

## 3. 技术栈

完全沿用参考项目，团队/工具链零额外学习成本：

| 项 | 选型 |
|---|---|
| 语言 | TypeScript（strict） |
| UI | **无框架**，原生 DOM；预览稿已验证「状态 → 全量 render()」模式 |
| 样式 | 一份 `app.css`，三套主题用 `<html data-theme="...">` + CSS 变量切换 |
| 构建 | esbuild + 自写 `scripts/build.mjs`（IIFE、CSS text loader、ASCII 兜底、`__BUILD_TIME__`、watch） |
| 扩展 API | 直接 `chrome.*`（Firefox 128+ 已支持 promise 形式），**源码零平台分支**，差异收敛到 manifest 生成层 |
| 存储 | `chrome.storage.local`（设置与数据都放 local；不依赖 sync/账号，三浏览器行为一致） |
| 测试 | esbuild 打包纯逻辑模块 + node 直接跑（store 层无 DOM，比参考项目的 jsdom 更简单） |
| 质量门 | `npm run check` = `tsc --noEmit` + 测试 + 双目标构建；无 ESLint/Prettier |

---

## 4. 目录结构

```
todo_just/
├─ package.json  tsconfig.json  README.md  AGENTS.md  TRANSLATING.md
├─ src/
│  ├─ background.ts               # action.onClicked → 打开/激活 app 标签页
│  ├─ app/
│  │  ├─ app.html                 # 独立全页面
│  │  ├─ app.ts                   # 独立页入口
│  │  ├─ app.css                  # 含三套 [data-theme] 变量（由预览稿合并而来）
│  │  ├─ newtab.html              # 接管空白页（与 app.html 同样的 #root）
│  │  ├─ newtab.ts                # 壳：读开关 → mountApp() 或停用页
│  │  ├─ mount.ts                 # mountApp(root)：i18n/主题/数据装配
│  │  ├─ state.ts                 # 内存状态 + 变更后调度 render
│  │  └─ components/
│  │     ├─ tabs.ts  task-list.ts  archive-list.ts  add-row.ts
│  │     ├─ settings-modal.ts  group-modal.ts  toast.ts  disabled-page.ts
│  ├─ shared/
│  │  ├─ store.ts                 # ★ 数据 CRUD、归档快照、上限裁剪、持久化
│  │  ├─ settings.ts              # 设置模型 + DEFAULT + 白名单/clamp 校验
│  │  ├─ i18n.ts                  # t()/setLocale()，照搬参考项目
│  │  ├─ themes.ts                # 主题 catalog（id / 名称 key / 明暗色）
│  │  └─ action-compat.ts         # chrome.action ?? chrome.browserAction
│  └─ types/globals.d.ts          # browserAction 等手工类型补丁
├─ _locales/
│  ├─ zh_CN/messages.json         # 基准语言，V1 只要求这份完整
│  └─ en/messages.json            # V1 同步提供
├─ icons/                         # make-icons.py 由源 SVG 生成 16/32/48/128
├─ scripts/
│  ├─ build.mjs  manifest.mjs  package.py  check-locales.py  make-icons.py
│  └─ test-store.mjs              # 数据层测试（快照/裁剪/上限/删除分组）
├─ previews/                      # 已确认的静态预览（保留，不进构建）
└─ output/  dist/                 # 生成物（gitignore）
```

---

## 5. manifest 与多浏览器策略

由 `scripts/manifest.mjs` 一份公共配置 + 目标覆盖生成，**Chrome 与 Edge 共用同一份 MV3 产物**（Edge 可直接加载/上架 Chromium 包），Firefox 为 MV2。

| 项 | MV3（Chrome / Edge） | MV2（Firefox ≥128） |
|---|---|---|
| manifest_version | 3 | 2 |
| 点击图标 | `action: {}`（不设 popup → 触发 onClicked） | `browser_action: {}` |
| 接管新标签页 | `chrome_url_overrides: { newtab }` | 同字段，原生支持 |
| 后台 | `background.service_worker` | `background.scripts` + `persistent: false` |
| 权限 | 仅 `["storage"]` | 仅 `["storage"]` |
| 其他 | `minimum_chrome_version: "111"` | `browser_specific_settings.gecko`（id + strict_min_version 128） |
| content_scripts / host_permissions / web_accessible_resources | **均不需要** | 同 |

**唯一的 API 兼容点**（封装在 `shared/action-compat.ts`）：

```ts
const nav = chrome.action ?? (chrome as any).browserAction;
nav.onClicked.addListener(() => openOrFocusApp());
```

**打开/激活逻辑（background.ts）**：先 `chrome.tabs.query` 查找已打开的 `app.html`，找到则切换到该标签页（必要时切窗口），否则 `chrome.tabs.create`。

**构建命令与产物**（照搬参考项目）：

```
npm run build          # → output/MV3   （Chrome/Edge 加载此目录）
npm run build:firefox  # → output/MV2   （Firefox 加载此目录）
npm run watch
npm run check          # typecheck + 测试 + 双构建
npm run package        # 生成 dist/todo-just-{version}-{MV3,MV2}.zip，含违禁文件检查
```

---

## 6. 数据模型与持久化

### 6.1 存储布局（chrome.storage.local）

```
todo:settings:v1 → TodoSettings
todo:data:v1     → { version: 1, groups: Group[], tasks: Task[], archived: ArchivedTask[] }
```

单 key 存放全部业务数据，写入走「全量覆盖」（数据量有上限，见 6.4）；`version` 字段供未来迁移，store 内预留 `migrate()` 钩子。

### 6.2 类型定义

```ts
interface Group {
  id: string;                 // 生成规则：g_<时间戳>_<随机串>
  name: string;
  createdAt: number;
}

interface Task {              // 活跃任务（待办 + 已完成）
  id: string;
  title: string;
  done: boolean;
  gid: string | null;         // null = 未分组；分组被删时置 null
  createdAt: number;
  completedAt: number | null;
}

interface ArchivedTask {
  id: string;
  title: string;
  gid: string | null;         // 归档瞬间的分组 id（之后分组被删也不动）
  groupName: string | null;   // ★ 归档瞬间的分组名快照，永久保留
  archivedAt: number;
}

interface TodoSettings {
  locale: 'auto' | 'zh_CN' | 'en';
  theme: 'auto' | 'soft' | 'minimal' | 'dark';  // auto 的解析见第 7 节
  autoArchive: boolean;       // 勾选完成直接进归档（默认 false）
  archiveVisible: number;     // 归档区默认显示条数（默认 10）
  newtabOverride: boolean;    // 是否在接管页显示 Todo（默认 true）
  activeLimit: number;        // 活跃任务容量上限（默认 50）
  archiveLimit: number;       // 归档容量上限（默认 100）
}
```

### 6.3 关键行为（对应需求第 5 点）

- **归档**：写入 `archived` 前从 groups 查当时名称写入 `groupName`；归档项**永不引用分组表**。
  - 之后分组被删除/改名 → 归档项仍显示归档时的组名（分组改名是否同步到旧归档：**不联动**，保持时间点语义，可预测）
  - 未分组任务归档 → `gid=null, groupName=null`，UI 显示「未分组」
  - 归档搜索同时匹配标题与 `groupName` 快照
- **删除分组**：该组活跃任务 `gid → null`；归档数据完全不动
- **排序**：待办按 createdAt 升序；已完成按 completedAt 沉底；归档按 archivedAt 倒序
- **恢复归档**：任务回到活跃区为待办；若原分组已不存在则为未分组（`gid=null`）
- **设置变更**：store 保存后派发 `storage.onChanged`，已打开的 newtab/app 页面自动刷新（跨标签页实时一致）

### 6.4 容量上限（对应需求第 4 点）

| 设置 | 默认值 | 范围 | 超限行为 |
|---|---|---|---|
| activeLimit 活跃任务上限 | **50** | 20–1000 | 新增被阻止，输入框提示「已达上限（N），请先完成或归档」 |
| archiveLimit 归档容量上限 | **100** | 50–5000 | 归档写入后自动**静默淘汰最旧**，归档区底部显示「仅保留最近 N 条归档」提示 |
| archiveVisible 默认显示条数 | **10** | 1–100 | 仅影响展示，不删数据；搜索始终覆盖全部 |

- 调小 archiveLimit 保存时立即执行一次裁剪
- 上限校验与 clamp 集中在 `settings.ts`（照搬参考项目「storage 可能是脏数据」的防御式 load）
- 默认值是建议值，**最终由你确认**（见第 12 节）

### 6.5 测试（scripts/test-store.mjs，node 运行）

归档快照正确性、删除分组不影响归档、归档淘汰顺序、恢复归档时原组已不存在、上限阻止新增、排序、设置 clamp。

---

## 7. 主题系统（对应需求第 1 点）

三套已确认预览 + 一个「跟随系统」选项，共 4 个主题设置值：

| id | 名称（zh_CN） | 说明 |
|---|---|---|
| auto | 跟随系统（**默认**） | 浅色系统 → soft；深色系统 → dark。监听系统外观变化实时切换 |
| soft | 柔和明亮 | 蓝紫渐变 + 大圆角卡片（预览方案 A） |
| minimal | 极简专业 | Linear/Notion 风（预览方案 B） |
| dark | 暗色专注 | 深炭灰 + 青绿（预览方案 C） |

实现：三套预览的内联 CSS 合并为 `app.css`，公共规则一份，变量分挂：

```css
:root[data-theme="soft"]    { --bg:…; --primary:…; … }
:root[data-theme="minimal"] { … }
:root[data-theme="dark"]    { …; color-scheme: dark; }
```

`resolveTheme(theme)`：`theme !== 'auto'` 直接用；`auto` 时读
`matchMedia('(prefers-color-scheme: dark)')`，深色 → `dark`，否则 → `soft`。
页面挂载时解析一次并把结果写入 `<html data-theme>`；当设置值为 auto 时监听该媒体查询的
`change` 事件实时更新（所有已打开页面各自监听）。minimal 仅手动可选，不参与系统联动。

切换 = 改设置 → 重算 data-theme 并持久化，瞬时生效无需刷新；停用页跟随同一套变量（关闭接管时显示与当前主题一致的空白页）。

---

## 8. 国际化（对应需求第 2 点）

照搬参考项目方案：

- Chrome 标准 `_locales/<locale>/messages.json`（`{key:{message,description}}`，`$1` 占位符）+ `shared/i18n.ts` 的 `t()`，**支持运行时手动切换**（这是不用裸 `chrome.i18n.getMessage` 的原因）
- 回退链：手动语言 → 浏览器语言（auto）→ zh_CN → key 本身
- V1 语言：**简体中文（基准，必须完整）+ English**；加日/韩只需新增 JSON + i18n.ts 登记一行，缺 key 只警告不阻塞（`check-locales.py`）
- JS 中 `t('key')`；HTML 中 `data-i18n / -placeholder / -title`，启动统一填充；切换语言 = setLocale + 重跑 render()
- 扩展商店名称/描述走 `__MSG_extName__`，`default_locale: zh_CN`

**文案范围**：界面所有可见文案（含「未分组」「已完成 N」「已达上限」等）、设置说明、停用页说明；任务数据与用户分组名不翻译。

---

## 9. 设置面板

预览中的设置弹层扩充为四组（同弹层内分区，不另开 options 页）：

```
外观    主题 [跟随系统 ▾]      语言 [跟随浏览器 ▾]
        （主题：跟随系统/柔和明亮/极简专业/暗色专注）
归档    默认显示条数 [10]      自动归档 [开关]
容量    活跃任务上限 [200]     归档容量上限 [500]
新标签页 接管空白标签页 [开关]
        └ 说明文案：关闭后，新标签页将显示空白页；
          如需完全恢复浏览器原生新标签页，请到浏览器扩展管理中关闭本扩展的新建标签页权限。
```

设置即时保存生效；底部保留构建时间（`__BUILD_TIME__`）便于开发期确认加载版本。

---

## 10. 页面与组件（渲染模型）

- 单一内存状态 `{settings, groups, tasks, archived, currentGroup, keyword}`；任何操作改 store → 重取状态 → `render()`；与预览稿一致，无虚拟 DOM
- 行内编辑/下拉等瞬态 UI 不受全量 render 影响的处理沿用预览稿方式（编辑时替换为 input，保存后才触发 render）
- toast 用于：达上限、归档被裁剪提示、恢复成功等
- 空状态：无任务 / 分组下无任务 / 归档搜索无结果

---

## 11. 新标签页接管的浏览器限制与对策（重点）

**限制（Chrome / Edge / Firefox 共同）**：

1. `chrome_url_overrides.newtab` 只能在 manifest 中静态声明，**没有运行时 API 可以取消接管**。
2. 扩展页面无权导航到 `chrome://newtab` / `about:newtab`，因此「开关关闭时跳回原生新标签页」技术上不可行（所有同类扩展，包括 Momentum，都是这个约束）。

**对策（本方案的「可配置」语义）：**

- 扩展始终持有接管声明；`newtabOverride` 开关控制**接管页显示什么**
- 开：完整 Todo（与独立页一致，并响应设置实时切换）
- 关：极简空白页（跟随主题背景，右上角小齿轮可重新开启或跳转独立页）
- 设置说明中如实写明：要恢复浏览器**原生**新标签页，需在扩展管理页关闭对应权限/移除接管
- Edge 与 Firefox 机制相同，无额外分支

---

## 12. 图标与资源

- `icons/source.svg` 一个源图（✦ 圆角方块，三套主题色中取中性蓝紫渐变），`make-icons.py` 生成 16/32/48/128 PNG（用 `uv run --with Pillow scripts/make-icons.py`，遵循本机 Python 走 uv 的约定）
- 无自定义字体、无外部网络请求（扩展完全离线工作）

---

## 13. V1 实施里程碑（确认后细化为 plan）

1. 工程骨架：package.json / tsconfig / build.mjs / manifest.mjs，空 newtab + app 双入口能在三浏览器加载
2. shared 层：settings.ts、store.ts + 数据层测试
3. i18n + zh_CN/en 语言包
4. 应用主体：从预览稿迁移 HTML/CSS/JS → TS 组件 + app.css 三套主题变量 + auto 解析
5. 设置弹层、分组管理、toast、容量提示
6. newtab 壳 + 停用页 + background 打开/激活逻辑 + storage.onChanged 联动
7. 图标、AGENTS.md、README（三浏览器加载/打包说明）、双目标 package

---

## 14. 风险与限制

| 风险 | 说明 / 缓解 |
|---|---|
| Firefox MV2 生命周期 | Mozilla 仍接受 MV2 加载/上架（≥128）；与参考项目相同策略，未来 MV3 迁移只需在 manifest.mjs 加目标 |
| 全量 render 性能 | 上限内（千条级）无压力；archiveVisible 控制默认渲染数；搜索结果如过大再加分批（V1 不做） |
| storage.local 写放大 | 每次操作全量覆盖保存；千条任务、每条几十字节，量级远低于 local 的 10MB 配额 |
| 无法真正恢复原生 newtab | 第 11 节已述，用停用页 + 文案诚实处理 |
| 非 ASCII 构建 | build.mjs 的 ASCII 兜底插件直接照搬 |

---

## 15. 决策记录（2026-10-12 已确认）

1. 容量默认值：**活跃 50 / 归档 100 / 默认显示 10**；范围保持 20–1000、50–5000、1–100。
2. 设置与数据统一用 **chrome.storage.local**，不做跨设备同步。
3. 归档分组名采用**归档瞬间快照**，之后分组改名/删除不影响旧归档显示。
4. 接受 newtab 开关的停用页语义（无法程序化恢复原生新标签页，见第 11 节）。
5. 新标签页接管**默认开启**（`newtabOverride: true`）。
6. V1 语言：**zh_CN（基准）+ en**。
7. 主题：soft / minimal / dark 三套 + **「跟随系统」auto（默认项）**，auto 在浅/深系统下分别对应 soft / dark。
