/**
 * 项目"快速启动"使用的编辑器 / 终端管理。
 *
 * 设计要点：
 *  1. 不在全局首选项中固定某个编辑器 —— 不同项目用不同 AI 编辑器是常态
 *     （Qoder / Trae / CodeBuddy / Cursor / VSCode …）。
 *  2. 每个项目独立记忆"上次用的编辑器/终端"，存 localStorage。
 *  3. 首次未记忆时，按扫描阶段写入的 project.suggestedEditor 兜底（基于
 *     项目根目录的特征文件，如 .qoder / .trae / .cursor / .vscode 等）。
 *  4. 提供一份常见应用清单，渲染层用作下拉菜单。用户也可在菜单中"自定义…"。
 */

import type { ProjectInfo } from '../../../shared/types';

/** localStorage key */
const KEY = 'devzen.recentLaunch.v1';

interface Entry {
  editor?: string;
  terminal?: string;
}

type Store = Record<string, Entry>;

/** 常见编辑器列表（macOS .app 名）。优先列国内 AI 编程工具，便于一键命中。 */
export const COMMON_EDITORS: readonly string[] = [
  'Visual Studio Code',
  'Cursor',
  'Qoder',
  'Trae',
  'Trae CN',
  'CodeBuddy',
  'Windsurf',
  'Zed',
  'Sublime Text',
  'WebStorm',
  'IntelliJ IDEA',
  'PyCharm',
  'GoLand',
  'Android Studio',
  'Xcode'
];

/** 常见终端列表（macOS .app 名） */
export const COMMON_TERMINALS: readonly string[] = [
  'Terminal',
  'iTerm',
  'Warp',
  'Ghostty',
  'WezTerm',
  'Hyper',
  'Alacritty',
  'Kitty'
];

/** 默认 fallback：用户从未为该项目选择过时使用 */
export const DEFAULT_EDITOR = 'Visual Studio Code';
export const DEFAULT_TERMINAL = 'Terminal';

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    // 解析失败回退空 store
  }
  return {};
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 静默忽略
  }
}

/** 取项目最近一次使用的编辑器；无记录返回 null */
export function getRecentEditor(projectPath: string): string | null {
  return read()[projectPath]?.editor ?? null;
}

/** 取项目最近一次使用的终端；无记录返回 null */
export function getRecentTerminal(projectPath: string): string | null {
  return read()[projectPath]?.terminal ?? null;
}

/** 写入项目最近一次使用的编辑器 */
export function setRecentEditor(projectPath: string, app: string): void {
  if (!app) return;
  const store = read();
  store[projectPath] = { ...store[projectPath], editor: app };
  write(store);
}

/** 写入项目最近一次使用的终端 */
export function setRecentTerminal(projectPath: string, app: string): void {
  if (!app) return;
  const store = read();
  store[projectPath] = { ...store[projectPath], terminal: app };
  write(store);
}

/**
 * 解析项目"默认要打开的编辑器"。
 * 优先级：用户最近选过的 > 扫描阶段按目录特征推断的 > DEFAULT_EDITOR。
 */
export function getDefaultEditor(project: ProjectInfo): string {
  return getRecentEditor(project.path) ?? project.suggestedEditor ?? DEFAULT_EDITOR;
}

/**
 * 解析项目"默认要打开的终端"。
 * 终端没有项目特征可推断，所以仅有：用户最近选过的 > DEFAULT_TERMINAL。
 */
export function getDefaultTerminal(project: ProjectInfo): string {
  return getRecentTerminal(project.path) ?? DEFAULT_TERMINAL;
}
