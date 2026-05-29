import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { BundleRecord } from '@shared/types';

/**
 * 冷备包索引集中存储。
 *
 * 设计要点：
 *  - 文件位置：app.getPath('userData')/devzen/bundles.json
 *  - 串行化读写：通过单一 promise chain 避免并发写入交错；每次写都先写 .tmp 再 rename
 *  - 只存元信息，不持久化 bundleExists（运行时动态刷新）
 *
 * 与 archive-store 完全解耦：归档（瘦身）与冷备包（打包）是两个独立概念。
 * 即使 archives.json 丢失，bundles.json 仍可独立工作。
 */

interface BundlesFile {
  version: 1;
  records: BundleRecord[];
}

let cachePath: string | null = null;
function getStorePath(): string {
  if (cachePath) return cachePath;
  cachePath = path.join(app.getPath('userData'), 'devzen', 'bundles.json');
  return cachePath;
}

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readFile(): Promise<BundleRecord[]> {
  const file = getStorePath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as BundlesFile;
    if (parsed && Array.isArray(parsed.records)) {
      return parsed.records.filter((r) => r && typeof r.id === 'string' && typeof r.bundlePath === 'string');
    }
    return [];
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

async function writeFile(records: BundleRecord[]): Promise<void> {
  const file = getStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const data: BundlesFile = { version: 1, records };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** 读取全部记录，按 bundledAt 倒序（最新在前） */
export function listAll(): Promise<BundleRecord[]> {
  return exclusive(async () => {
    const list = await readFile();
    return [...list].sort((a, b) => b.bundledAt - a.bundledAt);
  });
}

/** 按 id 主键插入或替换 */
export function upsert(record: BundleRecord): Promise<void> {
  return exclusive(async () => {
    const list = await readFile();
    const next = list.filter((r) => r.id !== record.id);
    next.push(record);
    await writeFile(next);
  });
}

/** 按 id 主键删除 */
export function remove(id: string): Promise<void> {
  return exclusive(async () => {
    const list = await readFile();
    const next = list.filter((r) => r.id !== id);
    await writeFile(next);
  });
}

/** 查询单条 */
export function findOne(id: string): Promise<BundleRecord | null> {
  return exclusive(async () => {
    const list = await readFile();
    return list.find((r) => r.id === id) ?? null;
  });
}
