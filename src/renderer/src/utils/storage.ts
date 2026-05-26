import type { HistoryEntry } from '@shared/types';

/**
 * 扫描历史本地存档（renderer 侧门面）。
 *
 * 历史架构演进：
 *  v1：renderer 用 localStorage 存历史。
 *      问题：dev 模式下 Vite 端口漂移会让 origin 变化、Chromium LevelDB 异步刷盘
 *           遇 Ctrl+C/SIGINT 会丢数据，反复出现"扫描后重启历史消失"。
 *  v2（当前）：所有读写改走主进程 IPC，历史写入 userData/devzen/history.json，
 *      同步落盘，dev/打包共用同一份数据，怎么强杀都不丢。
 *
 * 本文件保留原 API 形状（loadHistory / upsertHistoryEntry / removeHistoryEntry），
 * 只是把同步实现换成 async；旧 localStorage 中的历史会在首次启动时一次性迁移过去。
 */

export type { HistoryEntry } from '@shared/types';

/** 旧版 v1：renderer localStorage 中的多目录历史 */
const LEGACY_HISTORY_KEY = 'devzen.history.v1';
/** 更早的单条快照 key，已经在 v1 时尝试过迁移；这里再兜底处理一次 */
const LEGACY_SNAPSHOT_KEY = 'devzen.snapshot.v1';
/** 标记：已经把 localStorage 老数据合并到主进程，避免重复迁移 */
const MIGRATED_FLAG = 'devzen.history.migrated.v2';

interface LegacyHistoryFile {
  entries?: HistoryEntry[];
}

/** 从 localStorage 收集所有可迁移的历史条目（不删除原 key，便于回滚） */
function collectLegacyEntries(): HistoryEntry[] {
  const collected: HistoryEntry[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LegacyHistoryFile;
      if (parsed && Array.isArray(parsed.entries)) {
        for (const e of parsed.entries) {
          if (e && typeof e.rootDir === 'string') collected.push(e);
        }
      }
    }
  } catch {
    // 忽略损坏的旧数据
  }
  try {
    const legacy = localStorage.getItem(LEGACY_SNAPSHOT_KEY);
    if (legacy) {
      const snap = JSON.parse(legacy) as Partial<HistoryEntry>;
      if (snap && typeof snap.rootDir === 'string' && Array.isArray(snap.projects)) {
        collected.push(snap as HistoryEntry);
      }
    }
  } catch {
    // 忽略
  }
  return collected;
}

/**
 * 一次性把 localStorage 中的历史合并进主进程 history.json。
 * 即便迁移失败也吞掉错误：保证后续 listHistory 仍可正常工作。
 */
async function migrateLegacyOnce(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return;
    const legacy = collectLegacyEntries();
    if (legacy.length > 0) {
      await window.devzen.bulkMergeHistory(legacy);
    }
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    // 迁移失败不阻断启动；下次再试
  }
}

/** 读取全部历史，按 scannedAt 倒序（最新在前） */
export async function loadHistory(): Promise<HistoryEntry[]> {
  await migrateLegacyOnce();
  return window.devzen.listHistory();
}

/** 按 rootDir 插入或替换；返回排序后的新列表 */
export function upsertHistoryEntry(entry: HistoryEntry): Promise<HistoryEntry[]> {
  return window.devzen.upsertHistory(entry);
}

/** 删除指定 rootDir 的历史条目 */
export function removeHistoryEntry(rootDir: string): Promise<HistoryEntry[]> {
  return window.devzen.removeHistory(rootDir);
}
