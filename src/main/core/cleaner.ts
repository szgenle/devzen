import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { CleanResult, CleanProgress } from '@shared/types';
import { CLEANABLE_DIR_NAMES } from './cleanable-names.js';

const IS_WIN = process.platform === 'win32';

/** Windows 路径不区分大小写；统一规范化用于父子路径比较 */
function normalizeForCompare(p: string): string {
  const n = path.normalize(p);
  return IS_WIN ? n.toLowerCase() : n;
}

/**
 * 判断 child 是否严格位于 parent 之下（不允许等于 parent）。
 * 自动处理跨盘符（Windows）、`..` 逃逸等情况。
 */
function isStrictlyInside(child: string, parent: string): boolean {
  const c = normalizeForCompare(child);
  const p = normalizeForCompare(parent);
  if (c === p) return false;
  const rel = path.relative(p, c);
  if (!rel || rel === '') return false;
  if (rel.startsWith('..')) return false;
  if (path.isAbsolute(rel)) return false; // 跨盘符
  return true;
}

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
 *  1. 必须是绝对路径
 *  2. 必须真实存在且为目录
 *  3. **必须严格位于某个已知项目根之下**（projectRoots 来自当前扫描结果）
 *  4. 目录名必须在 CLEANABLE_DIR_NAMES 白名单内
 *  5. 不允许等于项目根本身（防误删项目）
 *  6. 不允许是文件系统根 / 用户家目录
 *
 * 调用方（IPC handler）必须传入项目根列表；二次确认在渲染层完成。
 */
export async function cleanDirectories(
  paths: string[],
  projectRoots: string[],
  onProgress?: (p: CleanProgress) => void
): Promise<CleanResult[]> {
  const roots = (projectRoots || []).filter((r) => typeof r === 'string' && path.isAbsolute(r));
  const results: CleanResult[] = [];
  const total = paths.length;
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const name = path.basename(p);
    onProgress?.({ index: i + 1, total, path: p, name, phase: 'start' });
    const result = await cleanOne(p, roots);
    results.push(result);
    onProgress?.({ index: i + 1, total, path: p, name, phase: 'done', result });
  }
  return results;
}

async function cleanOne(target: string, projectRoots: string[]): Promise<CleanResult> {
  if (!path.isAbsolute(target)) {
    return { path: target, success: false, freedBytes: 0, error: '路径必须为绝对路径' };
  }

  // 安全准入 1：必须严格位于某个已扫描项目根之下
  const matchedRoot = projectRoots.find((root) => isStrictlyInside(target, root));
  if (!matchedRoot) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: '出于安全考虑，仅允许清理已扫描项目根目录内的子目录'
    };
  }

  // 安全准入 2：白名单目录名（防误删项目根 / 任意目录）
  if (!CLEANABLE_DIR_NAMES.has(path.basename(target))) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: `目录名 ${path.basename(target)} 不在白名单内`
    };
  }

  // 安全准入 3：兜底——拒绝任何过短路径（盘根 / 顶层目录）
  const segs = path.normalize(target).split(path.sep).filter(Boolean);
  if (segs.length < 2) {
    return {
      path: target,
      success: false,
      freedBytes: 0,
      error: '路径过短，拒绝清理'
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
