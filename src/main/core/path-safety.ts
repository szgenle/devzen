import path from 'node:path';
import { app } from 'electron';
import { listAll as listHistory } from './history-store.js';

/**
 * 跨模块共享的路径安全准入。
 *
 * 历史教训：早期 cleaner / bundler / archiver 各自硬卡 `os.homedir()` 内才允许操作，
 * 这在 macOS 单盘场景没问题，但在 Windows 多盘工作流（`D:\workspace\...`）下会
 * 把所有合法操作都误拒——因为 `path.relative('C:\\Users\\xxx', 'D:\\...')`
 * 跨盘符返回的就是绝对路径 `D:\...`，触发 `path.isAbsolute(rel)` 判定失败。
 *
 * 现在统一策略：**target 必须位于 home 或某个已扫描根之内（含等于自身）**。
 * - 已扫描根来自 `history-store` 的 `listAll()`，覆盖 D:\workspace 这类用户主动扫过的目录
 * - home 作为兜底，覆盖 ~/Dev 等典型 macOS / Linux 项目目录
 * - 跨盘符通过对比 normalize 后的字符串解决，不再依赖 `path.relative` 的"绝对路径"语义
 * - Windows 不区分大小写，比较时统一转小写
 *
 * 若需要更严格的子目录白名单（如 cleaner 那样要求"项目根 + `node_modules` 等指定目录名"），
 * 由调用方在通过本校验后再叠加，本模块只负责"边界外不准动"。
 */

const IS_WIN = process.platform === 'win32';

function normalizeForCompare(p: string): string {
  const n = path.normalize(p);
  return IS_WIN ? n.toLowerCase() : n;
}

/** target 是否严格位于 base 之下，或与 base 完全相同 */
function isInsideOrEqual(target: string, base: string): boolean {
  const t = normalizeForCompare(target);
  const b = normalizeForCompare(base);
  if (t === b) return true;
  const rel = path.relative(b, t);
  // 跨盘符时 rel 是绝对路径；逃逸时以 `..` 开头；空串表示等价（已上方处理）
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 收集所有允许的根：用户家目录 + 历史扫描根 */
function getAllowedBases(): string[] {
  const bases: string[] = [];
  try {
    const home = app.getPath('home');
    if (home) bases.push(path.normalize(home));
  } catch {
    // 主进程未 ready 等极端场景，忽略
  }
  try {
    for (const e of listHistory()) {
      if (e.rootDir) bases.push(path.normalize(e.rootDir));
    }
  } catch {
    // 读历史失败不影响 home 兜底
  }
  return bases;
}

/**
 * 抛错版准入校验：target 必须为绝对路径，且位于 home 或某个已扫描根之内。
 * 适用于 bundler / ipc 等需要中断流程的入口。
 */
export function ensureInsideAllowedRoot(target: string, label = '路径'): void {
  if (!path.isAbsolute(target)) throw new Error(`${label}必须为绝对路径`);
  const bases = getAllowedBases();
  if (bases.length === 0) throw new Error('无法确定允许的根目录');
  const normalized = path.normalize(target);
  if (!bases.some((b) => isInsideOrEqual(normalized, b))) {
    throw new Error(`出于安全考虑，${label}必须位于已扫描的目录或用户家目录内`);
  }
}

/**
 * 返回值版准入校验：通过返回 null，否则返回错误描述。
 * 适用于 archiver 那种需要把校验结果写进结构化结果对象的场景。
 */
export function checkInsideAllowedRoot(
  target: string,
  label = '路径'
): string | null {
  try {
    ensureInsideAllowedRoot(target, label);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
