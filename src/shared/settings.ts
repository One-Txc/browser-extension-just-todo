export type ThemeId = 'auto' | 'soft' | 'minimal' | 'dark' | 'eyecare';
export type LocaleId = 'auto' | 'zh_CN' | 'en';
/** 新建（含恢复归档）的任务插在待办列表的最前还是最后 */
export type NewTaskPosition = 'first' | 'last';

export interface TodoSettings {
  locale: LocaleId;
  theme: ThemeId;
  autoArchive: boolean;
  archiveVisible: number;
  newtabOverride: boolean;
  newTaskPosition: NewTaskPosition;
  activeLimit: number;
  archiveLimit: number;
}

export const DEFAULT_SETTINGS: TodoSettings = {
  locale: 'auto',
  theme: 'auto',
  autoArchive: false,
  archiveVisible: 10,
  newtabOverride: true,
  newTaskPosition: 'last',
  activeLimit: 50,
  archiveLimit: 100,
};

export const LIMITS = {
  archiveVisible: { min: 1, max: 100 },
  activeLimit: { min: 20, max: 1000 },
  archiveLimit: { min: 50, max: 5000 },
} as const;

const SETTINGS_KEY = 'todo:settings:v1';
const THEMES: readonly ThemeId[] = ['auto', 'soft', 'minimal', 'dark', 'eyecare'];
const LOCALES: readonly LocaleId[] = ['auto', 'zh_CN', 'en'];
const POSITIONS: readonly NewTaskPosition[] = ['first', 'last'];

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
    newTaskPosition: oneOf(r.newTaskPosition, POSITIONS, DEFAULT_SETTINGS.newTaskPosition),
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
    if (area === 'local' && changes[SETTINGS_KEY]) {
      cb(normalizeSettings(changes[SETTINGS_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
