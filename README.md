# Just Todo

简洁的分组待办清单浏览器扩展：分组标签页、勾选沉底、一键归档、归档搜索，数据全部存在本地，可作为新标签页。

> **名字的意思**：就只做待办。分组、勾选、归档、搜索这四件事做到顺手为止，不再往上堆项目管理、协作、看板那类复杂功能。

## 功能

- **分组**：任务可归属分组；标签栏切换（切完光标直接落在新增输入框，可立刻录入），角标显示未完成数；「全部」标签下新增行右侧可选分组。
- **任务**：列表顶部常驻新增行，回车确认；双击标题行内重命名；勾选完成沉到「已完成」分隔线下方，可恢复为待办。
- **拖拽排序**：待办与已完成两个列表都能拖拽调整顺序（**直接按住行内空白处拖**，或抓住行左侧的手柄；标题文字本身留给左键划选复制；只在本列表内重排）。勾选完成排到已完成最前；顺序存在本地，跨标签页同步。新建任务插到最前还是最后由设置决定（默认最后）。
- **记忆位置**：停留的分组 Tab、归档区展开态、以及「全部」标签下新建行选中的分组都会记住，刷新或下次打开新标签页回到原处；分组被删除时自动回落。
- **归档**：完成的任务归档后进入归档区，保留归档时的分组名快照；支持搜索（覆盖全部归档，不受默认显示条数限制）、恢复、彻底删除；达到容量上限自动裁剪并常驻提示；**调小归档上限不会当场删数据，刷新页面后才按新上限裁剪**。归档区**默认折叠**（头部显示总数，点击展开，展开态会被记住）。
- **设置**：主题（跟随系统 / 柔和明亮 / 极简专业 / 暗色专注 / 护眼模式）、语言（跟随浏览器 / 简体中文 / English）、新建任务位置（最前 / 最后）、归档显示条数、自动归档开关、活跃与归档容量上限、新标签页接管开关；**改动即时保存**，无需点确认。
- **新标签页**：默认接管（后台监听新标签页事件并重定向到待办页）；关闭接管后新标签页交还浏览器原生页面。扩展自己的新标签页页面恒为 Todo，没有「已关闭」占位页。
- **跨标签页同步**：多个页面打开时，一侧改动另一侧自动刷新；正在行内编辑时不打断输入。

数据仅保存在浏览器本地（`chrome.storage.local`），不上传、不联网。

## 安装

先构建，再把对应目录作为「已解压的扩展」载入。

```bash
npm install
npm run build:all      # 产出 output/MV3（Chrome/Edge）与 output/MV2（Firefox）
```

- **Chrome / Edge**：打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」，点「加载已解压的扩展程序」，选择 `output/MV3`。
- **Firefox**：打开 `about:debugging#/runtime/this-firefox`，点「临时载入附加组件」，选择 `output/MV2/manifest.json`。
- 点扩展图标可打开/激活唯一的待办标签页。

### 新标签页接管的方式与代价

浏览器没有「运行时开关新标签页接管」的 API：`chrome_url_overrides` 是清单静态声明，一旦声明就无法在运行时取消，扩展页也无权导航回 `chrome://newtab`。因此本扩展**不声明静态覆盖**，改由 background 监听 `tabs.onCreated` / `tabs.onUpdated`，发现原生新标签页（`chrome://newtab/`、`edge://newtab/`、`about:newtab` …）且开关打开时，把它重定向到待办页。

- 关闭「接管空白标签页」后，新标签页**真的回到浏览器原生页面**；扩展页本身没有「已关闭」占位态，任何落到它的标签页都直接显示 Todo。
- 代价一：需要 `tabs` 权限（安装/更新时提示「读取您的浏览记录」）。
- 代价二：重定向发生在原生页提交之后，可能闪一帧原生页；浏览器刚启动时后台脚本需唤醒，闪现更明显。
- 代价三：重定向是普通导航，地址栏会显示扩展地址，且该标签页会留下一条「新标签页」的后退记录。
- 完全不想要任何接管行为时，直接在扩展管理页禁用本扩展即可。

## 开发

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建 Chrome/Edge（MV3）产物到 `output/MV3` |
| `npm run build:firefox` | 构建 Firefox（MV2）产物到 `output/MV2` |
| `npm run build:all` | 依次构建两个目标 |
| `npm run watch` | MV3 监听重建（开发时配合 `chrome://extensions` 刷新） |
| `npm run preview` | 生成主题预览页 `previews/theme-preview.html`（真实 CSS/骨架 + 主题切换条） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行测试（node:test + jsdom） |
| `npm run check` | 提交门：类型 + 测试 + 双构建 |
| `npm run check:locales` | 校验语言包（以 zh_CN 为基准） |
| `npm run package` | 构建并打包为 `dist/todo-just-<版本>-MV3.zip` 与 `-MV2.zip` |

技术栈：TypeScript（strict）+ esbuild 双目标打包 + 原生 DOM，无框架。

## 目录

```
src/
  shared/     store（数据模型与纯函数）、settings、i18n、themes、action-compat、newtab-url（原生新标签页地址识别）
  app/        独立页：mount、context、组件（tabs / task-list / add-row / 归档 / 分组弹层 / 设置弹层 / toast）
  newtab/     新标签页壳与视图路由
  background.ts 点图标打开/激活待办页；新标签页接管重定向
_locales/     语言包（zh_CN 为基准）
icons/        图标（source.svg + 生成脚本）
scripts/      构建 / 测试 / 图标 / 校验 / 打包
```

更深入的约定见 [AGENTS.md](AGENTS.md) 与 [TRANSLATING.md](docs/TRANSLATING.md)。
