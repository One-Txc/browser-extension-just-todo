# AGENTS.md

给在本仓库工作的自动化代理与贡献者的约定。

## 文档
设计文档： docs/设计文档.md

## 约定
- 代码更新完执行一下`npm run build`更新output
- 减少无关的测试，只专注于当前做的功能。

## 国际化规则

- **文案出处只有 `_locales/zh_CN/messages.json`**：新增/修改界面文案只维护这一份，`en` 在需要时同步，不阻塞开发，英文不明确说明不需要维护。。
- **界面文案一律走 i18n**：静态节点用 `data-i18n` / `data-i18n-placeholder` / `data-i18n-title`，动态文案用 `t(key, [subs...])`。不要在 TS 里硬编码界面文案。
  - 例外：设置面板里语言选择器的**语言自称**（`简体中文` / `English`）按惯例用各自母语字面量书写，与当前界面语言无关。
- **产物必须是纯 ASCII**：Chrome 加载扩展时会校验脚本编码，产物里残留非 ASCII 字节会被拒载。构建脚本（`scripts/build.mjs`）用 esbuild `charset: 'ascii'` + 构建后兜底转义（正则字面量也覆盖），并在构建期断言产物为纯 ASCII——**构建失败即说明有未转义的非 ASCII 漏出**，不要绕过。
- 占位符沿用 Chrome 语法 `$1 $2 …`；`t()` 查不到 key 时返回 key 本身，便于发现漏翻。
- 如何国际化参考文档：docs/TRANSLATING.md

## 目录约定

- `src/shared/`：与运行环境无关的逻辑（数据模型、设置、i18n、主题、跨版本 API 适配），可直接在 node 下测试。
- `src/app/`：扩展页面。组件在模块加载时 `registerRenderer`，`ctx.render()` 时统一重跑；事件用 `onXxx = ` 赋值（而非 `addEventListener`）以免重渲染后重复绑定。
- `src/newtab/`：新标签页入口与视图路由。
- `tests/`：`*.test.ts`，由 `scripts/test.mjs` 打包后在 node 内置 test runner 运行；UI 测试在 `tests/helpers/dom.ts` 里挂 jsdom。

## 原则

- **零平台分支**：MV2/MV3、Chrome/Firefox 的差异只体现在 `scripts/manifest.mjs`（清单字段）与 `src/shared/action-compat.ts`（`action` vs `browserAction`）两处；业务代码不分平台。
- **数据只存本地**：只用 `chrome.storage.local`，不引入任何网络请求。
- **脏数据容错**：从 storage 读入的数据一律先 `normalizeRepo` / `normalizeSettings` 过滤，缺字段、超范围都回落到默认值。
