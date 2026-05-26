import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { HistoryEntry } from '@shared/types';

/**
 * 扫描历史集中存储（主进程同步 JSON 文件）。
 *
 * 为什么不再用 renderer 的 localStorage：
 *  1. dev 模式下 Vite 端口漂移会让 localStorage 按 origin 隔离，重启读不到上次的；
 *  2. Chromium 的 LevelDB 是异步刷盘，Ctrl+C / SIGINT 强杀时可能丢失刚 setItem 的数据；
 *  3. 主进程 JSON + 原子 rename 跟 archive-store.ts 一致，dev/打包都同一个数据源。
 *
 * 选择同步 fs 而非 archive-store 的 async 链：
 *  扫描历史是低频写入（一次扫描一次），同步阻塞可以忽略；同步路径下函数返回时
 *  数据已写入 OS page cache，比 promise 链更抗强杀。
 */

interface HistoryFile {
  version: 1;
  entries: HistoryEntry[];
}

let cachePath: string | null = null;
function getStorePath(): string {
  if (cachePath) return cachePath;
  cachePath = path.join(app.getPath('userData'), 'devzen', 'history.json');
  return cachePath;
}

function readSafe(): HistoryEntry[] {
  const file = getStorePath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as HistoryFile;
    if (parsed && Array.isArray(parsed.entries)) {
      // 兜底过滤掉缺主键的脏数据
      return parsed.entries.filter((e) => e && typeof e.rootDir === 'string');
    }
    return [];
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

function writeSync(entries: HistoryEntry[]): void {
  const file = getStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data: HistoryFile = { version: 1, entries };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** 读取全部记录，按 scannedAt 倒序（最新在前） */
export function listAll(): HistoryEntry[] {
  return [...readSafe()].sort((a, b) => b.scannedAt - a.scannedAt);
}

/** 按 rootDir 主键插入或替换；返回排序后的新列表 */
export function upsert(entry: HistoryEntry): HistoryEntry[] {
  const list = readSafe().filter((e) => e.rootDir !== entry.rootDir);
  list.push(entry);
  list.sort((a, b) => b.scannedAt - a.scannedAt);
  writeSync(list);
  return list;
}

/** 按 rootDir 主键删除；返回剩余列表 */
export function remove(rootDir: string): HistoryEntry[] {
  const list = readSafe().filter((e) => e.rootDir !== rootDir);
  list.sort((a, b) => b.scannedAt - a.scannedAt);
  writeSync(list);
  return list;
}

/**
 * 批量合并：把传入的若干条目并入现有列表。
 * 同 rootDir 出现冲突时保留 scannedAt 较新的一份。
 * 用于把 renderer 旧 localStorage 中的历史一次性迁移到主进程。
 */
export function bulkMerge(entries: HistoryEntry[]): HistoryEntry[] {
  const existing = readSafe();
  const map = new Map<string, HistoryEntry>();
  for (const e of existing) map.set(e.rootDir, e);
  for (const e of entries) {
    if (!e || typeof e.rootDir !== 'string') continue;
    const old = map.get(e.rootDir);
    if (!old || (e.scannedAt ?? 0) > (old.scannedAt ?? 0)) {
      map.set(e.rootDir, e);
    }
  }
  const merged = Array.from(map.values()).sort((a, b) => b.scannedAt - a.scannedAt);
  writeSync(merged);
  return merged;
}
