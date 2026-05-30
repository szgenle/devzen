import { promises as fs, constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CleanResult } from '@shared/types';
import { CLEANABLE_DIR_NAMES } from './cleanable-names.js';

const IS_WIN = process.platform === 'win32';

/**
 * Windows 下将绝对路径包装为 \\?\ 长路径前缀，绕过 MAX_PATH=260 限制。
 * 对 node_modules 等深层嵌套目录尤为关键。
 */
function toLongPath(p: string): string {
  if (!IS_WIN) return p;
  if (p.startsWith('\\\\?\\')) return p;
  if (!path.isAbsolute(p)) return p;
  const normalized = path.win32.normalize(p);
  if (normalized.startsWith('\\\\')) {
    // UNC 路径：\\server\share -> \\?\UNC\server\share
    return '\\\\?\\UNC\\' + normalized.slice(2);
  }
  return '\\\\?\\' + normalized;
}

/**
 * Windows 下递归清除只读属性，避免 EPERM。
 * 仅在首次 rm 失败后调用，避免对大目录无谓开销。
 */
async function clearReadonlyRecursive(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isSymbolicLink()) continue;
      // 0o666：可读可写，清除只读位
      await fs.chmod(full, 0o666).catch(() => undefined);
      if (e.isDirectory()) {
        await clearReadonlyRecursive(full);
      }
    } catch {
      // ignore
    }
  }
  await fs.chmod(dir, 0o777).catch(() => undefined);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

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

  const home = os.homedir();
  if (!home) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: '出于安全考虑，仅允许清理用户家目录内的目录'
    };
  }
  const rel = path.relative(path.normalize(home), path.normalize(target));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
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

  // 删除前先量一次原始大小，作为释放字节的上界
  const before = await dirSize(target);
  const rmTarget = toLongPath(target);
  const rmOpts = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 };

  let firstError: Error | undefined;
  try {
    await fs.rm(rmTarget, rmOpts);
  } catch (e) {
    firstError = e as Error;
    // Windows 常见 EPERM/EACCES：先清只读位再重试
    if (IS_WIN) {
      try {
        await clearReadonlyRecursive(target);
        await fs.rm(rmTarget, rmOpts);
        firstError = undefined;
      } catch (e2) {
        firstError = e2 as Error;
      }
    }
  }

  // 通过实际剩余大小校准释放字节数：避免 "报告成功但目录还在" 的假象
  const stillExists = await pathExists(target);
  const remaining = stillExists ? await dirSize(target) : 0;
  const freed = Math.max(0, before - remaining);

  if (!stillExists) {
    return { path: target, success: true, freedBytes: freed };
  }

  // 目录仍存在：根据是否有残留文件区分"完全失败"和"部分清理"
  const errMsg = firstError
    ? firstError.message
    : remaining > 0
      ? '部分文件未能删除（可能被占用或权限不足）'
      : '目录未能删除';
  return {
    path: target,
    success: false,
    freedBytes: freed,
    error: errMsg
  };
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
