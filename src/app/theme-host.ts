import { applyTheme } from '../shared/themes.ts';
import type { ThemeId } from '../shared/settings.ts';

let dispose: (() => void) | undefined;

/** 统一切换主题：销毁旧监听再应用新值（auto 时会监听系统深浅色变化） */
export function setTheme(theme: ThemeId): void {
  dispose?.();
  dispose = applyTheme(theme);
}
