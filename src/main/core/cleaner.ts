import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CleanResult } from '@shared/types';
import { CLEANABLE_DIR_NAMES } from './cleanable-names.js';

/**
 * 清理给定目录列表。每个目录在删除前会校验：
 * 1. 必须是绝对路径
 * 2. 必须真实存在且为目录
 * 3. 必须位于用户家目录内（防止误删系统目录）
 *
 * 二次确认应该在调用方（IPC handler / 渲染层）完成，
 * 此函数只负责执行物理删除，并返回每个目录的释放结果。
 */
export async function cleanDirectories(paths: string[]): Promise<CleanResult[]> {
  const results: CleanResult[] = [];
  for (const p of paths) {
    results.push(await cleanOne(p));
  }
  return results;
}

async function cleanOne(target: string): Promise<CleanResult> {
  if (!path.isAbsolute(target)) {
    return { path: target, success: false, freedBytes: 0, error: '路径必须为绝对路径' };
  }

  const home = process.env.HOME ?? '';
  if (!home || !target.startsWith(home + path.sep)) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: '出于安全考虑，仅允许清理用户家目录内的目录'
    };
  }

  // 防止误删项目根本身：只允许已知的可清理目录名
  // （此处仅做名字层面的二次保护，主要防御已在 scanner 中）
  if (!CLEANABLE_DIR_NAMES.has(path.basename(target))) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: `目录名 ${path.basename(target)} 不在白名单内`
    };
  }

  let st;
  try {
    st = await fs.stat(target);
  } catch (e) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: `路径不存在: ${(e as Error).message}`
    };
  }
  if (!st.isDirectory()) {
    return { path: target, success: false, freedBytes: 0, error: '不是目录' };
  }

  // 计算释放字节数（删除前算一次）
  const freed = await dirSize(target);
  try {
    await fs.rm(target, { recursive: true, force: true });
    return { path: target, success: true, freedBytes: freed };
  } catch (e) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: (e as Error).message
    };
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        total += await dirSize(full);
      } else if (e.isFile()) {
        const st = await fs.stat(full);
        total += st.size;
      }
    } catch {
      // ignore
    }
  }
  return total;
}
