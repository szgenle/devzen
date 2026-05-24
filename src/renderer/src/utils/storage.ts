import type { ProjectInfo } from '@shared/types';

/**
 * 扫描结果本地快照。
 * 让用户重新打开应用时能直接看到上次的项目清单，
 * 不必每次都等扫描，符合「先看见再行动」的产品定位。
 * 用 localStorage 而非主进程文件存储，因为：
 *  1. 数据量不大（项目元信息 + 路径），渲染端足以承载；
 *  2. 跟随浏览器存储生命周期，卸载/清缓存自然清除，无需额外清理逻辑。
 */
const KEY = 'devzen.snapshot.v1';

export interface Snapshot {
  rootDir: string;
  projects: ProjectInfo[];
  scannedAt: number;
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed.rootDir || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshot(snap: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // 存储失败（如配额不足）不应阻断主流程，静默忽略。
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
