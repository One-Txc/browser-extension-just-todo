import type { ThemeId } from './settings.ts';

export type ResolvedTheme = 'soft' | 'minimal' | 'dark' | 'eyecare';

export function resolveTheme(theme: ThemeId, prefersDark: boolean): ResolvedTheme {
  if (theme === 'auto') return prefersDark ? 'dark' : 'soft';
  return theme;
}

export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; labelKey: string }> = [
  { id: 'auto', labelKey: 'themeAuto' },
  { id: 'soft', labelKey: 'themeSoft' },
  { id: 'minimal', labelKey: 'themeMinimal' },
  { id: 'dark', labelKey: 'themeDark' },
  { id: 'eyecare', labelKey: 'themeEyeCare' },
];

/** 写 <html data-theme>；theme 为 auto 时监听系统切换，返回解绑函数 */
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
