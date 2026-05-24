/**
 * 用户偏好设置存储。
 *
 * 设计要点：
 *  1. 采用和 storage.ts / categories.ts 一致的 localStorage 持久化方式。
 *  2. 主题（dark/light）默认跟随系统；用户手动选择后锁定。
 *  3. 语言（zh/en）默认中文；未来可扩展更多语言。
 */

const KEY = 'devzen.preferences.v1';

export type ThemeMode = 'system' | 'dark' | 'light';
export type Lang = 'zh' | 'en';

export interface Preferences {
  theme: ThemeMode;
  lang: Lang;
}

const DEFAULTS: Preferences = {
  theme: 'system',
  lang: 'zh'
};

function read(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // 解析失败回退默认值
  }
  return { ...DEFAULTS };
}

function write(prefs: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 静默忽略
  }
}

export function loadPreferences(): Preferences {
  return read();
}

export function savePreferences(prefs: Preferences): void {
  write(prefs);
}

/**
 * 根据 theme 偏好计算实际应用的主题值（dark | light）。
 * system 模式下根据系统媒体查询判断。
 */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}
