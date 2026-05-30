import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ArchiveRecord,
  ArchiveResult,
  EcosystemId,
  ProjectDirtyInfo,
  RemoteProvider,
  RestoreResult
} from '@shared/types';
import { CLEANABLE_DIR_NAMES } from './cleanable-names.js';
import * as store from './archive-store.js';
import { checkInsideAllowedRoot } from './path-safety.js';

const execAsync = promisify(exec);

/**
 * 归档与恢复模块。
 *
 * 删除范围：
 *  - tracked 文件（git ls-files）：远程可恢复
 *  - 名字命中 CLEANABLE_DIR_NAMES 的目录（node_modules / target / .next 等）：构建工具可重建
 *
 * 保留：
 *  - .git/                        恢复源 + remote 信息（归档结束后会被重命名为 .git.devzen-archived）
 *  - untracked 但未 ignored 文件   用户脏文件
 *  - 其它 ignored 文件             .env / .npmrc / .vscode / 本地数据库等不可再生
 *  - 项目根目录本身               作为空墓碑，便于用户在 Finder 看到位置不变
 *
 * 防误提交：归档完成时把 .git → .git.devzen-archived，让 git/IDE/shell 提示符
 * 不再识别该目录为活仓库，避免用户在墓碑里 commit/push 把远程覆盖为空仓库。
 * 恢复时再改回 .git，对老版本归档（仍叫 .git）保持向后兼容。
 *
 * 归档与恢复都不调用网络，git restore 走本地对象库。
 */

/** 归档后 .git 的重命名形态，作为防误提交标记 */
export const ARCHIVED_GIT_DIR_NAME = '.git.devzen-archived';

/**
 * 解析项目当前的 git 目录形态：
 *  - '.git'                    活仓库 / 老版本归档
 *  - ARCHIVED_GIT_DIR_NAME    新版归档（已加防误提交标记）
 *  - null                      不是 git 仓库
 */
async function resolveGitDir(
  projectPath: string
): Promise<'.git' | typeof ARCHIVED_GIT_DIR_NAME | null> {
  if (await isDirectory(path.join(projectPath, '.git'))) return '.git';
  if (await isDirectory(path.join(projectPath, ARCHIVED_GIT_DIR_NAME))) {
    return ARCHIVED_GIT_DIR_NAME;
  }
  return null;
}

function ensureSafePath(target: string): string | null {
  // 路径准入已统一到 path-safety.ts：不再硬卡 home，而是允许
  // home ∩ 历史扫描根任一之内，解决 Windows 多盘场景下项目被误拒的问题。
  return checkInsideAllowedRoot(target, '项目路径');
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/** 读取首个 remote URL（优先 origin，否则取第一个 fetch URL） */
async function readPrimaryRemote(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git config --get remote.origin.url', {
      cwd: dir,
      timeout: 2000
    });
    const url = stdout.trim();
    if (url) return url;
  } catch {
    // origin 不存在，继续尝试 git remote -v
  }
  try {
    const { stdout } = await execAsync('git remote -v', { cwd: dir, timeout: 2000 });
    for (const line of stdout.split('\n')) {
      const m = line.match(/^\S+\t(.+)\s+\(fetch\)$/);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return null;
}

/** 获取所有 fetch URL，用于识别 RemoteProvider */
async function readAllRemoteUrls(dir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git remote -v', { cwd: dir, timeout: 2000 });
    const urls: string[] = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/^\S+\t(.+)\s+\(fetch\)$/);
      if (m) urls.push(m[1]);
    }
    return urls;
  } catch {
    return [];
  }
}

const PROVIDER_PATTERNS: Array<{ id: RemoteProvider; pattern: RegExp }> = [
  { id: 'github', pattern: /github\.com[:/]/i },
  { id: 'gitlab', pattern: /gitlab\.com[:/]/i },
  { id: 'bitbucket', pattern: /bitbucket\.org[:/]/i },
  { id: 'gitee', pattern: /gitee\.com[:/]/i },
  { id: 'codeup', pattern: /codeup\.aliyun\.com[:/]/i },
  { id: 'coding', pattern: /coding\.net[:/]/i }
];

function detectProviders(urls: string[]): RemoteProvider[] {
  const found = new Set<RemoteProvider>();
  for (const url of urls) {
    let matched = false;
    for (const { id, pattern } of PROVIDER_PATTERNS) {
      if (pattern.test(url)) {
        found.add(id);
        matched = true;
        break;
      }
    }
    if (!matched) found.add('unknown');
  }
  if (found.size > 1) found.delete('unknown');
  return Array.from(found);
}

/** 检测项目脏状态（tracked 修改 / untracked 文件 / 未推送 commit） */
export async function checkDirty(projectPath: string): Promise<ProjectDirtyInfo> {
  const empty: ProjectDirtyInfo = {
    hasUncommitted: false,
    hasUntrackedNonIgnored: false,
    hasUnpushed: false,
    detail: ''
  };
  const safety = ensureSafePath(projectPath);
  if (safety) return { ...empty, detail: safety };
  const gitDirState = await resolveGitDir(projectPath);
  if (!gitDirState) {
    return { ...empty, detail: '该项目不是 git 仓库' };
  }
  if (gitDirState === ARCHIVED_GIT_DIR_NAME) {
    // 已归档项目：.git 已被重命名为防误提交标记，无需也无法做脏检查
    return {
      ...empty,
      detail: '该项目已归档（.git 已重命名为 .git.devzen-archived 防止误提交）'
    };
  }

  const lines: string[] = [];
  let hasUncommitted = false;
  let hasUntrackedNonIgnored = false;
  let hasUnpushed = false;

  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: projectPath,
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024
    });
    const trackedChanges: string[] = [];
    const untrackedFiles: string[] = [];
    for (const raw of stdout.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (!line) continue;
      // porcelain v1 行首两位为状态码，第 3 位为空格
      const code = line.slice(0, 2);
      const file = line.slice(3);
      // .DS_Store 是 macOS Finder 元数据，删除后系统会自动重建，不视为脏内容
      if (path.basename(file) === '.DS_Store') continue;
      if (code === '??') untrackedFiles.push(file);
      else trackedChanges.push(`${code.trim()} ${file}`);
    }
    if (trackedChanges.length > 0) {
      hasUncommitted = true;
      const preview = trackedChanges.slice(0, 5).join('\n  ');
      lines.push(`未提交的修改（${trackedChanges.length} 处）：\n  ${preview}${trackedChanges.length > 5 ? '\n  …' : ''}`);
    }
    if (untrackedFiles.length > 0) {
      hasUntrackedNonIgnored = true;
      const preview = untrackedFiles.slice(0, 5).join('\n  ');
      lines.push(`未跟踪文件（${untrackedFiles.length} 个，将被保留）：\n  ${preview}${untrackedFiles.length > 5 ? '\n  …' : ''}`);
    }
  } catch (e) {
    lines.push(`git status 执行失败：${(e as Error).message}`);
  }

  // 未推送 commit：rev-list @{u}..HEAD；无 upstream 时命令报错，按"有未推送"处理
  try {
    const { stdout } = await execAsync('git rev-list --count @{u}..HEAD', {
      cwd: projectPath,
      timeout: 5000
    });
    const count = parseInt(stdout.trim(), 10);
    if (Number.isFinite(count) && count > 0) {
      hasUnpushed = true;
      lines.push(`本地有 ${count} 个未推送的 commit`);
    }
  } catch {
    // 没有 upstream 或在 detached HEAD 等情况：保守视为未推送
    hasUnpushed = true;
    lines.push('当前分支未配置上游（@{u}），无法确认是否已推送');
  }

  return {
    hasUncommitted,
    hasUntrackedNonIgnored,
    hasUnpushed,
    detail: lines.join('\n\n')
  };
}

/** 项目根的 ecosystems 列表恢复（仅看 marker 文件名，避免重新跑 scanner） */
async function inferEcosystems(projectPath: string): Promise<EcosystemId[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(projectPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = new Set(entries.map((e) => e.name));
  const list: EcosystemId[] = [];
  if (names.has('package.json')) list.push('node');
  if (names.has('Cargo.toml')) list.push('rust');
  if (names.has('go.mod')) list.push('go');
  if (
    names.has('requirements.txt') ||
    names.has('pyproject.toml') ||
    names.has('setup.py') ||
    names.has('Pipfile')
  ) {
    list.push('python');
  }
  if (names.has('pom.xml')) list.push('java-maven');
  if (
    names.has('build.gradle') ||
    names.has('build.gradle.kts') ||
    names.has('settings.gradle') ||
    names.has('settings.gradle.kts')
  ) {
    list.push('java-gradle');
  }
  if (names.has('Package.swift')) list.push('apple-spm');
  for (const n of names) {
    if (n.endsWith('.xcodeproj') || n.endsWith('.xcworkspace')) {
      list.push('apple-xcode');
      break;
    }
  }
  return list;
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
      if (e.isDirectory()) total += await dirSize(full);
      else if (e.isFile()) {
        const st = await fs.stat(full);
        total += st.size;
      }
    } catch {
      // ignore
    }
  }
  return total;
}

async function fileSize(p: string): Promise<number> {
  try {
    const st = await fs.lstat(p);
    if (st.isFile()) return st.size;
    return 0;
  } catch {
    return 0;
  }
}

/** 递归删除项目内所有 .DS_Store（macOS Finder 元数据，删除可由系统自动重建） */
async function removeDSStoreFiles(projectPath: string): Promise<number> {
  let freed = 0;
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (dir === projectPath && e.name === '.git') continue;
        await walk(path.join(dir, e.name));
      } else if (e.isFile() && e.name === '.DS_Store') {
        const full = path.join(dir, e.name);
        try {
          const sz = await fileSize(full);
          await fs.rm(full, { force: true });
          freed += sz;
        } catch {
          // 单文件失败不阻断
        }
      }
    }
  }
  await walk(projectPath);
  return freed;
}

/** 自底向上清理空目录（不删项目根） */
async function cleanupEmptyDirs(projectPath: string): Promise<void> {
  // 收集所有非 .git 子目录，按深度倒序
  const dirs: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (d === projectPath && e.name === '.git') continue;
      const full = path.join(d, e.name);
      dirs.push(full);
      await walk(full);
    }
  }
  await walk(projectPath);
  dirs.sort((a, b) => b.length - a.length);
  for (const d of dirs) {
    try {
      const entries = await fs.readdir(d);
      if (entries.length === 0) await fs.rmdir(d);
    } catch {
      // 非空或权限问题，跳过
    }
  }
}

/**
 * 执行归档：
 *  1. 安全前置（家目录内 / .git 存在 / 至少一个 remote）
 *  2. force=false 时检查脏状态，命中即拒绝
 *  3. git ls-files 删 tracked
 *  4. 顶层遍历删白名单内的 ignored 大目录
 *  5. 清理空目录
 *  6. 写入 archive 索引
 */
export async function archive(projectPath: string, force: boolean): Promise<ArchiveResult> {
  const reject = (msg: string): ArchiveResult => ({
    path: projectPath,
    success: false,
    freedBytes: 0,
    error: msg
  });

  const safety = ensureSafePath(projectPath);
  if (safety) return reject(safety);
  if (!(await isDirectory(projectPath))) return reject('项目目录不存在');
  if (!(await isDirectory(path.join(projectPath, '.git')))) return reject('该项目不是 git 仓库');

  const remoteUrl = await readPrimaryRemote(projectPath);
  if (!remoteUrl) return reject('该项目没有配置远程仓库（无法离线恢复）');

  if (!force) {
    const dirty = await checkDirty(projectPath);
    if (dirty.hasUncommitted || dirty.hasUntrackedNonIgnored || dirty.hasUnpushed) {
      return reject(`存在未保存到远程的内容，已拒绝归档：\n\n${dirty.detail}`);
    }
  }

  // 收集 ecosystems / providers 用于 record（在删文件前做，避免读不到 marker）
  const ecosystems = await inferEcosystems(projectPath);
  const allUrls = await readAllRemoteUrls(projectPath);
  const remoteProviders = detectProviders(allUrls);

  let freedBytes = 0;

  // ---- 删 tracked 文件 ----
  let trackedFiles: string[] = [];
  try {
    const { stdout } = await execAsync('git ls-files -z', {
      cwd: projectPath,
      timeout: 10000,
      maxBuffer: 100 * 1024 * 1024
    });
    trackedFiles = stdout.split('\0').filter(Boolean);
  } catch (e) {
    return reject(`无法读取 tracked 文件清单：${(e as Error).message}`);
  }
  for (const rel of trackedFiles) {
    const full = path.join(projectPath, rel);
    // 二次防御：解析后的路径必须仍在项目目录内（防御 ls-files 异常输出）
    if (!full.startsWith(projectPath + path.sep)) continue;
    try {
      const sz = await fileSize(full);
      await fs.rm(full, { force: true });
      freedBytes += sz;
    } catch {
      // 单文件失败不阻断整个流程
    }
  }

  // ---- 删白名单内的 ignored 大目录（仅项目根直接子目录） ----
  let topEntries: import('node:fs').Dirent[] = [];
  try {
    topEntries = await fs.readdir(projectPath, { withFileTypes: true });
  } catch {
    // 忽略
  }
  for (const e of topEntries) {
    if (!e.isDirectory()) continue;
    if (e.name === '.git') continue;
    if (!CLEANABLE_DIR_NAMES.has(e.name)) continue;
    const full = path.join(projectPath, e.name);
    try {
      const sz = await dirSize(full);
      await fs.rm(full, { recursive: true, force: true });
      freedBytes += sz;
    } catch {
      // 跳过失败项
    }
  }

  // ---- 清理留下的空目录 ----
  // 先扫掉所有 .DS_Store，否则只装着它的目录会被算作"非空"而保留下来
  freedBytes += await removeDSStoreFiles(projectPath);
  await cleanupEmptyDirs(projectPath);

  // ---- 重命名 .git → .git.devzen-archived（防误提交标记） ----
  // 让 git CLI / IDE / shell 提示符不再识别为活仓库，杜绝 git add -A && commit && push 误覆盖远程。
  try {
    await fs.rename(
      path.join(projectPath, '.git'),
      path.join(projectPath, ARCHIVED_GIT_DIR_NAME)
    );
  } catch (e) {
    return reject(
      `防误提交标记设置失败（无法将 .git 重命名为 ${ARCHIVED_GIT_DIR_NAME}）：${(e as Error).message}\n\n` +
        '源码已被删除但 .git 尚未上锁，可手动 git restore . 恢复，或人工将 .git 重命名为 ' +
        `${ARCHIVED_GIT_DIR_NAME} 后通过 DevZen 恢复。`
    );
  }

  // ---- 写索引 ----
  const record: ArchiveRecord = {
    path: projectPath,
    name: path.basename(projectPath),
    remoteUrl,
    remoteProviders,
    ecosystems,
    archivedAt: Date.now(),
    freedBytes
  };
  try {
    await store.upsert(record);
  } catch (e) {
    return reject(`索引写入失败：${(e as Error).message}`);
  }

  return { path: projectPath, success: true, freedBytes };
}

/**
 * 列出全部归档记录，pathExists 字段动态刷新。
 * pathExists 仍以「项目目录是否存在」为准，与 .git 形态无关；
 * 至于 .git / .git.devzen-archived 的命名差异，由 restore 阶段统一兼容。
 */
export async function listArchives(): Promise<ArchiveRecord[]> {
  const list = await store.listAll();
  await Promise.all(
    list.map(async (r) => {
      r.pathExists = await isDirectory(r.path);
    })
  );
  return list;
}

/** 离线恢复：git restore . 把 tracked 文件还原 */
export async function restore(projectPath: string): Promise<RestoreResult> {
  const reject = (msg: string): RestoreResult => ({
    path: projectPath,
    success: false,
    error: msg,
    followUpHints: []
  });

  const safety = ensureSafePath(projectPath);
  if (safety) return reject(safety);
  if (!(await isDirectory(projectPath))) return reject('项目目录已不存在，请使用其它工具 git clone 后再做后续操作');

  // 兼容两种命名：新版归档为 .git.devzen-archived，老版归档为 .git。
  // 若是新版归档，先把目录改回 .git，让 git CLI 重新认得这个仓库。
  const archivedGit = path.join(projectPath, ARCHIVED_GIT_DIR_NAME);
  const liveGit = path.join(projectPath, '.git');
  const hasArchivedGit = await isDirectory(archivedGit);
  const hasLiveGit = await isDirectory(liveGit);
  if (hasArchivedGit && hasLiveGit) {
    return reject(
      `检测到 .git 与 ${ARCHIVED_GIT_DIR_NAME} 同时存在，状态异常，请人工干预后再恢复`
    );
  }
  if (hasArchivedGit) {
    try {
      await fs.rename(archivedGit, liveGit);
    } catch (e) {
      return reject(
        `无法将 ${ARCHIVED_GIT_DIR_NAME} 改回 .git：${(e as Error).message}`
      );
    }
  } else if (!hasLiveGit) {
    return reject('.git 目录缺失，无法离线恢复');
  }

  const record = await store.findOne(projectPath);
  const ecosystems = record?.ecosystems ?? (await inferEcosystems(projectPath));

  // 优先 git restore（新版本 git）；fallback 老版本 checkout
  try {
    await execAsync('git restore --source=HEAD --staged --worktree -- .', {
      cwd: projectPath,
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024
    });
  } catch (firstErr) {
    try {
      await execAsync('git checkout HEAD -- .', {
        cwd: projectPath,
        timeout: 30000,
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (secondErr) {
      return reject(
        `git restore / checkout 都失败了：\n${(firstErr as Error).message}\n${(secondErr as Error).message}`
      );
    }
  }

  // 生成 followUpHints
  const hints: string[] = [];
  if (ecosystems.includes('node')) hints.push('npm install');
  if (ecosystems.includes('rust')) hints.push('cargo build');
  if (ecosystems.includes('go')) hints.push('go mod download');
  if (ecosystems.includes('python')) {
    hints.push('pip install -r requirements.txt（或按项目说明）');
  }
  if (ecosystems.includes('java-maven')) hints.push('mvn install');
  if (ecosystems.includes('java-gradle') || ecosystems.includes('android')) {
    hints.push('./gradlew build');
  }
  if (ecosystems.includes('apple-spm') || ecosystems.includes('apple-xcode')) {
    hints.push('用 Xcode 打开后等待依赖解析');
  }

  // 索引中移除该条目
  try {
    await store.remove(projectPath);
  } catch {
    // 忽略：恢复成功后即便索引未删除也不致命，下次列表会按 path 是否含源码自然排除
  }

  return { path: projectPath, success: true, followUpHints: hints };
}

/** 仅从索引中移除（用户手动忘记某条记录） */
export async function forgetArchive(projectPath: string): Promise<void> {
  await store.remove(projectPath);
}
