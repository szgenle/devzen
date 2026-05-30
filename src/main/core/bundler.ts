import { promises as fs } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import * as tar from 'tar';
import type {
  ArchiveRecord,
  BundleProgress,
  BundleRecord,
  BundleResult,
  RestoreBundleResult
} from '@shared/types';
import * as archiveStore from './archive-store.js';
import { ARCHIVED_GIT_DIR_NAME } from './archiver.js';
import * as bundleStore from './bundle-store.js';

const execAsync = promisify(exec);

/**
 * 冷备包打包/解包模块。
 *
 * 设计：
 *  - 用 npm `tar` 包（纯 JS，跨平台一致），统一产出 .tar.gz
 *  - 包内布局：根下两个 entry —— `devzen-manifest.json` + `<projectName>/...`
 *  - 通过 staging 临时目录 + 跨平台目录链接（POSIX symlink / Windows junction）实现
 *    "manifest + 项目内容"两源合并，不污染项目目录本身
 *  - sha256 边写边算，与 tar 输出流串联，单次 IO 完成
 *  - 进度按未压缩字节累加（onWriteEntry / onReadEntry），跨平台一致
 *
 * 安全：所有路径强制 home 校验，bundle 必须落在用户配置的备份目录内。
 */

const MANIFEST_NAME = 'devzen-manifest.json';
const BUNDLE_VERSION = 1 as const;

/** Bundle 内嵌 manifest 的结构（与 BundleRecord 字段大致对应，除 sha256/bundlePath/sizeBytes） */
interface BundleManifest {
  bundleVersion: typeof BUNDLE_VERSION;
  id: string;
  originalPath: string;
  name: string;
  bundledAt: number;
  remoteUrl: string;
  remoteProviders: string[];
  ecosystems: string[];
  archivedAt: number;
  /** 原始未压缩大小，用于恢复时进度估算 */
  originalSizeBytes: number;
}

/** 跨平台 home 路径校验，用于备份目录与项目目录 */
function ensureInsideHome(target: string, label = '路径'): void {
  if (!path.isAbsolute(target)) throw new Error(`${label}必须为绝对路径`);
  const home = app.getPath('home');
  if (!home) throw new Error('无法获取用户主目录');
  const rel = path.relative(path.normalize(home), path.normalize(target));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`出于安全考虑，${label}必须位于用户家目录内`);
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 递归累加目录大小（不含 .git 软链跟随，遵循 archiver.dirSize 同样的策略） */
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

/** Windows 文件名 sanitize：替换非法字符，去除首尾空格/点，限制长度 */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"|?*\\/\x00-\x1f]/g, '_')
    .replace(/^[ .]+|[ .]+$/g, '');
  const safe = cleaned.length > 0 ? cleaned : 'project';
  return safe.slice(0, 120);
}

/** 时间戳 → YYYYMMDD-HHmmss */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * 跨平台创建目录链接：
 *  - POSIX：symlink，type='dir'
 *  - Windows：junction（无需管理员权限，对 tar follow 透明）
 */
async function linkDirectory(target: string, linkPath: string): Promise<void> {
  if (process.platform === 'win32') {
    await fs.symlink(target, linkPath, 'junction');
  } else {
    await fs.symlink(target, linkPath, 'dir');
  }
}

/** 计算文件 sha256（流式） */
async function fileSha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 删除目录（rm -rf 等价，跨平台），失败静默忽略以便清理路径 */
async function safeRm(p: string): Promise<void> {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export interface ProgressEmitter {
  (p: BundleProgress): void;
}

/**
 * 把已归档项目压缩为冷备包。
 *
 * 步骤：
 *  1. 安全前置（archive 存在 / 备份目录就绪）
 *  2. 计算项目原始大小（用于进度分母与 manifest）
 *  3. staging 写 manifest + 创建项目目录链接
 *  4. tar.create 流式 → .tmp 文件 + sha256 边算
 *  5. 重命名 .tmp → 最终 .tar.gz；写 BundleRecord
 *  6. 失败回滚：staging / .tmp / 索引一概不留半成品
 */
export async function bundleArchive(
  archivePath: string,
  backupDir: string,
  emit: ProgressEmitter
): Promise<BundleResult> {
  const fail = (msg: string): BundleResult => ({ success: false, error: msg });

  try {
    ensureInsideHome(archivePath, '项目路径');
    ensureInsideHome(backupDir, '备份目录');
  } catch (e) {
    return fail((e as Error).message);
  }

  const record = await archiveStore.findOne(archivePath);
  if (!record) return fail('该项目不在归档列表中，无法打包');
  if (!(await isDirectory(archivePath))) return fail('归档项目目录已不存在');
  // 兼容两种 .git 命名：新版归档为 .git.devzen-archived，老版归档为 .git
  const hasGitDir =
    (await isDirectory(path.join(archivePath, '.git'))) ||
    (await isDirectory(path.join(archivePath, ARCHIVED_GIT_DIR_NAME)));
  if (!hasGitDir) {
    return fail('该项目不是 git 仓库 / .git 已丢失');
  }

  // 备份目录不存在则创建
  try {
    await fs.mkdir(backupDir, { recursive: true });
  } catch (e) {
    return fail(`创建备份目录失败：${(e as Error).message}`);
  }

  const id = crypto.randomUUID();
  const bundledAt = Date.now();
  const projectName = path.basename(archivePath);
  const fileBase = `${sanitizeFileName(projectName)}-${formatTimestamp(bundledAt)}.devzen.tar.gz`;
  const finalPath = path.join(backupDir, fileBase);
  const tmpPath = `${finalPath}.tmp`;

  // 已存在同名（极少见）则换 id 后缀避免覆盖
  let actualFinalPath = finalPath;
  if (await pathExists(finalPath)) {
    actualFinalPath = path.join(backupDir, `${sanitizeFileName(projectName)}-${formatTimestamp(bundledAt)}-${id.slice(0, 8)}.devzen.tar.gz`);
  }
  const actualTmpPath = `${actualFinalPath}.tmp`;

  const stagingDir = path.join(app.getPath('userData'), 'devzen', 'tmp', `bundle-${id}`);

  let tarTotalBytes = 0;
  try {
    // 1) 计算原始大小
    const originalSizeBytes = await dirSize(archivePath);

    // 2) staging 准备
    await fs.mkdir(stagingDir, { recursive: true });
    const manifest: BundleManifest = {
      bundleVersion: BUNDLE_VERSION,
      id,
      originalPath: record.path,
      name: record.name,
      bundledAt,
      remoteUrl: record.remoteUrl,
      remoteProviders: record.remoteProviders,
      ecosystems: record.ecosystems,
      archivedAt: record.archivedAt,
      originalSizeBytes
    };
    await fs.writeFile(
      path.join(stagingDir, MANIFEST_NAME),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
    const linkName = sanitizeFileName(projectName) || 'project';
    const linkPath = path.join(stagingDir, linkName);
    await linkDirectory(archivePath, linkPath);

    // 3) tar.create 流式 → .tmp + sha256
    let bytesProcessed = 0;
    let lastEmit = 0;
    // tar.c 在不传 file 选项时返回 Pack（可读流）；TS 推断为联合类型，需要断言
    const tarStream = tar.c(
      {
        gzip: true,
        cwd: stagingDir,
        // junction/symlink 在 tar 视角下需要 follow 才会展开为目录内容
        follow: true,
        // 进度按 entry 原始 size 累加
        onWriteEntry: (entry: { size?: number; path?: string }) => {
          const sz = entry.size ?? 0;
          bytesProcessed += sz;
          const now = Date.now();
          // 节流：每 100ms 推一次，避免主线程被 IPC 刷爆
          if (now - lastEmit >= 100) {
            lastEmit = now;
            emit({
              id,
              phase: 'bundle',
              bytesProcessed,
              bytesTotal: originalSizeBytes,
              currentEntry: entry.path
            });
          }
        }
      } as tar.TarOptionsWithAliasesAsync,
      [MANIFEST_NAME, linkName]
    ) as unknown as NodeJS.ReadableStream;

    const hash = crypto.createHash('sha256');
    const out = createWriteStream(actualTmpPath);

    await new Promise<void>((resolve, reject) => {
      let errored = false;
      const onErr = (err: Error) => {
        if (errored) return;
        errored = true;
        reject(err);
      };
      tarStream.on('error', onErr);
      out.on('error', onErr);
      tarStream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        tarTotalBytes += chunk.length;
      });
      out.on('finish', () => resolve());
      tarStream.pipe(out);
    });

    const sha256 = hash.digest('hex');

    // 4) rename → 最终路径
    await fs.rename(actualTmpPath, actualFinalPath);

    // 最后再推一次 100% 进度，保证 UI 收尾
    emit({
      id,
      phase: 'bundle',
      bytesProcessed: originalSizeBytes,
      bytesTotal: originalSizeBytes
    });

    // 5) 写索引
    const bundleRecord: BundleRecord = {
      id,
      originalPath: record.path,
      name: record.name,
      bundlePath: actualFinalPath,
      bundledAt,
      sizeBytes: tarTotalBytes,
      sha256,
      remoteUrl: record.remoteUrl,
      remoteProviders: record.remoteProviders,
      ecosystems: record.ecosystems,
      archivedAt: record.archivedAt
    };
    await bundleStore.upsert(bundleRecord);

    return { success: true, record: bundleRecord };
  } catch (e) {
    // 失败清理
    await safeRm(actualTmpPath);
    return fail(`打包失败：${(e as Error).message}`);
  } finally {
    await safeRm(stagingDir);
  }
}

/** 单独校验一个 bundle 的 sha256 */
export async function verifyBundle(bundleId: string): Promise<{ ok: boolean; error?: string }> {
  const record = await bundleStore.findOne(bundleId);
  if (!record) return { ok: false, error: '未找到该冷备包' };
  if (!(await pathExists(record.bundlePath))) {
    return { ok: false, error: 'bundle 文件已不存在' };
  }
  try {
    const sha = await fileSha256(record.bundlePath);
    if (sha !== record.sha256) return { ok: false, error: 'sha256 校验失败，文件可能已损坏' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 从冷备包恢复到目标目录。
 *
 * 行为：
 *  - targetDir 不存在则递归创建；存在但非空则报错
 *  - 校验 sha256 → 解压到 staging → 校验 manifest → 把项目内容 rename 到 targetDir
 *  - 完成后跑 git restore，把 tracked 文件还原（一步到位）
 *  - 把 ArchiveRecord 同步写入 archives.json，让恢复后的项目可被"再归档"工作流接管
 */
export async function restoreBundle(
  bundleId: string,
  targetDir: string,
  emit: ProgressEmitter
): Promise<RestoreBundleResult> {
  const fail = (msg: string): RestoreBundleResult => ({
    success: false,
    restoredFromGit: false,
    followUpHints: [],
    error: msg
  });

  try {
    ensureInsideHome(targetDir, '恢复目标目录');
  } catch (e) {
    return fail((e as Error).message);
  }

  const record = await bundleStore.findOne(bundleId);
  if (!record) return fail('未找到该冷备包记录');
  if (!(await pathExists(record.bundlePath))) {
    return fail('bundle 文件已不存在，无法恢复');
  }

  // 目标目录：不存在 → 创建；存在 → 必须为空
  let targetExists = false;
  try {
    const st = await fs.stat(targetDir);
    if (!st.isDirectory()) return fail('目标位置已存在但不是目录');
    const entries = await fs.readdir(targetDir);
    if (entries.length > 0) return fail('目标目录非空，请选择空目录或不存在的路径');
    targetExists = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      return fail(`目标目录检查失败：${(e as Error).message}`);
    }
  }

  if (!targetExists) {
    try {
      await fs.mkdir(targetDir, { recursive: true });
    } catch (e) {
      return fail(`创建目标目录失败：${(e as Error).message}`);
    }
  }

  // 1) 校验 sha256
  emit({ id: bundleId, phase: 'restore', bytesProcessed: 0, bytesTotal: record.sizeBytes });
  try {
    const sha = await fileSha256(record.bundlePath);
    if (sha !== record.sha256) {
      return fail('sha256 校验失败，bundle 可能已损坏');
    }
  } catch (e) {
    return fail(`sha256 校验失败：${(e as Error).message}`);
  }

  const stagingDir = path.join(
    app.getPath('userData'),
    'devzen',
    'tmp',
    `restore-${bundleId}-${Date.now()}`
  );

  try {
    await fs.mkdir(stagingDir, { recursive: true });

    // 2) 解压
    let bytesProcessed = 0;
    let lastEmit = 0;
    await tar.x({
      file: record.bundlePath,
      cwd: stagingDir,
      onReadEntry: (entry: { size?: number; path?: string }) => {
        bytesProcessed += entry.size ?? 0;
        const now = Date.now();
        if (now - lastEmit >= 100) {
          lastEmit = now;
          emit({
            id: bundleId,
            phase: 'restore',
            bytesProcessed,
            // 解压时分母用 manifest 里的原始大小更准；先临时用 sizeBytes，下面读到 manifest 再以原始大小估算
            bytesTotal: record.sizeBytes,
            currentEntry: entry.path
          });
        }
      }
    } as tar.TarOptionsWithAliasesAsync);

    // 3) 校验 manifest
    const manifestPath = path.join(stagingDir, MANIFEST_NAME);
    let manifest: BundleManifest;
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(raw) as BundleManifest;
    } catch {
      return fail('bundle 内未找到合法 manifest，可能不是 DevZen 冷备包');
    }
    if (!manifest || manifest.bundleVersion !== BUNDLE_VERSION) {
      return fail(`不支持的 bundle 版本：${manifest?.bundleVersion}`);
    }

    // 4) 找到唯一的项目目录条目（除 manifest 外）
    const stagingEntries = await fs.readdir(stagingDir, { withFileTypes: true });
    const projectEntry = stagingEntries.find(
      (e) => e.isDirectory() && e.name !== MANIFEST_NAME
    );
    if (!projectEntry) return fail('bundle 内缺少项目内容目录');
    const stagingProjectDir = path.join(stagingDir, projectEntry.name);

    // 5) 把项目内容移到 targetDir（用 readdir + rename，避免跨设备 rename 失败时仍能 fallback）
    const projectChildren = await fs.readdir(stagingProjectDir, { withFileTypes: true });
    for (const child of projectChildren) {
      const src = path.join(stagingProjectDir, child.name);
      const dst = path.join(targetDir, child.name);
      try {
        await fs.rename(src, dst);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === 'EXDEV') {
          // 跨设备：复制后删除
          await fs.cp(src, dst, { recursive: true, preserveTimestamps: true });
          await fs.rm(src, { recursive: true, force: true });
        } else {
          throw e;
        }
      }
    }

    // 6) 跑 git restore（与 archiver.restore 一致的兜底链）
    // 包内 .git 可能是 .git.devzen-archived（新版归档）或 .git（老版归档），
    // 解包后统一还原为 .git 再走 git restore，与 archiver.restore 语义对齐。
    const archivedGitInTarget = path.join(targetDir, ARCHIVED_GIT_DIR_NAME);
    const liveGitInTarget = path.join(targetDir, '.git');
    if (
      (await isDirectory(archivedGitInTarget)) &&
      !(await isDirectory(liveGitInTarget))
    ) {
      try {
        await fs.rename(archivedGitInTarget, liveGitInTarget);
      } catch {
        // rename 失败不阻断：下面 git restore 会自然跳过
      }
    }
    let restoredFromGit = false;
    if (await isDirectory(path.join(targetDir, '.git'))) {
      try {
        await execAsync('git restore --source=HEAD --staged --worktree -- .', {
          cwd: targetDir,
          timeout: 30000,
          maxBuffer: 50 * 1024 * 1024
        });
        restoredFromGit = true;
      } catch {
        try {
          await execAsync('git checkout HEAD -- .', {
            cwd: targetDir,
            timeout: 30000,
            maxBuffer: 50 * 1024 * 1024
          });
          restoredFromGit = true;
        } catch {
          // git restore 失败不影响整体恢复（用户也可以手动跑）
          restoredFromGit = false;
        }
      }
    }

    // 7) followUpHints
    const hints: string[] = [];
    const ecosystems = manifest.ecosystems;
    if (ecosystems.includes('node')) hints.push('npm install');
    if (ecosystems.includes('rust')) hints.push('cargo build');
    if (ecosystems.includes('go')) hints.push('go mod download');
    if (ecosystems.includes('python')) hints.push('pip install -r requirements.txt（或按项目说明）');
    if (ecosystems.includes('java-maven')) hints.push('mvn install');
    if (ecosystems.includes('java-gradle') || ecosystems.includes('android')) {
      hints.push('./gradlew build');
    }
    if (ecosystems.includes('apple-spm') || ecosystems.includes('apple-xcode')) {
      hints.push('用 Xcode 打开后等待依赖解析');
    }

    // 8) 把 ArchiveRecord 写入 archives.json：让恢复后的项目能被「归档/恢复」流程接管
    try {
      const arch: ArchiveRecord = {
        path: targetDir,
        name: manifest.name,
        remoteUrl: manifest.remoteUrl,
        remoteProviders: manifest.remoteProviders as ArchiveRecord['remoteProviders'],
        ecosystems: manifest.ecosystems as ArchiveRecord['ecosystems'],
        archivedAt: manifest.archivedAt,
        freedBytes: 0
      };
      await archiveStore.upsert(arch);
    } catch {
      // 索引写入失败不致命
    }

    // 收尾进度
    emit({
      id: bundleId,
      phase: 'restore',
      bytesProcessed: record.sizeBytes,
      bytesTotal: record.sizeBytes
    });

    return {
      success: true,
      path: targetDir,
      restoredFromGit,
      followUpHints: hints
    };
  } catch (e) {
    return fail(`恢复失败：${(e as Error).message}`);
  } finally {
    await safeRm(stagingDir);
  }
}

/**
 * 完全归档：在已归档项目基础上 — 打 bundle → 二次校验 sha256 → 删除原项目目录。
 *
 * 事务边界：
 *  1. bundleArchive 必须 success（含 .tmp → 最终路径 rename + 索引写入）
 *  2. verifyBundle 必须通过
 *  3. 任意一步失败都不会触碰原项目目录
 *
 * 删除范围：原项目根目录 archivePath 整个递归删除。
 * 注意：archives.json 中的 ArchiveRecord 不删，列表渲染时 pathExists 会自动变为 false，
 * 用户可在归档列表点 bundle 恢复回原路径或新位置。
 */
export async function bundleAndRemove(
  archivePath: string,
  backupDir: string,
  emit: ProgressEmitter
): Promise<BundleResult> {
  const fail = (msg: string): BundleResult => ({ success: false, error: msg });

  // 1) 标准压缩：失败直接返回，原目录未动
  const result = await bundleArchive(archivePath, backupDir, emit);
  if (!result.success || !result.record) return result;

  // 2) 二次 sha256 校验：写盘后立即重新读一遍，确保 bundle 落盘真实可信
  const verify = await verifyBundle(result.record.id);
  if (!verify.ok) {
    return fail(
      `bundle 二次校验失败：${verify.error ?? '未知错误'}（原项目目录已保留）`
    );
  }

  // 3) 删除原项目目录：再次校验 home 边界，防御性硬保护
  try {
    ensureInsideHome(archivePath, '项目路径');
  } catch (e) {
    return fail((e as Error).message);
  }
  try {
    await fs.rm(archivePath, { recursive: true, force: true });
  } catch (e) {
    return fail(
      `删除原目录失败：${(e as Error).message}（bundle 已生成，可在 Finder 中手动删除目录）`
    );
  }

  return result;
}

/** 删除冷备包：删 .tar.gz 文件 + 索引条目 */
export async function deleteBundle(bundleId: string): Promise<void> {
  const record = await bundleStore.findOne(bundleId);
  if (!record) return;
  await safeRm(record.bundlePath);
  await bundleStore.remove(bundleId);
}

/** 列出全部 bundle，刷新 bundleExists */
export async function listBundles(): Promise<BundleRecord[]> {
  const list = await bundleStore.listAll();
  await Promise.all(
    list.map(async (r) => {
      r.bundleExists = await pathExists(r.bundlePath);
    })
  );
  return list;
}
