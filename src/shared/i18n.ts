/**
 * 国际化：语言包静态 import，t() 同步返回。
 *
 * 回退链：手动选定语言 → chrome.i18n → zh_CN → key 本身。
 * 语言 id 为 'auto' 时按 chrome.i18n.getUILanguage() 映射（en* → en，其余 → zh_CN）。
 */

import enMessages from '../../_locales/en/messages.json';
import zhMessages from '../../_locales/zh_CN/messages.json';

export type UILocale = 'zh_CN' | 'en';
export type LocaleSetting = 'auto' | UILocale;

interface MessageEntry {
  message: string;
  description?: string;
}

type MessageTable = Record<string, MessageEntry>;

const TABLES: Record<UILocale, MessageTable> = {
  zh_CN: zhMessages as MessageTable,
  en: enMessages as MessageTable,
};

let current: LocaleSetting = 'auto';

export function setLocale(locale: LocaleSetting): void {
  current = locale;
}

function browserLocale(): UILocale {
  try {
    const lang = chrome.i18n?.getUILanguage?.();
    return lang && lang.toLowerCase().startsWith('en') ? 'en' : 'zh_CN';
  } catch {
    return 'zh_CN';
  }
}

/** 当前实际生效的语言：手动选定则用它，否则按浏览器语言映射 */
export function getResolvedLocale(): UILocale {
  return current === 'auto' ? browserLocale() : current;
}

/** $1 $2 … 占位符替换，沿用 Chrome 的占位符语法 */
function applySubs(text: string, subs?: string[]): string {
  if (!subs || subs.length === 0) return text;
  return text.replace(/\$(\d+)/g, (whole, idx: string) => {
    const i = Number(idx) - 1;
    return subs[i] ?? whole;
  });
}

function nativeGet(key: string, subs?: string[]): string {
  try {
    return chrome.i18n?.getMessage?.(key, subs) ?? '';
  } catch {
    return '';
  }
}

/**
 * 取文案。查不到时返回 key 本身，便于一眼发现漏翻。
 */
export function t(key: string, subs?: string[]): string {
  const entry = TABLES[getResolvedLocale()]?.[key];
  if (entry) return applySubs(entry.message, subs);

  const native = nativeGet(key, subs);
  if (native) return native;

  const fallback = TABLES.zh_CN[key];
  if (fallback) return applySubs(fallback.message, subs);

  return key;
}

/** 把 root 下带 data-i18n / data-i18n-placeholder / data-i18n-title 的节点填充为当前语言 */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) (el as HTMLInputElement).placeholder = t(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) (el as HTMLElement).title = t(key);
  });
}
