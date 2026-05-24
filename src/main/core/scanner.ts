import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CleanableDir,
  EcosystemId,
  ProjectInfo,
  ScanProgress
} from '@shared/types';
import { ECOSYSTEMS, SKIP_DIRS } from './markers.js';

const execAsync = promisify(exec);

/** 扫描配置 */
export interface ScanOptions {
  /** 最大递归深度，从 root 算起。默认 5。 */
  maxDepth?: number;
  /** 进度回调 */
  onProgress?: (p: ScanProgress) => void;
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
      const project = await buildProjectInfo(dir, ecosystems);
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
  dir: string,
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
  ecosystems: EcosystemId[]
): Promise<ProjectInfo> {
  const cleanables = await collectCleanables(dir, ecosystems);
  const cleanableSize = cleanables.reduce((s, c) => s + c.size, 0);
  const gitRemote = await readGitRemote(dir);
  const lastModified = await readLastModified(dir, ecosystems);

  return {
    path: dir,
    name: path.basename(dir),
    ecosystems,
    gitRemote,
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
