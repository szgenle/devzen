import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ArchiveRecord } from '@shared/types';

/**
 * 归档索引集中存储。
 *
 * 设计要点：
 *  - 文件位置：app.getPath('userData')/devzen/archives.json
 *  - 串行化读写：通过单一 promise chain 避免并发写入交错；每次写都先写 .tmp 再 rename，原子化
 *  - 只存元信息，不持久化 pathExists（运行时动态刷新）
 *
 * 为什么用 userData 而不是项目目录里再放一份：用户已经决定不在项目目录留 DevZen 痕迹，
 * 单一数据源更清晰；万一索引丢失，.git 还在也能手动 git restore 恢复，功能不致命。
 */

interface ArchivesFile {
  version: 1;
  records: ArchiveRecord[];
}

let cachePath: string | null = null;
function getStorePath(): string {
  if (cachePath) return cachePath;
  cachePath = path.join(app.getPath('userData'), 'devzen', 'archives.json');
  return cachePath;
}

// 单链 mutex：所有读写串行通过该 promise，避免读改写竞态
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  // 链上保留一个不会 reject 的尾巴，避免一次失败把整个链冻死
  chain = next.catch(() => undefined);
  return next;
}

async function readFile(): Promise<ArchiveRecord[]> {
  const file = getStorePath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as ArchivesFile;
    if (parsed && Array.isArray(parsed.records)) {
      // 兜底过滤掉缺主键的脏数据
      return parsed.records.filter((r) => r && typeof r.path === 'string');
    }
    return [];
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    // JSON 解析失败时不静默丢弃，向上抛便于排查；首页可降级显示空列表
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

async function writeFile(records: ArchiveRecord[]): Promise<void> {
  const file = getStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const data: ArchivesFile = { version: 1, records };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** 读取全部记录，按 archivedAt 倒序（最新在前） */
export function listAll(): Promise<ArchiveRecord[]> {
  return exclusive(async () => {
    const list = await readFile();
    return [...list].sort((a, b) => b.archivedAt - a.archivedAt);
  });
}

/** 按 path 主键插入或替换 */
export function upsert(record: ArchiveRecord): Promise<void> {
  return exclusive(async () => {
    const list = await readFile();
    const next = list.filter((r) => r.path !== record.path);
    next.push(record);
    await writeFile(next);
  });
}

/** 按 path 主键删除 */
export function remove(targetPath: string): Promise<void> {
  return exclusive(async () => {
    const list = await readFile();
    const next = list.filter((r) => r.path !== targetPath);
    await writeFile(next);
  });
}

/** 查询单条 */
export function findOne(targetPath: string): Promise<ArchiveRecord | null> {
  return exclusive(async () => {
    const list = await readFile();
    return list.find((r) => r.path === targetPath) ?? null;
  });
}
