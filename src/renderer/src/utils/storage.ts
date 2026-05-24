import type { ProjectInfo } from '@shared/types';

/**
 * 扫描历史本地存档。
 *
 * 设计要点：
 *  1. 一个用户通常会反复在几个固定目录下工作（如 ~/Dev、~/Work），
 *     与其只记最后一次扫描，不如把每个被扫描过的根目录都作为独立条目存起来。
 *  2. 用户每次进入应用先停在首页看历史列表，自己决定"查看上次结果"还是
 *     "重新扫描"。清理是低频操作，没必要每次自动重扫。
 *  3. 数据全部放在渲染端 localStorage：项目元信息体量不大，无跨进程同步需求，
 *     卸载/清缓存时自然清除，不留垃圾。
 */
const KEY = 'devzen.history.v1';
/** 旧版只保存最后一次扫描的 key，启动时做一次性迁移 */
const LEGACY_KEY = 'devzen.snapshot.v1';

export interface HistoryEntry {
  rootDir: string;
  projects: ProjectInfo[];
  scannedAt: number;
}

interface HistoryFile {
  entries: HistoryEntry[];
}

function read(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HistoryFile;
      if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
    }
    // 兼容：把旧的单条 snapshot 迁移到新结构
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const snap = JSON.parse(legacy) as HistoryEntry;
      if (snap && snap.rootDir && Array.isArray(snap.projects)) {
        const entries: HistoryEntry[] = [snap];
        write(entries);
        localStorage.removeItem(LEGACY_KEY);
        return entries;
      }
    }
  } catch {
    // 解析失败视为无历史，避免阻断启动
  }
  return [];
}

function write(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ entries } as HistoryFile));
  } catch {
    // 配额不足等问题静默忽略
  }
}

/** 读取全部历史，按 scannedAt 倒序（最新在前） */
export function loadHistory(): HistoryEntry[] {
  return [...read()].sort((a, b) => b.scannedAt - a.scannedAt);
}

/** 按 rootDir 插入或替换；返回排序后的新列表 */
export function upsertHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const list = read().filter((e) => e.rootDir !== entry.rootDir);
  list.push(entry);
  list.sort((a, b) => b.scannedAt - a.scannedAt);
  write(list);
  return list;
}

/** 删除指定 rootDir 的历史条目 */
export function removeHistoryEntry(rootDir: string): HistoryEntry[] {
  const list = read().filter((e) => e.rootDir !== rootDir);
  list.sort((a, b) => b.scannedAt - a.scannedAt);
  write(list);
  return list;
}
