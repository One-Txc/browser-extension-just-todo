/**
 * 测试运行器：esbuild 把 tests/**​/*.test.ts 打成 ESM 到 .test-build/，
 * 再交给 node 内置 test runner 执行（store/settings 等纯逻辑模块直接在 node 跑，
 * UI 测试在 tests/helpers/dom.ts 里挂 jsdom）。
 *
 * 用法：node scripts/test.mjs
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync, existsSync, readdirSync } from 'node:fs';

const candidates = [
  'tests/settings.test.ts',
  'tests/store.test.ts',
  'tests/i18n.test.ts',
  'tests/themes.test.ts',
  'tests/ui.test.ts',
  'tests/newtab.test.ts',
];
const entryPoints = candidates.filter((f) => existsSync(f));

rmSync('.test-build', { recursive: true, force: true });

if (entryPoints.length === 0) {
  console.error('no test entry points found');
  process.exit(1);
}

await build({
  entryPoints,
  outdir: '.test-build',
  bundle: true,
  format: 'esm',
  platform: 'node',
  loader: { '.css': 'text' },
  logLevel: 'warning',
});

// Node 22 的 `node --test <dir>` 会把目录当成测试文件路径去 require（MODULE_NOT_FOUND），
// 因此显式枚举产物文件；esbuild 对共享 tests/ 前缀的多入口打平输出到 outdir 根。
const files = readdirSync('.test-build')
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => `.test-build/${f}`);
execFileSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
