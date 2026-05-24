/**
 * 可清理目录名白名单。
 *
 * 这些目录共同特点：
 *  - 由包管理器 / 构建工具产出
 *  - 删除后可由相应工具一键重建
 *  - 不包含用户手写的源代码或不可再生的本地配置
 *
 * cleaner（按勾选清理）和 archiver（项目归档）都依赖这份名单决定哪些
 * 目录可以被视为"安全删除"对象。集中维护避免两份硬编码漂移。
 */
export const CLEANABLE_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  'target',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'bin',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.gradle',
  'DerivedData',
  '.build',
  '.cxx'
]);
