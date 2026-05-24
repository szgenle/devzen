import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CleanableDir,
  EcosystemId,
  ProjectInfo,
  ProjectSource,
  RemoteProvider,
  ScanProgress
} from '@shared/types';
import { ECOSYSTEMS, SKIP_DIRS, SYSTEM_SKIP_DIRS } from './markers.js';

const execAsync = promisify(exec);

/** 扫描配置 */
export interface ScanOptions {
  /** 最大递归深度，从 root 算起。默认 5。 */
  maxDepth?: number;
  /** 进度回调 */
  onProgress?: (p: ScanProgress) => void;
  /**
   * 是否启用系统目录智能排除（Library/Applications 等）。
   * 默认：当 rootDir === $HOME 时自动启用。
   */
  skipSystemDirs?: boolean;
}

/**
 * 递归扫描根目录，返回所有识别到的项目。
 * 一旦在某层目录命中 marker，将其视作一个项目根，并停止下钻
 * （避免把 monorepo 内部子包都识别成顶级项目；后续可加 monorepo 支持）。
 */
export async function scanProjects(
  rootDir: string,
  options: ScanOptions = {}
): Promise<ProjectInfo[]> {
  const maxDepth = options.maxDepth ?? 5;
  const onProgress = options.onProgress;
  const home = process.env.HOME ?? '';
  // 当扫描入口为用户主目录时默认启用系统目录排除
  const skipSystem =
    options.skipSystemDirs ?? (home !== '' && path.resolve(rootDir) === path.resolve(home));
  const projects: ProjectInfo[] = [];
  let scannedDirs = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    scannedDirs += 1;
    onProgress?.({
      scannedDirs,
      foundProjects: projects.length,
      currentPath: dir
    });

    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 权限不足或符号链接断裂，跳过
    }

    // 优先判定当前目录是不是项目根
    const ecosystems = await detectEcosystems(dir, entries);
    if (ecosystems.length > 0) {
      const project = await buildProjectInfo(dir, ecosystems, entries);
      projects.push(project);
      onProgress?.({
        scannedDirs,
        foundProjects: projects.length,
        currentPath: dir
      });
      return; // 命中后停止下钻
    }

    if (depth >= maxDepth) return;

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue; // 跳过隐藏目录
      if (SKIP_DIRS.has(e.name)) continue;
      // 仅在顶层（depth === 0）过滤系统目录，避免误伤子目录中同名项目
      if (skipSystem && depth === 0 && SYSTEM_SKIP_DIRS.has(e.name)) continue;
      await walk(path.join(dir, e.name), depth + 1);
    }
  }

  await walk(rootDir, 0);
  // 按可清理大小倒序
  projects.sort((a, b) => b.cleanableSize - a.cleanableSize);
  return projects;
}

/** 在给定目录中识别命中的生态列表 */
async function detectEcosystems(
  _dir: string,
  entries: import('node:fs').Dirent[]
): Promise<EcosystemId[]> {
  const names = entries.map((e) => e.name);
  const hit: EcosystemId[] = [];
  for (const spec of ECOSYSTEMS) {
    const matched = spec.markers.some((m) => {
      if (m.startsWith('*.')) {
        const ext = m.slice(1); // ".xcodeproj"
        return names.some((n) => n.endsWith(ext));
      }
      return names.includes(m);
    });
    if (matched) hit.push(spec.id);
  }
  return hit;
}

/** 组装一个项目的完整信息 */
async function buildProjectInfo(
  dir: string,
  ecosystems: EcosystemId[],
  entries: import('node:fs').Dirent[]
): Promise<ProjectInfo> {
  const cleanables = await collectCleanables(dir, ecosystems);
  const cleanableSize = cleanables.reduce((s, c) => s + c.size, 0);
  const isGitRepo = entries.some((e) => e.name === '.git');
  const gitRemote = isGitRepo ? await readGitRemote(dir) : null;
  const allRemoteUrls = isGitRepo ? await readAllGitRemoteUrls(dir) : [];
  const gitDirty = isGitRepo ? await readGitDirty(dir) : null;
  const lastModified = await readLastModified(dir, ecosystems);
  const description = await extractDescription(dir, ecosystems, entries);
  const source = inferSource(allRemoteUrls);
  const remoteProviders = detectProviders(allRemoteUrls);

  return {
    path: dir,
    name: path.basename(dir),
    description,
    ecosystems,
    gitRemote,
    isGitRepo,
    source,
    remoteProviders,
    gitDirty,
    lastModified,
    cleanables,
    cleanableSize
  };
}

/** 探测项目下所有可清理目录及其大小 */
async function collectCleanables(
  projectDir: string,
  ecosystems: EcosystemId[]
): Promise<CleanableDir[]> {
  const seen = new Map<string, CleanableDir>(); // 以路径去重（多生态可能定义同名目录）
  for (const eco of ecosystems) {
    const spec = ECOSYSTEMS.find((s) => s.id === eco);
    if (!spec) continue;
    for (const def of spec.cleanableDirs) {
      const target = path.join(projectDir, def.name);
      if (seen.has(target)) continue;
      try {
        const st = await fs.stat(target);
        if (!st.isDirectory()) continue;
        const size = await dirSize(target);
        seen.set(target, {
          path: target,
          name: def.name,
          size,
          ecosystem: eco,
          hint: def.hint
        });
      } catch {
        // 目录不存在
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.size - a.size);
}

/** 递归计算目录字节数。失败返回已累计值。 */
export async function dirSize(dir: string): Promise<number> {
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
      if (e.isSymbolicLink()) continue; // 不跟随符号链接
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

/** 读取 git remote.origin.url；非 git 仓库返回 null */
async function readGitRemote(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git config --get remote.origin.url', {
      cwd: dir,
      timeout: 2000
    });
    const url = stdout.trim();
    return url || null;
  } catch {
    return null;
  }
}

/** 读取所有 remote 的 fetch URL，用于来源分析（一个项目可能有 origin + upstream 等多个 remote） */
async function readAllGitRemoteUrls(dir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git remote -v', {
      cwd: dir,
      timeout: 2000
    });
    const urls: string[] = [];
    for (const line of stdout.split('\n')) {
      // 格式: name\turl (fetch|push)
      const match = line.match(/^\S+\t(.+)\s+\(fetch\)$/);
      if (match) urls.push(match[1]);
    }
    return urls;
  } catch {
    return [];
  }
}

/** 为已知是 git 仓库的项目检测未提交修改 */
async function readGitDirty(dir: string): Promise<boolean | null> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: dir,
      timeout: 3000
    });
    return stdout.trim().length > 0;
  } catch {
    return null;
  }
}

/** 根据所有 remote URL 判定来源：只要任一 remote 包含 github.com 就算 github */
function inferSource(remoteUrls: string[]): ProjectSource {
  if (remoteUrls.length === 0) return 'local';
  if (remoteUrls.some((url) => /github\.com[:/]/i.test(url))) return 'github';
  return 'remote';
}

/** 已知托管商的匹配规则 */
const PROVIDER_PATTERNS: Array<{ id: RemoteProvider; pattern: RegExp }> = [
  { id: 'github', pattern: /github\.com[:/]/i },
  { id: 'gitlab', pattern: /gitlab\.com[:/]/i },
  { id: 'bitbucket', pattern: /bitbucket\.org[:/]/i },
  { id: 'gitee', pattern: /gitee\.com[:/]/i },
  { id: 'codeup', pattern: /codeup\.aliyun\.com[:/]/i },
  { id: 'coding', pattern: /coding\.net[:/]/i }
];

/** 从所有 remote URL 中识别具体的托管商列表（去重、保序） */
function detectProviders(remoteUrls: string[]): RemoteProvider[] {
  if (remoteUrls.length === 0) return [];
  const found = new Set<RemoteProvider>();
  for (const url of remoteUrls) {
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
  // 去掉 unknown，如果同时有具名提供商的话
  if (found.size > 1) found.delete('unknown');
  return Array.from(found);
}

/**
 * 提取项目一句话描述：
 * 1. 优先 package.json 的 description 字段
 * 2. 其次 README.md 的首个非空、非标题行
 * 未来可接入 LLM 重写。
 */
async function extractDescription(
  dir: string,
  ecosystems: EcosystemId[],
  entries: import('node:fs').Dirent[]
): Promise<string | null> {
  if (ecosystems.includes('node')) {
    const desc = await readPackageJsonDescription(path.join(dir, 'package.json'));
    if (desc) return desc;
  }
  // README 匹配不区分大小写，同时兼容 .md/.markdown/无后缀
  const readme = entries.find(
    (e) => e.isFile() && /^readme(\.(md|markdown|txt))?$/i.test(e.name)
  );
  if (readme) {
    const desc = await readReadmeFirstParagraph(path.join(dir, readme.name));
    if (desc) return desc;
  }
  return null;
}

async function readPackageJsonDescription(file: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const json = JSON.parse(raw) as { description?: unknown };
    if (typeof json.description === 'string' && json.description.trim()) {
      return json.description.trim().slice(0, 200);
    }
  } catch {
    // ignore
  }
  return null;
}

async function readReadmeFirstParagraph(file: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('#')) continue; // 跳过标题
      if (t.startsWith('![')) continue; // 跳过顶部图片/徽章
      if (t.startsWith('<')) continue; // 跳过 HTML 标签
      // 清除常见 markdown 修饰
      const cleaned = t
        .replace(/^>\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
      if (cleaned) return cleaned.slice(0, 200);
    }
  } catch {
    // ignore
  }
  return null;
}

/** 取项目根 marker 文件的最近 mtime 作为活跃度参考 */
async function readLastModified(
  dir: string,
  ecosystems: EcosystemId[]
): Promise<number | null> {
  const candidates = new Set<string>();
  for (const eco of ecosystems) {
    const spec = ECOSYSTEMS.find((s) => s.id === eco);
    if (!spec) continue;
    for (const m of spec.markers) {
      if (m.startsWith('*.')) continue; // 跳过通配
      candidates.add(m);
    }
  }
  let latest = 0;
  for (const c of candidates) {
    try {
      const st = await fs.stat(path.join(dir, c));
      if (st.mtimeMs > latest) latest = st.mtimeMs;
    } catch {
      // ignore
    }
  }
  return latest > 0 ? latest : null;
}
