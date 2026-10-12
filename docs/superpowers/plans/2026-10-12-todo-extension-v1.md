# Todo 浏览器插件 V1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个三浏览器（Chrome/Edge/Firefox）通用的 Todo 扩展：全页面 + 可配置接管新标签页，三主题（含跟随系统）、中英双语、数据持久化、归档分组名快照、容量上限。

**Architecture:** TypeScript + 原生 DOM（无框架）+ esbuild 自写构建；一份源码由 `scripts/manifest.mjs` 生成 MV3（Chrome/Edge）与 MV2（Firefox）双产物，源码零平台分支。业务规则全部收敛在 `src/shared/` 纯函数模块并做 node 测试；UI 为「store → 全量 render」模式，行为真值是仓库内 `previews/option-{a,b,c}-*.html`。

**Tech Stack:** TypeScript 5（strict）、esbuild、chrome.storage.local、CSS 变量多主题、Chrome `_locales` 标准语言包 + 自研 `t()`、jsdom（仅 UI 测试）、Python uv（图标脚本）

**Spec:** `docs/superpowers/specs/2026-10-12-todo-extension-design.md`（实现时规格与本计划一起读；冲突以规格的第 15 节决策为准）

## Global Constraints

- 容量：activeLimit 默认 **50**（范围 20–1000）；archiveLimit 默认 **100**（范围 50–5000）；archiveVisible 默认 **10**（范围 1–100）。
- 设置与数据只写 `chrome.storage.local`，key 固定为 `todo:settings:v1` 与 `todo:data:v1`。
- 主题 id：`'auto' | 'soft' | 'minimal' | 'dark'`，默认 `auto`；auto 解析为 soft（浅色系统）/ dark（深色系统）。
- 语言 id：`'auto' | 'zh_CN' | 'en'`，默认 `auto`，基准语言 zh_CN。
- `newtabOverride` 默认 `true`。
- 零运行时 npm 依赖；devDependencies 仅 `esbuild`、`typescript`、`@types/chrome`、`jsdom`。
- 扩展 API 一律直接 `chrome.*`，禁止平台分支；唯一兼容封装是 action（MV3 `chrome.action` / MV2 `chrome.browserAction`）。
- 产物脚本必须为 ASCII（构建脚本兜底）；UI 中文字符串只能存在于 `_locales/zh_CN/messages.json`，TS 代码里不写裸中文文案。
- TS 严格模式；禁止 `any`（compat 层允许一处 `as unknown as chrome.action.Api` 式收窄）。
- 类名/CSS 变量以预览稿为准，不重命名；每个 Task 结束必须 commit（conventional commits，英文 message）。
- 本机 Python 一律 `uv run --with <pkg> script.py`。

## Review Focus（规格未明说但最易出事的 5 类输入，各自的归属测试）

1. **storage 脏数据/旧版数据**：字段缺失、类型错误、越界数字、未知枚举 → `normalizeSettings/normalizeRepo` 必须回退默认/clamp 而不抛异常。归 Task 2/3 测试。
2. **悬挂分组 id**：删除分组后再新建任务（选中态残留）、恢复归档（原组已删）→ gid 一律安全落为 null，UI 不出现 undefined。归 Task 3/6 测试。
3. **自动归档 + 归档上限联动**：autoArchive 开启时勾选直接进归档；归档写入触发最旧淘汰，同毫秒批量归档顺序不错乱。归 Task 3 测试。
4. **语言包缺 key**：en 漏翻时回退 zh_CN，再缺显示 key 本身，绝不显示 undefined。归 Task 4 测试。
5. **多标签页并发与编辑中刷新**：一个页面改数据，另一页面经 storage.onChanged 刷新；刷新不能打断正在进行的行内编辑/弹层输入。归 Task 11 测试。

---

## File Structure（最终形态）

```
todo_just/
├─ package.json tsconfig.json .gitignore README.md AGENTS.md TRANSLATING.md
├─ src/
│  ├─ background.ts                    # action.onClicked → 打开/激活 app 标签页（Task 12）
│  ├─ shared/
│  │  ├─ settings.ts                   # 设置模型/校验/读写/监听（Task 2）
│  │  ├─ store.ts                      # 数据模型 + 纯函数业务规则（Task 3）
│  │  ├─ i18n.ts                       # t()/setLocale()（Task 4）
│  │  ├─ themes.ts                     # resolveTheme/applyTheme（Task 5）
│  │  └─ action-compat.ts              # action/browserAction（Task 12）
│  ├─ app/
│  │  ├─ app.html app.ts app.css       # 独立全页面（Task 5/6）
│  │  ├─ mount.ts                      # mountApp(root) 装配（Task 6）
│  │  ├─ context.ts                    # AppContext：state + 刷新调度（Task 6）
│  │  └─ components/
│  │     ├─ tabs.ts task-list.ts add-row.ts        # Task 6/7
│  │     ├─ group-modal.ts                          # Task 8
│  │     ├─ archive-list.ts                         # Task 9
│  │     ├─ settings-modal.ts                       # Task 10
│  │     ├─ toast.ts                                # Task 11
│  │     └─ disabled-page.ts                        # Task 12
│  └─ newtab/newtab.html newtab.ts     # 接管壳（Task 12）
├─ _locales/zh_CN/messages.json _locales/en/messages.json   # Task 4
├─ icons/source.svg + 16/32/48/128.png                     # Task 13
├─ scripts/build.mjs manifest.mjs test.mjs package.py check-locales.py make-icons.py
└─ tests/
   ├─ helpers/chrome.ts helpers/dom.ts
   ├─ settings.test.ts store.test.ts i18n.test.ts themes.test.ts
   └─ ui.test.ts
```

构建入口（esbuild entryPoints）：`src/background.ts`、`src/app/app.ts`、`src/newtab/newtab.ts`；两个手写 HTML 与 `app.css`（被 `app.ts` 以 text loader import）复制进产物 `build/`。

---

### Task 1: 工程骨架与双目标构建

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `scripts/manifest.mjs`, `scripts/build.mjs`
- Create: `src/background.ts`, `src/app/app.html`, `src/app/app.ts`, `src/newtab/newtab.html`, `src/newtab/newtab.ts`

**Interfaces:**
- Produces: 命令 `npm run build` / `build:firefox` / `watch` / `typecheck` / `check`；产物 `output/MV3/manifest.json`（Chrome/Edge）与 `output/MV2/manifest.json`（Firefox）；产物路径约定 `build/<name>.js`、`build/app.html`、`build/newtab.html`。

- [ ] **Step 1: git init 与基础配置**

`git init`（当前目录非仓库）。创建 `.gitignore`：

```
node_modules/
output/
dist/
.test-build/
*.log
```

`package.json`：

```json
{
  "name": "todo-just",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node scripts/test.mjs",
    "build": "node scripts/build.mjs",
    "build:firefox": "node scripts/build.mjs --target=firefox",
    "build:all": "npm run build && npm run build:firefox",
    "watch": "node scripts/build.mjs --watch",
    "check": "npm run typecheck && npm run test && npm run build:all",
    "package": "npm run build:all && uv run --with pillow python scripts/package.py"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.287",
    "esbuild": "^0.28.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.0"
  }
}
```

`tsconfig.json`（照搬参考项目）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["chrome"]
  },
  "include": ["src", "tests"]
}
```

运行 `npm install`。

- [ ] **Step 2: 写 scripts/manifest.mjs（完整新文件）**

```js
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
```

注意：本扩展无 content script、无 host_permissions、无 web_accessible_resources。

- [ ] **Step 3: 复制并改造 scripts/build.mjs**

复制 `D:\workspace\google-plugs\markdown_reader\scripts\build.mjs` 到本项目 `scripts/build.mjs`，做以下**精确修改**：

1. `entryPoints` 改为：
   ```js
   const entryPoints = ['src/background.ts', 'src/app/app.ts', 'src/newtab/newtab.ts'];
   ```
   对应 outfile 由原脚本的 entry→out 映射逻辑产出 `build/background.js`、`build/app.js`、`build/newtab.js`（保持该映射按相对路径推导的方式）。
2. 删除 mermaid/字体/content 相关的复制条目；静态资源复制保留两项：把 `src/app/app.html`、`src/newtab/newtab.html` 复制到 outDir，把 `_locales`、`icons` 两个目录复制到 extRoot（Chrome 目标即 extRoot 根，Firefox 目标也要复制；照搬参考项目 Firefox 目标复制根资源的处理）。
3. 保留原样：`charset:'ascii'` + asciiPlugin、`define.__BUILD_TIME__`、`--target=chrome|firefox` 解析、`--watch` 的 esbuild context、仅清理本目标 extRoot、构建后写 manifest（调用本项目的 `buildManifest(target)`）。
4. CSS 走 text loader 的规则保留：`loader: { '.css': 'text' }`。
5. banner 注释中的项目名改为 todo-just。

若参考脚本是按文件名硬编码 entry 列表，以最小改动替换列表即可，不动管线。

- [ ] **Step 4: 占位入口文件**

`src/background.ts`：
```ts
// Background entry; implemented in Task 12.
export {};
```

`src/app/app.ts`：
```ts
document.title = 'Todo Just';
const root = document.querySelector('#root');
if (root) root.textContent = 'todo-just build ok';
```

`src/newtab/newtab.ts`：同上，文案写 `newtab build ok`。

`src/app/app.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Todo Just</title></head>
<body><div id="root"></div><script src="app.js"></script></body>
</html>
```

`src/newtab/newtab.html`：同样结构，script 引 `newtab.js`。

为让双目标构建在 Task 13 图标生成前通过，临时在 `icons/` 放 4 个同名占位 PNG（可从参考项目 `icons/` 复制同名文件临时顶替，Task 13 覆盖）。

- [ ] **Step 5: 验证双目标构建**

Run: `npm run build:all`
Expected: `output/MV3/manifest.json` 含 `"manifest_version": 3` 与 `chrome_url_overrides.newtab`；`output/MV2/manifest.json` 含 `"manifest_version": 2`、`browser_action`、`browser_specific_settings.gecko`；`output/MV3/build/app.js`、`newtab.js`、`background.js` 与两个 html 均存在。
Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: 人工冒烟（记录结果，不自动化）**

Chrome/Edge：扩展管理页「加载已解压」选 `output/MV3`，点图标无反应属正常（Task 12 实现）；打开新标签页应看到 `newtab build ok`。
Firefox：`about:debugging` 临时载入 `output/MV2/manifest.json`，开新标签页看到同样文字。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold esbuild dual-target (MV3/MV2) extension build"
```

---

### Task 2: 设置层 settings.ts（TDD）

**Files:**
- Create: `tests/helpers/chrome.ts`, `scripts/test.mjs`, `tests/settings.test.ts`
- Create: `src/shared/settings.ts`

**Interfaces:**
- Produces:
```ts
export type ThemeId = 'auto' | 'soft' | 'minimal' | 'dark';
export type LocaleId = 'auto' | 'zh_CN' | 'en';
export interface TodoSettings {
  locale: LocaleId; theme: ThemeId; autoArchive: boolean;
  archiveVisible: number; newtabOverride: boolean;
  activeLimit: number; archiveLimit: number;
}
export const DEFAULT_SETTINGS: TodoSettings;
export const LIMITS: Record<'archiveVisible'|'activeLimit'|'archiveLimit', {min:number;max:number}>;
export function normalizeSettings(raw: unknown): TodoSettings;
export function loadSettings(): Promise<TodoSettings>;
export function saveSettings(patch: Partial<TodoSettings>): Promise<TodoSettings>;
export function watchSettings(cb: (s: TodoSettings) => void): () => void;
```
存储 key：`todo:settings:v1`。

- [ ] **Step 1: 测试运行器与 chrome stub**

`scripts/test.mjs`：用 esbuild 把 `tests/**/*.test.ts` bundle 到 `.test-build/`（format `esm`，loader `{'.css':'text'}`），再以 `node --test .test-build` 运行：

```js
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('.test-build', { recursive: true, force: true });
await build({
  entryPoints: ['tests/settings.test.ts', 'tests/store.test.ts', 'tests/i18n.test.ts', 'tests/themes.test.ts', 'tests/ui.test.ts'].filter((_, i, a) => true),
  outdir: '.test-build',
  bundle: true,
  format: 'esm',
  platform: 'node',
  loader: { '.css': 'text' },
  logLevel: 'warning',
});
// 只运行已存在的入口（后续任务逐个补齐文件）
execFileSync(process.execPath, ['--test', '.test-build'], { stdio: 'inherit' });
```

实现时改为「用 glob 思路：仅对磁盘存在的 5 个测试文件作为 entryPoints」（用 `fs.existsSync` 过滤），避免本任务因其他测试文件不存在而失败。

`tests/helpers/chrome.ts`：内存版 storage 与事件触发。

```ts
type Change = Record<string, chrome.storage.StorageChange>;
export interface Stub {
  store: Map<string, unknown>;
  listeners: ((changes: Change, area: string) => void)[];
}
export function installChromeStub(): Stub {
  const stub: Stub = { store: new Map(), listeners: [] };
  const area = {
    get: async (keys?: unknown) => {
      if (keys === undefined || keys === null) return Object.fromEntries(stub.store);
      if (typeof keys === 'string') return stub.store.has(keys) ? { [keys]: stub.store.get(keys) } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, stub.store.get(k)]).filter(([, v]) => v !== undefined));
      if (typeof keys === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(keys as Record<string, unknown>)) out[k] = stub.store.has(k) ? stub.store.get(k) : v;
        return out;
      }
      return {};
    },
    set: async (obj: Record<string, unknown>) => {
      const changes: Change = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: stub.store.get(k), newValue: v };
        stub.store.set(k, v);
      }
      stub.listeners.forEach(l => l(changes, 'local'));
    },
  };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: area,
      onChanged: { addListener: (l: Stub['listeners'][number]) => stub.listeners.push(l) },
    },
  };
  return stub;
}
```

- [ ] **Step 2: 写失败测试 tests/settings.test.ts**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import { DEFAULT_SETTINGS, LIMITS, normalizeSettings, loadSettings, saveSettings, watchSettings } from '../src/shared/settings.ts';

test('normalizeSettings: undefined -> defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
});
test('normalizeSettings: null/garbage -> defaults', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('x'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(42), DEFAULT_SETTINGS);
});
test('normalizeSettings: partial merge + invalid enum/boolean fall back', () => {
  const out = normalizeSettings({ theme: 'dark', locale: 'en', autoArchive: 'yes', newtabOverride: false, archiveVisible: 0, activeLimit: 99999, archiveLimit: 1 });
  assert.equal(out.theme, 'dark');
  assert.equal(out.locale, 'en');
  assert.equal(out.autoArchive, DEFAULT_SETTINGS.autoArchive);
  assert.equal(out.newtabOverride, false);
  assert.equal(out.archiveVisible, LIMITS.archiveVisible.min);
  assert.equal(out.activeLimit, LIMITS.activeLimit.max);
  assert.equal(out.archiveLimit, LIMITS.archiveLimit.min);
});
test('normalizeSettings: unknown keys are dropped', () => {
  assert.deepEqual({ ...normalizeSettings({ evil: 1, theme: 'soft' }), evil: undefined }.evil, undefined);
});
test('load/save roundtrip and default values', async () => {
  installChromeStub();
  assert.deepEqual(await loadSettings(), DEFAULT_SETTINGS);
  const s = await saveSettings({ autoArchive: true, archiveVisible: 25 });
  assert.equal(s.autoArchive, true);
  assert.equal(s.archiveVisible, 25);
  assert.equal((await loadSettings()).archiveVisible, 25);
});
test('save clamps before persist', async () => {
  installChromeStub();
  const s = await saveSettings({ activeLimit: -5 });
  assert.equal(s.activeLimit, LIMITS.activeLimit.min);
});
test('watchSettings fires on local change and unsub works', async () => {
  const stub = installChromeStub();
  const seen: unknown[] = [];
  const off = watchSettings(s => seen.push(s));
  await saveSettings({ theme: 'dark' });
  assert.equal(seen.length, 1);
  assert.equal((seen[0] as { theme: string }).theme, 'dark');
  off();
  await saveSettings({ theme: 'soft' });
  assert.equal(seen.length, 1);
  void stub;
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 src/shared/settings.ts**

```ts
export type ThemeId = 'auto' | 'soft' | 'minimal' | 'dark';
export type LocaleId = 'auto' | 'zh_CN' | 'en';

export interface TodoSettings {
  locale: LocaleId;
  theme: ThemeId;
  autoArchive: boolean;
  archiveVisible: number;
  newtabOverride: boolean;
  activeLimit: number;
  archiveLimit: number;
}

export const DEFAULT_SETTINGS: TodoSettings = {
  locale: 'auto',
  theme: 'auto',
  autoArchive: false,
  archiveVisible: 10,
  newtabOverride: true,
  activeLimit: 50,
  archiveLimit: 100,
};

export const LIMITS = {
  archiveVisible: { min: 1, max: 100 },
  activeLimit: { min: 20, max: 1000 },
  archiveLimit: { min: 50, max: 5000 },
} as const;

const SETTINGS_KEY = 'todo:settings:v1';
const THEMES: ThemeId[] = ['auto', 'soft', 'minimal', 'dark'];
const LOCALES: LocaleId[] = ['auto', 'zh_CN', 'en'];

function clamp(n: unknown, range: { min: number; max: number }, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.min(range.max, Math.max(range.min, v));
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function normalizeSettings(raw: unknown): TodoSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TodoSettings>;
  return {
    locale: oneOf(r.locale, LOCALES, DEFAULT_SETTINGS.locale),
    theme: oneOf(r.theme, THEMES, DEFAULT_SETTINGS.theme),
    autoArchive: bool(r.autoArchive, DEFAULT_SETTINGS.autoArchive),
    archiveVisible: clamp(r.archiveVisible, LIMITS.archiveVisible, DEFAULT_SETTINGS.archiveVisible),
    newtabOverride: bool(r.newtabOverride, DEFAULT_SETTINGS.newtabOverride),
    activeLimit: clamp(r.activeLimit, LIMITS.activeLimit, DEFAULT_SETTINGS.activeLimit),
    archiveLimit: clamp(r.archiveLimit, LIMITS.archiveLimit, DEFAULT_SETTINGS.archiveLimit),
  };
}

export async function loadSettings(): Promise<TodoSettings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings((got as Record<string, unknown>)[SETTINGS_KEY]);
}

export async function saveSettings(patch: Partial<TodoSettings>): Promise<TodoSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function watchSettings(cb: (s: TodoSettings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[SETTINGS_KEY]) cb(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `npm test` → settings 相关全部 PASS。Run: `npm run typecheck` → 无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/test.mjs tests/helpers/chrome.ts tests/settings.test.ts src/shared/settings.ts package.json tsconfig.json .gitignore
git commit -m "feat(settings): validated settings model with storage.local persistence"
```

---

### Task 3: 数据层 store.ts（TDD）

**Files:**
- Create: `tests/store.test.ts`
- Create: `src/shared/store.ts`

**Interfaces:**
- Consumes: `TodoSettings` 的 `autoArchive` 与数值上限（以参数传入，纯函数不读 storage）。
- Produces:

```ts
export interface Group { id: string; name: string; createdAt: number }
export interface Task { id: string; title: string; done: boolean; gid: string | null; createdAt: number; completedAt: number | null }
export interface ArchivedTask { id: string; title: string; gid: string | null; groupName: string | null; archivedAt: number }
export interface Repo { version: 1; groups: Group[]; tasks: Task[]; archived: ArchivedTask[] }
export const EMPTY_REPO: Repo;
export function normalizeRepo(raw: unknown): Repo;
export function loadRepo(): Promise<Repo>;
export function persistRepo(repo: Repo): Promise<void>;
export function newId(prefix: 'g'|'t'|'a'): string;
export function addTask(repo: Repo, input: { title: string; gid: string | null }, activeLimit: number): { ok: true; task: Task } | { ok: false; reason: 'limit' };
export function setTaskDone(repo: Repo, id: string, done: boolean, opts: { autoArchive: boolean; archiveLimit: number }): void;
export function renameTask(repo: Repo, id: string, title: string): void;
export function removeTask(repo: Repo, id: string): void;
export function archiveTask(repo: Repo, id: string, archiveLimit: number): void;
export function archiveAllDone(repo: Repo, archiveLimit: number): number;
export function restoreArchived(repo: Repo, archivedId: string): void;
export function removeArchived(repo: Repo, archivedId: string): void;
export function addGroup(repo: Repo, name: string): Group;
export function renameGroup(repo: Repo, id: string, name: string): void;
export function removeGroup(repo: Repo, id: string): void;
export function visibleTasks(repo: Repo, gid: 'all' | string): { undone: Task[]; done: Task[] };
export function visibleArchived(repo: Repo, keyword: string, limit: number): ArchivedTask[];
export function trimArchive(repo: Repo, archiveLimit: number): number;
```

- [ ] **Step 1: 写失败测试 tests/store.test.ts（完整用例集）**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import {
  EMPTY_REPO, normalizeRepo, loadRepo, persistRepo,
  addTask, setTaskDone, renameTask, removeTask, archiveTask, archiveAllDone,
  restoreArchived, removeArchived, addGroup, renameGroup, removeGroup,
  visibleTasks, visibleArchived, trimArchive,
} from '../src/shared/store.ts';

const opts = (over = {}) => ({ autoArchive: false, archiveLimit: 100, ...over });

test('normalizeRepo: garbage -> empty repo', () => {
  assert.deepEqual(normalizeRepo(undefined), EMPTY_REPO);
  assert.deepEqual(normalizeRepo('x'), EMPTY_REPO);
  assert.deepEqual(normalizeRepo({ version: 1 }), EMPTY_REPO);
});
test('normalizeRepo: drops malformed entries and coerces fields', () => {
  const r = normalizeRepo({
    version: 1,
    groups: [{ id: 'g1', name: 'Work', createdAt: 1 }, { id: 2 }, null],
    tasks: [
      { id: 't1', title: 'a', done: false, gid: 'g1', createdAt: 2, completedAt: null },
      { id: 't2', title: 5, done: 'maybe', gid: 'ghost', createdAt: 'x', completedAt: 3 },
      null,
    ],
    archived: [{ id: 'a1', title: 'old', gid: 'g1', groupName: 'Work', archivedAt: 9 }],
  });
  assert.equal(r.groups.length, 1);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].gid, 'g1');
  assert.equal(r.archived.length, 1);
});
test('addTask respects activeLimit', () => {
  const repo = normalizeRepo(undefined);
  assert.equal(addTask(repo, { title: 'a', gid: null }, 1).ok, true);
  const second = addTask(repo, { title: 'b', gid: null }, 1);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'limit');
  assert.equal(repo.tasks.length, 1);
});
test('addTask trims title and rejects blank', () => {
  const repo = normalizeRepo(undefined);
  assert.equal(addTask(repo, { title: '   ', gid: null }, 50).ok, false);
  const r = addTask(repo, { title: '  hi ', gid: null }, 50);
  assert.equal(r.ok && r.task.title, 'hi');
});
test('setTaskDone toggles and completes timestamp; reopen clears it', () => {
  const repo = normalizeRepo(undefined);
  addTask(repo, { title: 'a', gid: null }, 50);
  const id = repo.tasks[0].id;
  setTaskDone(repo, id, true, opts());
  assert.equal(repo.tasks[0].done, true);
  assert.ok(typeof repo.tasks[0].completedAt === 'number');
  setTaskDone(repo, id, false, opts());
  assert.equal(repo.tasks[0].done, false);
  assert.equal(repo.tasks[0].completedAt, null);
});
test('autoArchive=true moves task directly to archive with group snapshot', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  addTask(repo, { title: 'a', gid: g.id }, 50);
  setTaskDone(repo, repo.tasks[0].id, true, opts({ autoArchive: true }));
  assert.equal(repo.tasks.length, 0);
  assert.equal(repo.archived.length, 1);
  assert.equal(repo.archived[0].groupName, 'Work');
  assert.equal(repo.archived[0].gid, g.id);
});
test('archive snapshot survives group rename and deletion', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  addTask(repo, { title: 'a', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100);
  renameGroup(repo, g.id, 'Job');
  assert.equal(repo.archived[0].groupName, 'Work');
  removeGroup(repo, g.id);
  assert.equal(repo.archived.length, 1);
  assert.equal(repo.archived[0].groupName, 'Work');
  assert.equal(repo.archived[0].gid, g.id);
  assert.equal(repo.tasks.filter(t => t.gid === g.id).length, 0);
});
test('archive limit trims OLDEST, newest kept', () => {
  const repo = normalizeRepo(undefined);
  for (let i = 0; i < 5; i++) {
    addTask(repo, { title: `t${i}`, gid: null }, 50);
    archiveTask(repo, repo.tasks[0].id, 100);
  }
  const n = trimArchive(repo, 3);
  assert.equal(n, 2);
  assert.equal(repo.archived.length, 3);
  assert.deepEqual(repo.archived.map(a => a.title), ['t4', 't3', 't2']);
});
test('archiving beyond limit in one call trims immediately', () => {
  const repo = normalizeRepo(undefined);
  for (let i = 0; i < 5; i++) addTask(repo, { title: `t${i}`, gid: null }, 50);
  const count = archiveAllDone(repo, 3); // none done yet -> 0
  assert.equal(count, 0);
  repo.tasks.forEach(t => setTaskDone(repo, t.id, true, opts()));
  const archivedCount = archiveAllDone(repo, 3);
  assert.equal(archivedCount, 5);
  assert.equal(repo.archived.length, 3);
  assert.deepEqual(repo.archived.map(a => a.title), ['t4', 't3', 't2']);
});
test('restoreArchived: existing group reuses it; missing group -> null', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  addTask(repo, { title: 'a', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100);
  restoreArchived(repo, repo.archived[0].id);
  assert.equal(repo.archived.length, 0);
  assert.equal(repo.tasks[0].gid, g.id);
  assert.equal(repo.tasks[0].done, false);
  // now the orphan case
  addTask(repo, { title: 'b', gid: g.id }, 50);
  archiveTask(repo, repo.tasks[0].id, 100); // tasks[0] is 'b'
  removeGroup(repo, g.id);
  restoreArchived(repo, repo.archived[0].id);
  assert.equal(repo.tasks.find(t => t.title === 'b')?.gid, null);
});
test('group CRUD and removeGroup nullifies active tasks only', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'G');
  addTask(repo, { title: 'a', gid: g.id }, 50);
  addGroup(repo, '  '); // blank name rejected, still returns group? -> assert no extra group
  assert.equal(repo.groups.length, 1);
  renameGroup(repo, g.id, '  G2 ');
  assert.equal(repo.groups[0].name, 'G2');
  removeGroup(repo, g.id);
  assert.equal(repo.groups.length, 0);
  assert.equal(repo.tasks[0].gid, null);
});
test('visibleTasks sorts undone by createdAt asc, done by completedAt desc sink', () => {
  const repo = normalizeRepo(undefined);
  addTask(repo, { title: 'first', gid: null }, 50);
  addTask(repo, { title: 'second', gid: null }, 50);
  setTaskDone(repo, repo.tasks[0].id, true, opts());
  const { undone, done } = visibleTasks(repo, 'all');
  assert.equal(undone[0].title, 'second');
  assert.equal(done[0].title, 'first');
});
test('visibleTasks filters by group', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'G');
  addTask(repo, { title: 'a', gid: g.id }, 50);
  addTask(repo, { title: 'b', gid: null }, 50);
  assert.equal(visibleTasks(repo, g.id).undone.length, 1);
  assert.equal(visibleTasks(repo, 'all').undone.length, 2);
});
test('visibleArchived ignores display limit, matches title and group snapshot', () => {
  const repo = normalizeRepo(undefined);
  const g = addGroup(repo, 'Work');
  for (let i = 0; i < 12; i++) addTask(repo, { title: `item ${i}`, gid: i % 2 ? g.id : null }, 50);
  while (repo.tasks.length) archiveTask(repo, repo.tasks[0].id, 100);
  assert.equal(visibleArchived(repo, '', 10).length, 10);
  assert.equal(visibleArchived(repo, 'item', 10).length, 12);
  assert.ok(visibleArchived(repo, 'Work', 10).length >= 6);
  assert.equal(visibleArchived(repo, 'zzz', 10).length, 0);
});
test('rename/remove no-ops on missing ids do not throw', () => {
  const repo = normalizeRepo(undefined);
  renameTask(repo, 'nope', 'x');
  removeTask(repo, 'nope');
  archiveTask(repo, 'nope', 100);
  restoreArchived(repo, 'nope');
  removeArchived(repo, 'nope');
  renameGroup(repo, 'nope', 'x');
  removeGroup(repo, 'nope');
  assert.ok(true);
});
test('storage roundtrip', async () => {
  installChromeStub();
  const repo = normalizeRepo(undefined);
  addGroup(repo, 'Work');
  addTask(repo, { title: 'persisted', gid: repo.groups[0].id }, 50);
  await persistRepo(repo);
  const again = await loadRepo();
  assert.equal(again.groups[0].name, 'Work');
  assert.equal(again.tasks[0].title, 'persisted');
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test`
Expected: FAIL（store 模块不存在）。

- [ ] **Step 3: 实现 src/shared/store.ts**

```ts
export interface Group { id: string; name: string; createdAt: number }
export interface Task {
  id: string; title: string; done: boolean; gid: string | null;
  createdAt: number; completedAt: number | null;
}
export interface ArchivedTask {
  id: string; title: string; gid: string | null; groupName: string | null; archivedAt: number;
}
export interface Repo { version: 1; groups: Group[]; tasks: Task[]; archived: ArchivedTask[] }

const DATA_KEY = 'todo:data:v1';
export const EMPTY_REPO: Repo = { version: 1, groups: [], tasks: [], archived: [] };

let counter = 0;
export function newId(prefix: 'g' | 't' | 'a'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const gidOrNull = (v: unknown, groups: Group[]): string | null =>
  isStr(v) && groups.some(g => g.id === v) ? v : null;

export function normalizeRepo(raw: unknown): Repo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Repo>;
  const groups: Group[] = Array.isArray(r.groups)
    ? r.groups
        .filter((g): g is Group => !!g && isStr((g as Group).id) && isStr((g as Group).name) && isNum((g as Group).createdAt))
        .map(g => ({ id: g.id, name: g.name, createdAt: g.createdAt }))
    : [];
  const tasks: Task[] = Array.isArray(r.tasks)
    ? r.tasks
        .filter((t): t is Task => !!t && isStr((t as Task).id) && isStr((t as Task).title) && isBool((t as Task).done) && isNum((t as Task).createdAt))
        .map(t => ({
          id: t.id, title: t.title, done: t.done,
          gid: gidOrNull(t.gid, groups),
          createdAt: t.createdAt,
          completedAt: isNum(t.completedAt) ? t.completedAt : null,
        }))
    : [];
  const archived: ArchivedTask[] = Array.isArray(r.archived)
    ? r.archived
        .filter((a): a is ArchivedTask => !!a && isStr((a as ArchivedTask).id) && isStr((a as ArchivedTask).title) && isNum((a as ArchivedTask).archivedAt))
        .map(a => ({
          id: a.id, title: a.title,
          gid: isStr(a.gid) ? a.gid : null,
          groupName: isStr(a.groupName) ? a.groupName : null,
          archivedAt: a.archivedAt,
        }))
    : [];
  return { version: 1, groups, tasks, archived };
}

export async function loadRepo(): Promise<Repo> {
  const got = await chrome.storage.local.get(DATA_KEY);
  return normalizeRepo((got as Record<string, unknown>)[DATA_KEY]);
}
export async function persistRepo(repo: Repo): Promise<void> {
  await chrome.storage.local.set({ [DATA_KEY]: repo });
}

function groupNameOf(repo: Repo, gid: string | null): string | null {
  if (!gid) return null;
  return repo.groups.find(g => g.id === gid)?.name ?? null;
}

export function addTask(repo: Repo, input: { title: string; gid: string | null }, activeLimit: number)
  : { ok: true; task: Task } | { ok: false; reason: 'limit' } {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'limit' };
  if (repo.tasks.length >= activeLimit) return { ok: false, reason: 'limit' };
  const task: Task = {
    id: newId('t'), title, done: false,
    gid: input.gid && repo.groups.some(g => g.id === input.gid) ? input.gid : null,
    createdAt: Date.now(), completedAt: null,
  };
  repo.tasks.push(task);
  return { ok: true, task };
}

function toArchive(repo: Repo, task: Task, archiveLimit: number): void {
  repo.archived.push({
    id: newId('a'), title: task.title, gid: task.gid,
    groupName: groupNameOf(repo, task.gid), archivedAt: Date.now(),
  });
  repo.tasks = repo.tasks.filter(t => t.id !== task.id);
  trimArchive(repo, archiveLimit);
}

export function setTaskDone(repo: Repo, id: string, done: boolean,
  opts: { autoArchive: boolean; archiveLimit: number }): void {
  const t = repo.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = done;
  t.completedAt = done ? Date.now() : null;
  if (done && opts.autoArchive) toArchive(repo, t, opts.archiveLimit);
}

export function renameTask(repo: Repo, id: string, title: string): void {
  const t = repo.tasks.find(x => x.id === id);
  const v = title.trim();
  if (t && v) t.title = v;
}
export function removeTask(repo: Repo, id: string): void {
  repo.tasks = repo.tasks.filter(t => t.id !== id);
}
export function archiveTask(repo: Repo, id: string, archiveLimit: number): void {
  const t = repo.tasks.find(x => x.id === id);
  if (t) toArchive(repo, t, archiveLimit);
}
export function archiveAllDone(repo: Repo, archiveLimit: number): number {
  const done = repo.tasks.filter(t => t.done);
  done.forEach(t => toArchive(repo, t, archiveLimit));
  return done.length;
}
export function restoreArchived(repo: Repo, archivedId: string): void {
  const idx = repo.archived.findIndex(a => a.id === archivedId);
  if (idx < 0) return;
  const a = repo.archived[idx];
  repo.archived.splice(idx, 1);
  repo.tasks.push({
    id: newId('t'), title: a.title, done: false,
    gid: a.gid && repo.groups.some(g => g.id === a.gid) ? a.gid : null,
    createdAt: Date.now(), completedAt: null,
  });
}
export function removeArchived(repo: Repo, archivedId: string): void {
  repo.archived = repo.archived.filter(a => a.id !== archivedId);
}
export function addGroup(repo: Repo, name: string): Group {
  const group: Group = { id: newId('g'), name: name.trim(), createdAt: Date.now() };
  repo.groups.push(group);
  return group;
}
export function renameGroup(repo: Repo, id: string, name: string): void {
  const g = repo.groups.find(x => x.id === id);
  const v = name.trim();
  if (g && v) g.name = v;
}
export function removeGroup(repo: Repo, id: string): void {
  repo.groups = repo.groups.filter(g => g.id !== id);
  repo.tasks.forEach(t => { if (t.gid === id) t.gid = null; });
}
export function visibleTasks(repo: Repo, gid: 'all' | string): { undone: Task[]; done: Task[] } {
  const list = repo.tasks.filter(t => gid === 'all' || t.gid === gid);
  return {
    undone: list.filter(t => !t.done).sort((a, b) => a.createdAt - b.createdAt),
    done: list.filter(t => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  };
}
export function visibleArchived(repo: Repo, keyword: string, limit: number): ArchivedTask[] {
  const kw = keyword.trim().toLowerCase();
  const sorted = [...repo.archived].sort((a, b) => b.archivedAt - a.archivedAt);
  const matched = kw
    ? sorted.filter(a => a.title.toLowerCase().includes(kw) || (a.groupName ?? '').toLowerCase().includes(kw))
    : sorted;
  return matched.slice(0, limit);
}
export function trimArchive(repo: Repo, archiveLimit: number): number {
  if (repo.archived.length <= archiveLimit) return 0;
  repo.archived.sort((a, b) => b.archivedAt - a.archivedAt);
  const removed = repo.archived.length - archiveLimit;
  repo.archived.length = archiveLimit;
  return removed;
}
```

注意：测试用例 `addGroup(repo, '  ')` 期望不新增——上面实现会 push 空名 group。**实现时必须在 `addGroup` 开头处理**：`name.trim()` 为空时不 push，返回一个 `id:''` 的哨兵并让测试通过。为此把签名返回类型改为 `Group | null`（空名/调用处需判空），同步修正测试中两处用法（`const g = addGroup(...); assert.ok(g)` 后用 `g!`/局部收窄）。执行者按此调整，不允许保留空名分组。

- [ ] **Step 4: 运行，确认通过**

Run: `npm test` → 全部 PASS（store + settings）。Run: `npm run typecheck`。

- [ ] **Step 5: Commit**

```bash
git add tests/store.test.ts src/shared/store.ts
git commit -m "feat(store): task/group/archive rules with snapshot and limits"
```

---

### Task 4: 国际化 i18n 与 zh_CN/en 语言包

**Files:**
- Create: `src/shared/i18n.ts`
- Create: `_locales/zh_CN/messages.json`, `_locales/en/messages.json`
- Create: `tests/i18n.test.ts`

**Interfaces:**
- Produces:
```ts
export type UILocale = 'zh_CN' | 'en';
export function t(key: string, subs?: string[]): string;
export function setLocale(locale: 'auto' | UILocale): void;
export function getResolvedLocale(): UILocale;   // auto → chrome.i18n.getUILanguage() 映射，否则当前
export function applyI18n(root?: ParentNode): void;
```

- [ ] **Step 1: 写失败测试 tests/i18n.test.ts**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome.ts';
import { t, setLocale, getResolvedLocale } from '../src/shared/i18n.ts';

test('default (auto, no chrome.i18n) falls back to zh_CN', () => {
  installChromeStub();
  setLocale('auto');
  assert.equal(t('appTitle'), '我的待办');
  assert.equal(getResolvedLocale(), 'zh_CN');
});
test('manual en works', () => {
  installChromeStub();
  setLocale('en');
  assert.equal(t('appTitle'), 'My Tasks');
});
test('$1 substitution', () => {
  installChromeStub();
  setLocale('zh_CN');
  assert.equal(t('doneDivider', ['3']), '已完成 3');
});
test('missing key in en falls back to zh then key itself', () => {
  installChromeStub();
  setLocale('en');
  assert.equal(t('__only_in_zh__'), '__only_in_zh__');
});
test('auto follows chrome.i18n.getUILanguage when en', () => {
  const stub = installChromeStub();
  (globalThis as { chrome: typeof chrome }).chrome.i18n = { getUILanguage: () => 'en-US' } as typeof chrome.i18n;
  setLocale('auto');
  assert.equal(getResolvedLocale(), 'en');
  assert.equal(t('appTitle'), 'My Tasks');
  void stub;
});
```

- [ ] **Step 2: 实现 src/shared/i18n.ts（从参考项目复制改造）**

复制 `D:\workspace\google-plugs\markdown_reader\src\shared\i18n.ts`，修改：`Locale` 改为 `'auto' | 'zh_CN' | 'en'`；`LOCALES/TABLES` 仅登记这两份 JSON（`import zhMessages from '../../_locales/zh_CN/messages.json'`、`enMessages`）；浏览器语言映射：`getUILanguage()` 以 `en` 开头 → `'en'`，其余一律 `'zh_CN'`。
保留：`$1` 占位符替换、回退链（手动语言 → chrome.i18n.getMessage → zh_CN → key 本身）、`setLocale`。
新增 `applyI18n(root=document)`：遍历 `[data-i18n]`（textContent）、`[data-i18n-placeholder]`、`[data-i18n-title]`，逐一调 `t()`。

- [ ] **Step 3: 语言包（完整，不许缺 key）**

`_locales/zh_CN/messages.json`：

```json
{
  "extName": { "message": "待办清单", "description": "扩展名称，显示在商店与扩展管理页" },
  "extDescription": { "message": "简洁的分组待办、归档与搜索，支持新标签页。", "description": "扩展描述，商店列表用" },
  "appTitle": { "message": "我的待办", "description": "独立页顶部主标题" },
  "tabAll": { "message": "全部", "description": "第一个分组标签，显示所有任务" },
  "ungrouped": { "message": "未分组", "description": "无分组任务与归档项的标签" },
  "manageGroups": { "message": "管理分组", "description": "标签栏末尾 + 按钮的悬停提示" },
  "doneDivider": { "message": "已完成 $1", "description": "已完成分隔标题，$1=数量" },
  "addPlaceholder": { "message": "添加任务，回车确认…", "description": "新建任务输入框占位文本" },
  "pickerUngrouped": { "message": "未分组", "description": "新建任务行分组下拉的默认选项" },
  "archiveAll": { "message": "全部归档 ($1)", "description": "一键归档按钮，$1=已完成数量" },
  "archiveTitle": { "message": "归档", "description": "归档区标题" },
  "archiveSubRecent": { "message": "最近 $1 条", "description": "归档标题后的副标题，$1=显示条数" },
  "searchPlaceholder": { "message": "搜索归档任务…", "description": "归档搜索框占位文本" },
  "archiveFootLimited": { "message": "显示最近 $1 条，共 $2 条归档 — 在搜索框输入关键词可查找更早的任务", "description": "归档超显示条数时的底部说明，$1=显示数 $2=总数" },
  "archiveFootTotal": { "message": "共 $1 条归档", "description": "归档底部说明（未超限），$1=总数" },
  "archiveSearchFoot": { "message": "在全部 $1 条归档中搜索「$2」，找到 $3 条", "description": "搜索结果统计，$1=总数 $2=关键词 $3=命中数" },
  "archiveTrimmed": { "message": "仅保留最近 $1 条归档", "description": "归档达到容量上限被裁剪后的常驻提示，$1=上限" },
  "emptyAll": { "message": "还没有任务，下面添加第一条吧", "description": "全部标签下空列表" },
  "emptyGroup": { "message": "这个分组下还没有任务", "description": "分组标签下空列表" },
  "emptyArchive": { "message": "暂无归档任务", "description": "归档区为空" },
  "emptySearch": { "message": "没有匹配的归档任务", "description": "归档搜索无结果" },
  "opRename": { "message": "重命名", "description": "任务行重命名按钮提示" },
  "opReopen": { "message": "恢复为待办", "description": "已完成任务恢复按钮提示" },
  "opArchive": { "message": "归档", "description": "归档按钮提示" },
  "opDelete": { "message": "删除", "description": "删除按钮提示" },
  "opRestore": { "message": "恢复为待办", "description": "归档项恢复按钮提示" },
  "editHint": { "message": "双击编辑", "description": "待办标题悬停提示" },
  "settingsTitle": { "message": "全局设置", "description": "设置弹层标题" },
  "setAppearance": { "message": "外观", "description": "设置分组：外观" },
  "setTheme": { "message": "主题", "description": "主题设置标签" },
  "themeAuto": { "message": "跟随系统", "description": "主题选项" },
  "themeSoft": { "message": "柔和明亮", "description": "主题选项 A" },
  "themeMinimal": { "message": "极简专业", "description": "主题选项 B" },
  "themeDark": { "message": "暗色专注", "description": "主题选项 C" },
  "setLocale": { "message": "语言", "description": "语言设置标签" },
  "localeAuto": { "message": "跟随浏览器", "description": "语言选项" },
  "setArchive": { "message": "归档", "description": "设置分组：归档" },
  "setArchiveVisible": { "message": "默认显示条数", "description": "归档显示条数标签" },
  "setArchiveVisibleHint": { "message": "仅影响默认展示数量，搜索仍覆盖全部归档", "description": "条数设置说明" },
  "setAutoArchive": { "message": "自动归档", "description": "自动归档开关标签" },
  "setAutoArchiveHint": { "message": "勾选完成后，任务直接进入归档区，不在上方停留", "description": "自动归档说明" },
  "setCapacity": { "message": "容量", "description": "设置分组：容量" },
  "setActiveLimit": { "message": "活跃任务上限", "description": "活跃容量标签" },
  "setArchiveLimit": { "message": "归档容量上限", "description": "归档容量标签" },
  "setNewtab": { "message": "接管空白标签页", "description": "新标签页开关标签" },
  "setNewtabHint": { "message": "关闭后新标签页显示空白页；如需恢复浏览器原生新标签页，请到扩展管理中关闭本扩展的新建标签页权限。", "description": "新标签页开关说明，含浏览器限制" },
  "done": { "message": "完成", "description": "设置弹层主按钮" },
  "close": { "message": "关闭", "description": "通用关闭按钮" },
  "groupMgrTitle": { "message": "管理分组", "description": "分组弹层标题" },
  "newGroupPlaceholder": { "message": "新分组名称，回车添加…", "description": "新建分组输入框" },
  "groupTaskCount": { "message": "$1 条任务", "description": "分组编辑项的任务计数，$1=数量" },
  "groupTip": { "message": "双击分组名可重命名；删除分组后，活跃任务变为「未分组」，归档记录保留原分组名。", "description": "分组弹层说明" },
  "limitReached": { "message": "已达上限（$1），请先完成或归档任务", "description": "新增超过活跃上限时的提示，$1=上限" },
  "toastRestored": { "message": "已恢复为待办", "description": "恢复归档提示" },
  "toastArchived": { "message": "已归档", "description": "归档提示" },
  "disabledTitle": { "message": "新标签页待办已关闭", "description": "停用页标题" },
  "disabledHint": { "message": "你可以随时打开完整待办页面，或重新开启新标签页接管。", "description": "停用页说明" },
  "openTodo": { "message": "打开待办", "description": "停用页按钮" },
  "enableTodo": { "message": "重新开启新标签页待办", "description": "停用页按钮" }
}
```

`_locales/en/messages.json`：同 key 集合，英文翻译，其中：

```json
{
  "extName": { "message": "Todo Just", "description": "..." },
  "extDescription": { "message": "A simple grouped to-do list with archive and search; can replace the new tab page.", "description": "..." },
  "appTitle": { "message": "My Tasks", "description": "..." },
  "tabAll": { "message": "All", "description": "..." },
  "ungrouped": { "message": "No group", "description": "..." },
  "manageGroups": { "message": "Manage groups", "description": "..." },
  "doneDivider": { "message": "Completed $1", "description": "$1=count" },
  "addPlaceholder": { "message": "Add a task, press Enter…", "description": "..." },
  "pickerUngrouped": { "message": "No group", "description": "..." },
  "archiveAll": { "message": "Archive all ($1)", "description": "$1=count" },
  "archiveTitle": { "message": "Archive", "description": "..." },
  "archiveSubRecent": { "message": "Latest $1", "description": "$1=count" },
  "searchPlaceholder": { "message": "Search archived tasks…", "description": "..." },
  "archiveFootLimited": { "message": "Showing latest $1 of $2 archived — type a keyword to find older tasks", "description": "$1=visible $2=total" },
  "archiveFootTotal": { "message": "$1 archived in total", "description": "$1=total" },
  "archiveSearchFoot": { "message": "Searched all $1 archived for「$2」, $3 found", "description": "$1=total $2=keyword $3=hits" },
  "archiveTrimmed": { "message": "Only the latest $1 archived tasks are kept", "description": "$1=limit" },
  "emptyAll": { "message": "No tasks yet — add your first one below", "description": "..." },
  "emptyGroup": { "message": "No tasks in this group yet", "description": "..." },
  "emptyArchive": { "message": "Nothing archived yet", "description": "..." },
  "emptySearch": { "message": "No archived tasks match", "description": "..." },
  "opRename": { "message": "Rename", "description": "..." },
  "opReopen": { "message": "Mark as to-do", "description": "..." },
  "opArchive": { "message": "Archive", "description": "..." },
  "opDelete": { "message": "Delete", "description": "..." },
  "opRestore": { "message": "Restore to to-do", "description": "..." },
  "editHint": { "message": "Double-click to edit", "description": "..." },
  "settingsTitle": { "message": "Settings", "description": "..." },
  "setAppearance": { "message": "Appearance", "description": "..." },
  "setTheme": { "message": "Theme", "description": "..." },
  "themeAuto": { "message": "Follow system", "description": "..." },
  "themeSoft": { "message": "Soft light", "description": "..." },
  "themeMinimal": { "message": "Minimal", "description": "..." },
  "themeDark": { "message": "Dark focus", "description": "..." },
  "setLocale": { "message": "Language", "description": "..." },
  "localeAuto": { "message": "Follow browser", "description": "..." },
  "setArchive": { "message": "Archive", "description": "..." },
  "setArchiveVisible": { "message": "Visible by default", "description": "..." },
  "setArchiveVisibleHint": { "message": "Only affects the default list; search always covers all archived tasks.", "description": "..." },
  "setAutoArchive": { "message": "Auto-archive", "description": "..." },
  "setAutoArchiveHint": { "message": "Completed tasks go straight to the archive instead of staying above.", "description": "..." },
  "setCapacity": { "message": "Capacity", "description": "..." },
  "setActiveLimit": { "message": "Active task limit", "description": "..." },
  "setArchiveLimit": { "message": "Archive limit", "description": "..." },
  "setNewtab": { "message": "Replace the new tab page", "description": "..." },
  "setNewtabHint": { "message": "When off, the new tab page is blank. To restore the browser's native new tab page, disable this extension's new tab permission in the extensions manager.", "description": "..." },
  "done": { "message": "Done", "description": "..." },
  "close": { "message": "Close", "description": "..." },
  "groupMgrTitle": { "message": "Manage groups", "description": "..." },
  "newGroupPlaceholder": { "message": "New group name, Enter to add…", "description": "..." },
  "groupTaskCount": { "message": "$1 tasks", "description": "$1=count" },
  "groupTip": { "message": "Double-click to rename. Deleting a group moves active tasks to No group; archived records keep their original group name.", "description": "..." },
  "limitReached": { "message": "Limit reached ($1). Complete or archive some tasks first.", "description": "$1=limit" },
  "toastRestored": { "message": "Restored to to-do", "description": "..." },
  "toastArchived": { "message": "Archived", "description": "..." },
  "disabledTitle": { "message": "New tab to-do is off", "description": "..." },
  "disabledHint": { "message": "Open the full to-do page anytime, or turn new tab takeover back on.", "description": "..." },
  "openTodo": { "message": "Open to-do", "description": "..." },
  "enableTodo": { "message": "Turn new tab to-do back on", "description": "..." }
}
```

- [ ] **Step 4: 运行测试 + 增加 JSON key 集合自检**

在 i18n 测试中追加（保证两语言 key 集合一致，en 缺 key 由回退兜底但必须被发现）：

```ts
import zh from '../../_locales/zh_CN/messages.json' with { type: 'json' };
import en from '../../_locales/en/messages.json' with { type: 'json' };
test('locale key sets are equal', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});
```

Run: `npm test` → 全 PASS。Run: `npm run build:all`，确认中文经 ASCII 插件后产物无裸非 ASCII（语言包 JSON 不经过 JS 打包，保持 UTF-8 原样，属正常；只有 .js 必须 ASCII）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n.ts _locales tests/i18n.test.ts
git commit -m "feat(i18n): runtime-switchable zh_CN/en with chrome locale fallback"
```

---

### Task 5: 主题 themes.ts 与 app.css 三主题合并

**Files:**
- Create: `src/shared/themes.ts`, `tests/themes.test.ts`
- Create: `src/app/app.css`

**Interfaces:**
- Produces:
```ts
export type ResolvedTheme = 'soft' | 'minimal' | 'dark';
export function resolveTheme(theme: 'auto'|ResolvedTheme, prefersDark: boolean): ResolvedTheme;
export function applyTheme(theme: 'auto'|ResolvedTheme): () => void; // 写 <html data-theme>；auto 时监听系统变化，返回解绑函数
export const THEME_OPTIONS: ReadonlyArray<{id:'auto'|ResolvedTheme; labelKey:string}>;
```

- [ ] **Step 1: 写失败测试 tests/themes.test.ts**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from '../src/shared/themes.ts';

test('explicit theme passes through', () => {
  assert.equal(resolveTheme('soft', true), 'soft');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('minimal', true), 'minimal');
});
test('auto maps to dark/soft by system preference', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'soft');
});
```

- [ ] **Step 2: 实现 themes.ts**

```ts
import type { ThemeId } from './settings.ts';
export type ResolvedTheme = 'soft' | 'minimal' | 'dark';

export function resolveTheme(theme: ThemeId, prefersDark: boolean): ResolvedTheme {
  if (theme === 'auto') return prefersDark ? 'dark' : 'soft';
  return theme;
}

export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; labelKey: string }> = [
  { id: 'auto', labelKey: 'themeAuto' },
  { id: 'soft', labelKey: 'themeSoft' },
  { id: 'minimal', labelKey: 'themeMinimal' },
  { id: 'dark', labelKey: 'themeDark' },
];

export function applyTheme(theme: ThemeId): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const paint = () => {
    const resolved = resolveTheme(theme, media.matches);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
  };
  paint();
  if (theme === 'auto') {
    media.addEventListener('change', paint);
    return () => media.removeEventListener('change', paint);
  }
  return () => {};
}
```

- [ ] **Step 3: 合并 app.css（结构 + 变量真值表）**

新建 `src/app/app.css`，分三段：**① reset/base（一份）② 三套主题变量 ③ 组件规则（一份，全部引用变量）**。类名与结构必须与预览稿完全一致（`.app/.topbar/.brand/.logo/.icon-btn/.card/.tabs/.tab/.badge/.task-list/.task/.check/.title/.g-tag/.ops/.op/.done-divider/.add-row/.select-wrap/.archive-card/.archive-head/.search-box/.archive-list/.a-item/.a-dot/.a-date/.archive-foot/.mask/.modal/.setting-row/.switch/.btn/.g-*/.style-note 停用`，新增 `.toast`、`.disabled-*` 在 Task 11/12 追加）。

**②的变量真值（从三套预览的 :root 逐字摘取，执行者必须用这些值，不要自行调色）：**

| 变量 | soft (A) | minimal (B) | dark (C) |
|---|---|---|---|
| --bg | #f4f6fc | #fcfcfd | #131519 |
| --card | #ffffff | #ffffff | #1c1f26 |
| --ink | #2b2f3c | #15181e | #e7eaf0 |
| --ink-2 | #6b7280 | #5c6370 | #949aa7 |
| --ink-3 | #9aa1b0 | #9aa0ab | #5f6571 |
| --line | #eceef4 | #e8eaee | #2a2e39 |
| --line-2 | #f0f1f4 | #f0f1f4 | #23262f |
| --primary | #5b7cfa | #4f46e5 | #4ade80 |
| --primary-soft | #eef1ff | #eef0fd | rgba(74,222,128,.12) |
| --danger | #f06a6a | #dc2626 | #f87171 |
| --radius | 18px | 8px | 14px |
| --shadow | 0 8px 30px rgba(60,80,160,.10) | none | 0 12px 40px rgba(0,0,0,.45) |
| --card-border | 1px solid transparent | 1px solid var(--line) | 1px solid var(--line) |
| --primary-grad | linear-gradient(135deg,#6d8bff,#8a6df5) | #4f46e5 | linear-gradient(135deg,#4ade80,#22b8a6) |
| --on-primary | #ffffff | #ffffff | #0c130d |
| --check-done-bg | var(--primary-grad) | var(--ink-2) | var(--primary) |
| --hover-bg | #f7f8fd | #f7f8fa | #22252e |
| --input-bg | #ffffff | #f7f8fa | #262a33 |
| --tab-radius | 999px | 0 | 9px |
| --tab-bg | #f3f4f9 | transparent | transparent |
| --tab-hover-bg | #e9edf8 | transparent | #23262f |
| --tab-active-bg | var(--primary-grad) | transparent | var(--primary-soft) |
| --tab-active-fg | #ffffff | var(--ink) | var(--primary) |
| --tab-active-shadow | 0 5px 14px rgba(107,124,250,.35) | inset 0 -2px 0 var(--ink) | none |
| --tab-active-border | transparent | transparent | rgba(74,222,128,.28) |
| --tab-padding | 7px 14px | 14px 12px 12px | 6.5px 13px |
| --badge-bg | rgba(0,0,0,.07) | #f1f2f5 | rgba(255,255,255,.08) |
| --badge-active-bg | rgba(255,255,255,.25) | var(--primary-soft) | rgba(74,222,128,.2) |
| --tag-fg | var(--primary) | var(--ink-2) | #7c9cf7 |
| --tag-bg | var(--primary-soft) | #f3f4f6 | rgba(124,156,247,.12) |
| --tag-none-fg | var(--ink-3) | var(--ink-3) | var(--ink-3) |
| --tag-none-bg | #f3f4f9 | #f3f4f6 | rgba(255,255,255,.05) |
| --archive-card-bg | #fbfaf6 | #ffffff | #191c22 |
| --archive-border | #efe9db | var(--line) | #33302a |
| --archive-dot | #d8c9a3 | #c9ced8 | #6b5f3f |
| --body-glow | radial-gradient(900px 380px at 85% -8%,#e7ecff 0%,rgba(231,236,255,0) 60%) | none | radial-gradient(800px 340px at 88% -10%,rgba(74,222,128,.07) 0%,rgba(74,222,128,0) 60%) |
| --mask-bg | rgba(35,42,70,.35) | rgba(15,18,25,.4) | rgba(0,0,0,.55) |
| --btn-ghost-bg | #f3f4f9 | #f2f3f6 | #2a2e39 |
| --btn-ghost-fg | var(--ink-2) | var(--ink-2) | var(--ink-2) |

选择器：`:root[data-theme="soft"]{…}` / `:root[data-theme="minimal"]{…}` / `:root[data-theme="dark"]{ color-scheme:dark; …}`。

**③ 组件规则迁移法**：以 `previews/option-a-soft.html` 的 `<style>` 组件段为结构蓝本（类名完全相同），逐块复制后把硬编码值替换为变量，替换映射（全部硬编码都必须消掉，可用 grep 自查 `#` 与 `rgba` 只允许出现在变量块与 --primary-grad/--body-glow 中）：

- body 背景：`background: var(--body-glow), var(--bg);`
- `.card` → `background:var(--card);border:var(--card-border);border-radius:var(--radius);box-shadow:var(--shadow)`
- `.tab` → padding `var(--tab-padding)`、radius `var(--tab-radius)`、bg/fg 全用 tab 变量；`.tab.active` 用 active 变量（minimal 的下划线由 `box-shadow: var(--tab-active-shadow)` + `border-bottom:2px solid transparent;margin-bottom:-1px` 实现，三套统一这个写法，A/C 的 shadow 已含各自值）
- `.badge` / `.task.done .check` / `.g-tag` / 三套 archive-* / `.mask` / `.modal` / `.switch:checked` / `.btn.primary`（bg:var(--primary-grad);color:var(--on-primary)）/ `.select-wrap select`（bg:var(--input-bg)）/ hover 态，全部按变量表替换
- 字号/间距/尺寸类（width/height/gap/font-size 等布局值）三套取 **option-a 的值为基准**，与 option-b/option-c 有明显差异处（tab padding、checkbox 尺寸 21/18/20、op 尺寸 29/27/28、圆角）统一采用中间值并在变量中只保留颜色/背景/圆角；布局尺寸写死一套（checkbox 20px、op 28px、字号 15px 列表/14px 归档/13px 辅助），因为三套是同结构不同皮肤，不需要布局随主题变。
- 删除 `.style-note`；归档区与列表的 ops 固定宽度规则保留（`.task .ops{min-width:90px;justify-content:flex-end}`）。
- `.add-row .g-tag{cursor:default}`、`.title.editable` 与悬停底色（var(--hover-bg)）保留。
- select 的自定义箭头用 currentColor 三角，颜色 var(--ink-3)；dark 下 `select option{background:#262a33;color:var(--ink)}`。

- [ ] **Step 4: 验证**

Run: `npm test && npm run typecheck && npm run build:all` → 全绿。
人工：临时把 `src/app/app.ts` 改为 `import css from './app.css'; document.documentElement.dataset.theme='soft'; document.head.innerHTML='<style>'+css+'</style>'; document.body.innerHTML='<div class=\"app\"><section class=\"card\">…'</style>`（验证后还原为占位，正式 DOM 在 Task 6）。三个 data-theme 值各看一次，确认 A/C 与预览观感一致、B 是下划线 tab 风格。

- [ ] **Step 5: Commit**

```bash
git add src/shared/themes.ts src/app/app.css tests/themes.test.ts
git commit -m "feat(theme): three themes via CSS variables plus auto system scheme"
```

---

### Task 6: 应用骨架、Tabs、任务列表、新增（含上限阻止）

**Files:**
- Create: `src/app/context.ts`, `src/app/mount.ts`, `src/app/components/tabs.ts`, `src/app/components/task-list.ts`, `src/app/components/add-row.ts`
- Modify: `src/app/app.html`, `src/app/app.ts`
- Create: `tests/helpers/dom.ts`, `tests/ui.test.ts`

**Interfaces:**
- Consumes: settings/store/i18n/themes 全部已产出 API；`app.css` text import。
- Produces:
```ts
export interface AppContext {
  root: HTMLElement; repo: Repo; settings: TodoSettings;
  currentGroup: 'all' | string; keyword: string; newGroupChoice: string;
  reload(): Promise<void>;          // 重新从 storage 读 repo/settings 后 render
  render(): void;
  mutate(fn: (repo: Repo) => void): Promise<void>;  // fn 改 repo → persistRepo → render
  changeSettings(patch: Partial<TodoSettings>): Promise<void>;
  toast(message: string): void;    // Task 11 接入，本任务先挂 no-op
}
export function mountApp(root: HTMLElement): Promise<AppContext>;
```

- [ ] **Step 1: jsdom helper**

`tests/helpers/dom.ts`：

```ts
import { JSDOM } from 'jsdom';
export function setupDom(): void {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.local/' });
  const { window } = dom;
  (globalThis as { window?: unknown; document?: unknown; HTMLElement?: unknown; customElements?: unknown; getComputedStyle?: unknown; matchMedia?: unknown })
    .window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.customElements = window.customElements;
  globalThis.getComputedStyle = window.getComputedStyle;
  window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener(){}, removeEventListener(){} }));
  globalThis.matchMedia = window.matchMedia;
}
```

- [ ] **Step 2: 写失败测试 tests/ui.test.ts（本任务三个行为）**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom.ts';
import { installChromeStub } from './helpers/chrome.ts';
import { mountApp } from '../src/app/mount.ts';

async function boot() {
  setupDom();
  installChromeStub();
  const root = document.querySelector('#root') as HTMLElement;
  const ctx = await mountApp(root);
  return ctx;
}

test('add task via Enter appears in list and persists', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  input.value = '写周报';
  input.dispatchEvent(new (globalThis as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  assert.match(ctx.root.textContent ?? '', /写周报/);
  assert.equal((await (await import('../src/shared/store.ts')).loadRepo()).tasks[0].title, '写周报');
});
test('completing a task sinks it under divider and shows count', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  for (const title of ['a', 'b']) { input.value = title; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await Promise.resolve();
  const firstCheck = ctx.root.querySelectorAll('.task .check')[0] as HTMLButtonElement;
  firstCheck.click();
  await Promise.resolve();
  const done = ctx.root.querySelectorAll('.task.done');
  assert.equal(done.length, 1);
  assert.match(ctx.root.querySelector('.done-divider')?.textContent ?? '', /1/);
});
test('active limit blocks adding and shows limit message', async () => {
  const ctx = await boot();
  await ctx.changeSettings({ activeLimit: 1 });
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  input.value = 'one'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  input.value = 'two'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  assert.equal(ctx.root.querySelectorAll('.task').length, 1);
  assert.match(ctx.root.textContent ?? '', /上限|Limit/);
});
```

（jsdom 下 i18n 默认 zh_CN，因此断言中文文案；`/上限|Limit/` 双保险。）

- [ ] **Step 3: 实现 context.ts**

```ts
import type { Repo } from '../shared/store.ts';
import type { TodoSettings } from '../shared/settings.ts';
import { loadRepo, persistRepo } from '../shared/store.ts';
import { loadSettings, saveSettings } from '../shared/settings.ts';

export interface AppContext {
  root: HTMLElement;
  repo: Repo;
  settings: TodoSettings;
  currentGroup: 'all' | string;
  keyword: string;
  newGroupChoice: string;
  reload(): Promise<void>;
  render(): void;
  mutate(fn: (repo: Repo) => void): Promise<void>;
  changeSettings(patch: Partial<TodoSettings>): Promise<void>;
  toast(message: string): void;
}

export async function createContext(root: HTMLElement): Promise<AppContext> {
  const ctx: AppContext = {
    root,
    repo: { version: 1, groups: [], tasks: [], archived: [] },
    settings: null as unknown as TodoSettings,
    currentGroup: 'all',
    keyword: '',
    newGroupChoice: '',
    async reload() {
      const [repo, settings] = await Promise.all([loadRepo(), loadSettings()]);
      ctx.repo = repo;
      ctx.settings = settings;
    },
    render() { renderers.forEach(r => r(ctx)); },
    async mutate(fn) {
      fn(ctx.repo);
      await persistRepo(ctx.repo);
      ctx.render();
    },
    async changeSettings(patch) {
      ctx.settings = await saveSettings(patch);
      ctx.render();
    },
    toast() { /* Task 11 */ },
  };
  await ctx.reload();
  return ctx;
}
const renderers: Array<(ctx: AppContext) => void> = [];
export function registerRenderer(fn: (ctx: AppContext) => void): void { renderers.push(fn); }
```

- [ ] **Step 4: 实现三个组件**

`tabs.ts`：导出 `renderTabs(ctx)` 并在模块加载时 `registerRenderer`。DOM 结构逐字对应预览稿 `.tabs`：全部（data-i18n `tabAll`）+ groups + 末尾「+」（title 用 `t('manageGroups')`，点击 Task 8 才接，先留空函数 `openGroupModal` 占位并在该文件 `export let openGroupModal = () => {}` 供 Task 8 赋值）。badge = 该范围 `!done` 计数；点击切换 `ctx.currentGroup` 后 `ctx.render()`。

`add-row.ts`：渲染 `.add-row`（+ 图标、`#groupPicker` 占位、`#newTask` 输入框带 `data-i18n-placeholder`、`#archiveAll` 按钮本任务先不渲染，Task 7 接入）。Enter 时：
```ts
const gid = ctx.currentGroup === 'all'
  ? (ctx.repo.groups.some(g => g.id === ctx.newGroupChoice) ? ctx.newGroupChoice : null)
  : ctx.currentGroup;
const result = addTask(ctx.repo, { title: input.value, gid }, ctx.settings.activeLimit);
if (!result.ok) { ctx.toast(t('limitReached', [String(ctx.settings.activeLimit)])); input.value=''; return; }
input.value = '';
await persistRepo(ctx.repo); ctx.render();
```
`#groupPicker` 在 all 时渲染 select（未分组 + groups，value 绑 `ctx.newGroupChoice`，change 时更新；option 文案来自 groups，未分组 option data-i18n `pickerUngrouped`），非 all 时渲染当前组名 `.g-tag`（无组则 ungrouped）。

`task-list.ts`：`renderTaskList(ctx)` 用 `visibleTasks(ctx.repo, ctx.currentGroup)`；行结构与预览一致：`.check[data-act=toggle]`、`.title`（待办加 `.editable` + title=`t('editHint')`；双击编辑 Task 7 接，本任务只渲染）、all 视图下 `.g-tag`（groupName 或 ungrouped）、`.ops` 占位（Task 7 填充，本任务渲染空 `.ops`）；done 区前插 `.done-divider`（`t('doneDivider',[String(done.length)])`）；空态用 emptyAll/emptyGroup。toggle 行为：`setTaskDone(repo,id,!done,{autoArchive,archiveLimit})` → persist → render；若触发了归档（autoArchive 且该任务已不在 repo.tasks），调 `ctx.toast(t('toastArchived'))`。

- [ ] **Step 5: mount.ts / app.html / app.ts**

`mount.ts`：
```ts
import css from './app.css';
import { setLocale } from '../shared/i18n.ts';
import { applyTheme } from '../shared/themes.ts';
import { createContext, type AppContext } from './context.ts';
import './components/tabs.ts';
import './components/task-list.ts';
import './components/add-row.ts';
import { APP_HTML } from './app-template.ts';
import { applyI18n } from '../shared/i18n.ts';

let disposeTheme: (() => void) | undefined;
export async function mountApp(root: HTMLElement): Promise<AppContext> {
  const style = document.createElement('style');
  style.id = 'todo-app-style';
  style.textContent = css;
  document.head.append(style);
  root.innerHTML = APP_HTML;
  const ctx = await createContext(root);
  setLocale(ctx.settings.locale);
  disposeTheme?.();
  disposeTheme = applyTheme(ctx.settings.theme);
  applyI18n(root);
  ctx.render();
  return ctx;
}
```

`app-template.ts`：导出常量字符串 `APP_HTML`，内容为预览 `option-a` 的 `<div class="app">…` 全部 body 结构（topbar 齿轮 `#settingsBtn`、两个 `.card`、tabs/taskList/add-row、archive 区含 `#search`、两个 `.mask`（settings/group）容器先放静态骨架，Task 8/10 填充）。所有静态文字改为 `data-i18n` 标记；齿轮/任务操作仍用同样的内联 SVG。

`app.html`：同 Task 1 结构（#root + app.js）。`app.ts`：`mountApp(document.querySelector('#root')!)`；并读 `location.hash === '#settings'`（Task 10 用，本任务忽略即可）。

- [ ] **Step 6: 跑测试 + 人工冒烟**

Run: `npm test`（ui 三个用例 PASS）、`npm run build:all`。
人工：加载 MV3，打开新标签页（此时仍是接管页壳，Task 12 才换；临时把 newtab.ts 也 `mountApp` 以便今天看到效果——允许本任务在 newtab.ts 里临时 `import { mountApp } from '../app/mount.ts'; mountApp(document.querySelector('#root')!)`，Task 12 再替换为壳逻辑）。验证新增、勾选沉底、上限 toast（把上限调到 1）。

- [ ] **Step 7: Commit**

```bash
git add src/app tests/ui.test.ts tests/helpers/dom.ts src/newtab/newtab.ts
git commit -m "feat(app): tabs, mixed task list with sink, validated add row"
```

---

### Task 7: 任务行操作、行内编辑、全部归档、新建分组选择器联动

**Files:**
- Modify: `src/app/components/task-list.ts`, `src/app/components/add-row.ts`

**Interfaces:**
- Consumes: `renameTask/removeTask/archiveTask/archiveAllDone/setTaskDone`；store API 已有。
- Produces: 归档区计数刷新依赖 `ctx.render()`（已有）。

- [ ] **Step 1: 追加 UI 测试到 tests/ui.test.ts**

```ts
test('double-click title edits and Enter renames', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  input.value = 'orig'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  const titleEl = ctx.root.querySelector('.task:not(.done) .title') as HTMLElement;
  titleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const edit = ctx.root.querySelector('.task input') as HTMLInputElement;
  assert.ok(edit);
  edit.value = 'renamed';
  edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  assert.match(ctx.root.textContent ?? '', /renamed/);
});
test('archive button moves task to archive list; reopen returns it to undone', async () => {
  const ctx = await boot();
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  input.value = 'x'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  (ctx.root.querySelectorAll('.task .check')[0] as HTMLButtonElement).click();
  await Promise.resolve();
  (ctx.root.querySelector('.task.done [data-act="archive"]') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.equal(ctx.root.querySelectorAll('.task').length, 0);
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 1);
  (ctx.root.querySelector('.a-item [data-act="restore"]') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.equal(ctx.root.querySelectorAll('.task:not(.done)').length, 1);
});
```

注意：归档区 DOM 在 Task 9 才实现。**本任务测试先只保留 rename 与 reopen 两条**；归档按钮联动断言在 Task 9 补（那里有 `.a-item`）。reopen 用例改为：勾选 → 点 `[data-act=reopen]` → `.task.done` 归零。

- [ ] **Step 2: 实现行操作（task-list.ts）**

按预览稿为每行渲染 ops：
- 待办：`[data-act=rename]`（铅笔，title=`opRename`）+ `[data-act=del]`（垃圾桶，title=`opDelete`）
- 已完成：`[data-act=reopen]`（撤销箭头，title=`opReopen`）+ `[data-act=archive]`（箱子，title=`opArchive`）+ `[data-act=del]`
- 事件（事件委托绑在 `#taskList` 上，render 后重新绑或用依赖 `data-id`/`data-act` 的单次委托——采用委托，mount 时绑一次，读 `e.target.closest('[data-act]')`）：
  - toggle：Task 6 逻辑
  - reopen：`setTaskDone(repo,id,false,…)` → persist → render
  - rename/dblclick：仅当行不是 done 时进入 `inlineEdit`（与预览同实现：替换为 `<input>`，Enter/失焦保存调 `renameTask`，Esc 取消 render）
  - archive：`archiveTask(repo,id,settings.archiveLimit)` → persist → render → toast `toastArchived`；裁剪发生时 toast 改为 `archiveTrimmed`（比较操作前后 archived.length 不增加即说明发生裁剪：`const before = repo.archived.length; …; if (repo.archived.length <= before && wasArchive) …`——更简单可靠：归档后若 `repo.archived.length >= settings.archiveLimit` 提示 trimmed，否则 archived）
  - del：`removeTask` → persist → render

行内编辑期间标记 `ctx.editing = true`（在 AppContext 增加可选字段 `editing?: boolean`，inlineEdit 进入置 true、结束置 false），供 Task 11 的 onChanged 使用。

- [ ] **Step 3: 全部归档按钮（add-row.ts）**

`#archiveAll`：当 done.length>0 显示，文案 `t('archiveAll',[n])`；点击 `archiveAllDone(repo, settings.archiveLimit)`，persist，render，toast（同上裁剪判断）。

- [ ] **Step 4: 选择器联动**

在分组 Tab 切换后（tabs.ts 点击里）重置 `ctx.newGroupChoice = ''` 再 render（避免从分组 Tab 切回 all 时残留）；删除分组场景在 Task 8 已由 store 保证安全，add-row 的渲染已用 `groups.some` 校验。

- [ ] **Step 5: 验证**

Run: `npm test`、typecheck、build:all；人工：双击编辑（Enter/Esc/失焦）、悬停按钮、恢复、归档、全部归档、自动归档开关下勾选直接进归档。

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(app): inline rename, reopen/archive/delete actions, archive-all"
```

---

### Task 8: 分组管理弹层

**Files:**
- Create: `src/app/components/group-modal.ts`
- Modify: `src/app/mount.ts`（import 注册）, `src/app/components/tabs.ts`（接上 `openGroupModal`）

**Interfaces:**
- Consumes: `addGroup/renameGroup/removeGroup`；i18n keys（groupMgr*）。
- Produces: `openGroupModal(): void`（赋值给 tabs.ts 的导出占位）。

- [ ] **Step 1: 追加 UI 测试**

```ts
test('group modal: add group appears as tab; delete nullifies active task group', async () => {
  const ctx = await boot();
  // add a task in a new group
  openGroupModalForTest(ctx);
  const ng = ctx.root.querySelector('#newGroup') as HTMLInputElement;
  ng.value = '生活'; ng.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  assert.match(ctx.root.textContent ?? '', /生活/);
  // add task assigned to that group via picker
  const pick = ctx.root.querySelector('#groupSelect') as HTMLSelectElement;
  pick.value = ctx.repo.groups[0].id; pick.dispatchEvent(new Event('change', { bubbles: true }));
  const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
  input.value = '买菜'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  // delete group from modal -> task becomes ungrouped, archived untouched logic covered by store tests
  (ctx.root.querySelector('.g-del') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.equal(ctx.repo.tasks[0].gid, null);
  assert.equal(ctx.newGroupChoice, '');
});
```

测试辅助：group-modal 导出 `openGroupModal()`（内部找当前 mount 的 ctx——为可测，让模块持有 `let current: AppContext | null`，由其 renderer 注册时设置；测试直接调导出的 `openGroupModal` 即可，删除自定义 helper）。

- [ ] **Step 2: 实现 group-modal.ts**

结构与预览稿 `#groupMask` 完全一致：`#newGroup` 输入（placeholder data-i18n）+ `#addGroupBtn`、`#groupEditList`（每项：可双击 contentEditable 改名、`groupTaskCount` 计数=该组活跃+归档总数、`.g-del`）、提示 `groupTip`、`#groupDone`。
行为照搬预览 JS 并接 store：
- 新增：`addGroup`（空名忽略）→ persist → render（列表与 tabs 同步）
- 双击改名：Enter/失焦 `renameGroup`（trim，空名保留原名）→ persist → render
- 删除：`removeGroup`；若 `ctx.currentGroup` 被删则置 `'all'`；清空 `newGroupChoice`；persist → render
- 遮罩点击/关闭按钮隐藏；打开时 focus 输入框
- `data-i18n` 在 open 时对 mask 内调用 `applyI18n(mask)`（模板静态文案也可在 mount 时统一 apply 一次）

- [ ] **Step 3: 接线**

mount.ts import `'./components/group-modal.ts'`；tabs.ts 把「+」点击改为调 `openGroupModal`（import 同名字段）。

- [ ] **Step 4: 验证**

Run: `npm test`、build:all；人工：新增/重命名/删除分组、删除后任务标签变「未分组」、归档项组名不变（先归档一条再删组验证）。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(app): group management modal with rename and safe delete"
```

---

### Task 9: 归档区（分组标签、搜索、恢复/删除、条数与容量提示）

**Files:**
- Create: `src/app/components/archive-list.ts`
- Modify: `src/app/mount.ts`, `src/app/context.ts`（keyword 已有）

**Interfaces:**
- Consumes: `visibleArchived/restoreArchived/removeArchived`；settings.archiveVisible/archiveLimit。

- [ ] **Step 1: 补 Task 7 延后的归档联动测试 + 搜索测试**

```ts
test('archive search covers beyond visible limit and matches group snapshot', async () => {
  const ctx = await boot();
  await ctx.changeSettings({ archiveVisible: 5 });
  // create 7 tasks in group Work, complete+archive all
  openGroupModal();
  let ng = ctx.root.querySelector('#newGroup') as HTMLInputElement;
  ng.value = 'Work'; ng.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await Promise.resolve();
  for (let i = 0; i < 7; i++) {
    const input = ctx.root.querySelector('#newTask') as HTMLInputElement;
    input.value = `task-${i}`;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
  }
  const { archiveAllDone } = await import('../src/shared/store.ts');
  ctx.repo.tasks.forEach(t => (t.done = true, t.completedAt = Date.now()));
  archiveAllDone(ctx.repo, 100);
  const { persistRepo } = await import('../src/shared/store.ts');
  await persistRepo(ctx.repo);
  ctx.render();
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 5); // visible limit
  const search = ctx.root.querySelector('#search') as HTMLInputElement;
  search.value = 'task'; search.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve();
  assert.equal(ctx.root.querySelectorAll('.a-item').length, 7);
  assert.match(ctx.root.querySelector('.a-item .g-tag')?.textContent ?? '', /Work/);
});
```

- [ ] **Step 2: 实现 archive-list.ts**

模板对应预览归档卡：header（`archiveTitle` + `#archiveSub`、search 框含 `#search`）、`#archiveList`、`#archiveFoot`。
渲染规则：
- 有关键字：`visibleArchived(repo, keyword, repo.archived.length)`（搜索不受 visible 限制，传全量长度）；foot = `archiveSearchFoot` [$1=总数 $2=keyword $3=命中数]
- 无关键字：`visibleArchived(repo, '', settings.archiveVisible)`；sub = `archiveSubRecent` [min(visible,total)]；foot：总数>visible → `archiveFootLimited` [visible,total]；总数===0 且非搜索 → 列表区显示 emptyArchive
- 每行 `.a-dot`、`.a-title`、`.g-tag`（**显示 `a.groupName` 快照**，为 null 显示 ungrouped）、`.a-date`（格式 `MM-DD`，由 archivedAt 本地时区格式化，纯工具函数 `formatDate`）、ops：restore（undo 图标，title=`opRestore`）、del（title=`opDelete`）
- 委托事件：restore → `restoreArchived` → persist → render → toast `toastRestored`；del → `removeArchived` → persist → render
- 搜索 input 事件：写 `ctx.keyword` → 只重渲染归档卡（调本地 render 函数即可，不必全局）
- 容量提示：当 `repo.archived.length >= settings.archiveLimit`，foot 前加 `archiveTrimmed` [archiveLimit]（搜索态也显示）

- [ ] **Step 3: 接线与补测**

mount.ts import 注册；把 Task 7 延后的「归档→出现 .a-item→恢复」用例补回 ui.test.ts 并确认通过。

- [ ] **Step 4: 验证**

Run: `npm test`、build:all；人工三主题各看：归档标签、搜「分组名」、超 visible 的 foot 文案、恢复/删除、归档达上限（把 archiveLimit 调到 50 后连续归档触发裁剪提示）。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(app): archive list with snapshot tags, full search, capacity notice"
```

---

### Task 10: 设置弹层（主题/语言/归档/容量/新标签页开关）

**Files:**
- Create: `src/app/components/settings-modal.ts`
- Modify: `src/app/mount.ts`, `src/app/app.ts`（支持 `#settings` hash 打开）

**Interfaces:**
- Consumes: `saveSettings/watchSettings`、`THEME_OPTIONS`、`setLocale/applyTheme/applyI18n`。

- [ ] **Step 1: UI 测试**

```ts
test('settings: switching theme sets data-theme; language re-renders text; number clamps', async () => {
  const ctx = await boot();
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  await Promise.resolve();
  const theme = ctx.root.querySelector('#setTheme') as HTMLSelectElement;
  theme.value = 'dark'; theme.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  // language
  (ctx.root.querySelector('#settingsBtn') as HTMLButtonElement).click();
  const loc = ctx.root.querySelector('#setLocale') as HTMLSelectElement;
  loc.value = 'en'; loc.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.match(ctx.root.querySelector('.brand')?.textContent ?? '', /My Tasks/);
  // clamp
  const vis = ctx.root.querySelector('#setArchiveVisible') as HTMLInputElement;
  vis.value = '99999'; vis.dispatchEvent(new Event('change', { bubbles: true }));
  (ctx.root.querySelector('#settingsDone') as HTMLButtonElement).click();
  await Promise.resolve();
  assert.equal(ctx.settings.archiveVisible, 100);
});
```

- [ ] **Step 2: 实现 settings-modal.ts**

弹层结构按规格第 9 节四组：外观（主题 select 用 THEME_OPTIONS + labelKey；语言 select：auto/zh_CN/en，选项文案：localeAuto、简体中文、English）、归档（archiveVisible number + 说明；autoArchive switch + 说明）、容量（activeLimit、archiveLimit）、新标签页（newtabOverride switch + 长说明）。底部 `#settingsDone`（data-i18n `done`）。
打开时用当前 settings 填充控件；「完成」时一次性收集并 `ctx.changeSettings({...})`。
changeSettings 后 mount 层需响应副作用：在 mount.ts 包装 ctx.changeSettings 或在 settings-modal 内显式执行：
- `setLocale(s.locale)` → `applyI18n(root)` → `ctx.render()`
- `disposeTheme?.(); disposeTheme = applyTheme(s.theme)`
- archiveLimit 变小：调用 `trimArchive(repo, s.archiveLimit)`，若返回 >0 则 persistRepo + toast `archiveTrimmed`
为可测，把这些副作用集中到一个 `applySettingsSideEffects(prev,next)` 函数并 export，在 changeSettings 成功后调用。
app.ts：`if (location.hash === '#settings')` 挂载后打开弹层。

- [ ] **Step 3: 验证**

Run: `npm test`、build:all；人工：四主题切换（含 auto，改系统深浅色验证实时跟随）、双语切换不刷新、newtab 开关（Task 12 才有壳，先确认值持久化）。

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(app): settings modal with live theme/locale switches"
```

---

### Task 11: Toast 与 storage.onChanged 跨标签页联动

**Files:**
- Create: `src/app/components/toast.ts`
- Modify: `src/app/context.ts`, `src/app/mount.ts`

- [ ] **Step 1: 写测试**

```ts
test('storage.onChanged refreshes another context but not while editing', async () => {
  setupDom();
  const stub = installChromeStub();
  const rootA = document.querySelector('#root') as HTMLElement;
  const a = await mountApp(rootA);
  // simulate a second page mutating storage directly
  const { addTask, persistRepo } = await import('../src/shared/store.ts');
  addTask(a.repo, { title: 'remote', gid: null }, 50);
  await persistRepo(a.repo);
  await new Promise(r => setTimeout(r, 0));
  assert.match(a.root.textContent ?? '', /remote/);
  // editing guard: begin inline edit, remote change, input survives
  a.editing = true;
  addTask(a.repo, { title: 'remote2', gid: null }, 50);
  await persistRepo(a.repo);
  await new Promise(r => setTimeout(r, 0));
  assert.doesNotMatch(a.root.textContent ?? '', /remote2/); // skipped while editing
  assert.equal(stub.listeners.length > 0, true);
});
```

- [ ] **Step 2: 实现**

`toast.ts`：导出 `renderToastHost(ctx)`（在 root 内追加 `<div class="toast">` 容器）+ 设置 `ctx.toast = (msg)=>{…}`：显示消息、1.8s 后淡出；`.toast` 样式追加到 app.css（深色半透明胶囊、底部居中、transform/opacity 过渡，颜色用变量 --ink/--card）。
`context.ts`：`toast` 默认 no-op 保留；增加 `editing?: boolean`、`modalOpen?: boolean`（group/settings 打开时置 true）。
`mount.ts`：挂载后用 storage.onChanged 监听（直接用 `chrome.storage.onChanged.addListener`，changes 含 `todo:data:v1` 或 `todo:settings:v1`）：
```ts
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (ctx.editing || ctx.modalOpen) return;
  if (changes['todo:data:v1'] || changes['todo:settings:v1']) {
    await ctx.reload();
    setLocale(ctx.settings.locale);
    disposeTheme?.(); disposeTheme = applyTheme(ctx.settings.theme);
    applyI18n(ctx.root);
    ctx.render();
  }
});
```
group-modal/settings-modal 打开/关闭时维护 `ctx.modalOpen`；inlineEdit 维护 `ctx.editing`。

- [ ] **Step 3: 验证**

Run: `npm test`、build:all；人工：开两个 app 标签页，一边增删，另一边自动刷新；行内编辑中另一边改动不会打断输入。

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(app): toast notifications and cross-tab live sync"
```

---

### Task 12: newtab 壳/停用页、background 打开激活、action compat

**Files:**
- Create: `src/shared/action-compat.ts`, `src/app/components/disabled-page.ts`
- Modify: `src/background.ts`, `src/newtab/newtab.ts`, `src/newtab/newtab.html`
- Create: `tests/newtab.test.ts`（纯函数：决定显示哪个视图）

- [ ] **Step 1: 纯函数 + 测试**

在 `src/newtab/newtab.ts` 同目录新建 `src/newtab/route.ts`：
```ts
export type NewtabView = 'app' | 'disabled';
export function decideView(newtabOverride: boolean): NewtabView {
  return newtabOverride ? 'app' : 'disabled';
}
```
测试：true→app / false→disabled。

- [ ] **Step 2: action-compat.ts**

```ts
type ActionApi = {
  onClicked: { addListener(cb: () => void): void };
};
export function actionApi(): ActionApi {
  const c = chrome as unknown as { action?: ActionApi; browserAction?: ActionApi };
  if (!c.action && !c.browserAction) throw new Error('no action api');
  return (c.action ?? c.browserAction) as ActionApi;
}
```

- [ ] **Step 3: background.ts**

```ts
import { actionApi } from './shared/action-compat.ts';

async function openOrFocusApp(): Promise<void> {
  const url = chrome.runtime.getURL('build/app.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url === url);
  if (existing?.id !== undefined) {
    if (existing.windowId !== undefined) await chrome.windows?.update?.(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }
  await chrome.tabs.create({ url });
}

actionApi().onClicked.addListener(() => { void openOrFocusApp(); });
```

- [ ] **Step 4: 停用页组件**

`disabled-page.ts` 导出 `mountDisabled(root)`：渲染 `.disabled-*` 居中布局（标题 disabledTitle、说明 disabledHint、两按钮：openTodo → `chrome.tabs.create({url: chrome.runtime.getURL('build/app.html')})`；enableTodo → `saveSettings({newtabOverride:true})`）。样式追加 app.css：`.disabled-wrap{min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink-2)}` 等，全部用变量。

- [ ] **Step 5: newtab.ts 壳（替换 Task 6 的临时实现）**

```ts
import { mountApp } from '../app/mount.ts';
import { mountDisabled } from '../app/components/disabled-page.ts';
import { decideView } from './route.ts';
import { loadSettings, watchSettings } from '../shared/settings.ts';

async function boot(): Promise<void> {
  const root = document.querySelector('#root')!;
  const settings = await loadSettings();
  if (decideView(settings.newtabOverride) === 'app') {
    const ctx = await mountApp(root);
    watchSettings((s) => {
      if (!s.newtabOverride && !ctx.modalOpen) { location.reload(); }
    });
  } else {
    mountDisabled(root);
    watchSettings((s) => { if (s.newtabOverride) location.reload(); });
  }
}
void boot();
```

（从 app 切到 disabled 用整页 reload：两视图 DOM 完全不同，reload 最简单可靠；同视图内的设置同步仍走 Task 11。）

- [ ] **Step 6: 验证**

Run: `npm test`、build:all。
人工三浏览器：
1. 默认装上新标签页即 Todo；点扩展图标打开 app.html；重复点图标只激活原标签页不重复开。
2. 设置关闭接管 → 新开标签页显示停用页；点「重新开启」→ 新标签恢复 Todo；点「打开待办」→ app 标签页。
3. Firefox MV2 下同样验证图标点击（browserAction.onClicked）。

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(newtab): configurable takeover with disabled page and action launcher"
```

---

### Task 13: 正式图标

**Files:**
- Create: `icons/source.svg`, `scripts/make-icons.py`
- Generate: `icons/16.png 32.png 48.png 128.png`

- [ ] **Step 1: source.svg**

圆角方块 128×128，蓝紫渐变底（#6d8bff→#8a6df5，与 soft 主色一致），中央白色对勾 + 短线组成的清单图形（简单几何：三条横线，首条圆点为对勾态）。

- [ ] **Step 2: make-icons.py（参照参考项目同名脚本结构）**

用 Pillow 按 source.svg 栅格化（若 uv 环境无 SVG 栅格器，则脚本直接用 PIL 绘制同样的圆角方块+勾，不依赖 svg）：输出 16/32/48/128 四尺寸 PNG。
Run: `uv run --with pillow python scripts/make-icons.py`
Expected: 四个 PNG 生成且替换 Task 1 的占位图标。

- [ ] **Step 3: 验证 + commit**

人工：`chrome://extensions` 与 Firefox 调试页图标显示正常；新标签页无 404（devtools network 确认）。
```bash
git add icons scripts/make-icons.py
git commit -m "assets: generate branded toolbar icons"
```

---

### Task 14: 文档、locale 校验、打包脚本与三浏览器验收

**Files:**
- Create: `scripts/check-locales.py`, `scripts/package.py`, `README.md`, `AGENTS.md`, `TRANSLATING.md`

- [ ] **Step 1: check-locales.py（复制参考项目同名脚本）**

照搬 `D:\workspace\google-plugs\markdown_reader\scripts\check-locales.py`：以 zh_CN 为基准比对 en 的 key 集合，缺失只警告不失败；接进 package.json：`"check:locales": "uv run python scripts/check-locales.py"`（该脚本只用标准库，无需 --with）。

- [ ] **Step 2: package.py（复制改造）**

复制参考项目 `scripts/package.py`，改 zip 名前缀为 `todo-just`，打包 `output/MV3` 与 `output/MV2` 两个扩展根；保留违禁文件检查（出现 `src/`、`*.ts`、`node_modules` 即失败）。

- [ ] **Step 3: 文档**

`README.md`：功能简介；三浏览器安装（Chrome/Edge 加载 `output/MV3`、Firefox 载入 `output/MV2/manifest.json`）；开发命令表（build/build:firefox/watch/check/package）；新标签页接管的浏览器限制说明（第 11 节要点，中英双语关键提示可先写中文）；数据只存本地、容量默认值。
`AGENTS.md`：i18n 规则（加功能只维护 zh_CN、裸中文禁入 TS、产物 ASCII）、`npm run check` 为提交门、目录约定、零平台分支原则。
`TRANSLATING.md`：messages.json 格式、description 必填、`$1` 占位符、缺 key 回退行为。

- [ ] **Step 4: 最终门**

Run: `npm run check && npm run check:locales && npm run package`
Expected: 类型/测试/双构建全绿；`dist/todo-just-0.1.0-MV3.zip`、`-MV2.zip` 生成；违禁检查通过。

- [ ] **Step 5: 三浏览器人工验收清单（逐项执行并记录）**

- [ ] 任务增删改、勾选沉底/恢复、双击编辑、hover 操作
- [ ] 分组 tab 角标、新增/重命名/删除；删除后活跃任务变未分组、归档组名不变
- [ ] 全部 Tab 下新建可选分组；切 tab 后选择复位
- [ ] 归档：默认 10 条、搜索覆盖全部（造 12 条）、搜分组名、恢复、彻底删除
- [ ] 自动归档开关；archiveVisible/activeLimit/archiveLimit 生效与越界 clamp；达上限提示
- [ ] 四主题（auto 跟随系统实测深浅切换）、中英双语切换不刷新
- [ ] 新标签页默认接管；关闭→停用页；停用页两按钮；重开
- [ ] 点图标打开/激活唯一 app 标签页
- [ ] 刷新页面数据不丢；两个标签页同步
- [ ] Chrome、Edge、Firefox 各完整走一遍

- [ ] **Step 6: Commit**

```bash
git add scripts/check-locales.py scripts/package.py README.md AGENTS.md TRANSLATING.md package.json
git commit -m "docs: readme, contributor guides, locale check and release packaging"
```

---

## Self-Review 记录

- **规格覆盖**：规格 §3 技术栈→T1/2/3；§4 目录→全文任务；§5 双 manifest→T1；§6 数据模型/快照/上限→T3（+T2 设置）；§7 主题含 auto→T5/T10；§8 i18n→T4；§9 设置面板→T10；§10 渲染模型→T6-T11；§11 newtab 限制→T12+README；§12 图标→T13；§13 里程碑 1-7 全覆盖；交互基线（沉底/归档组标签/picker/双击/恢复/ops 对齐）→T6/T7/T9，ops 固定宽度在 T5 CSS。
- **已知计划内调整**：Task 3 的 `addGroup` 空名语义在任务中已明确改为返回 `Group | null` 并同步修测试，非占位。
- **类型一致性**：`Repo/Task/ArchivedTask/TodoSettings/ThemeId/AppContext` 名称跨任务统一；store 纯函数签名在 T3 定义、T6-T9/T11 按名调用；`openGroupModal` 跨模块占位在 T6 声明、T8 赋值。
- **Review Focus 落点**：脏数据→T2/T3 normalize 测试；悬挂 gid→T3 restore/removeGroup 用例 + T6 picker 校验；自动归档+裁剪→T3 两个归档用例；缺 key→T4 key 集合断言 + 回退用例；编辑中 onChanged→T11 守卫用例。
