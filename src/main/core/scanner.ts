import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CleanableDir,
  DuplicateGroup,
  EcosystemId,
  ProjectDetail,
  ProjectInfo,
  ProjectSource,
  RemoteProvider,
  ScanProgress
} from '@shared/types';
import {
  ECOSYSTEMS,
  SKIP_DIRS,
  HARD_SKIP_DIRS,
  SOFT_SKIP_DIRS,
  SYSTEM_SKIP_DIRS,
  ANDROID_PLUGIN_RE
} from './markers.js';

const execAsync = promisify(exec);

/** 扫描配置 */
export interface ScanOptions {
  /** 最大递归深度，从 root 算起。默认 7（兼顾 Cocos/JSB 等深层嵌套 Android 壳工程）。 */
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
  const maxDepth = options.maxDepth ?? 7;
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
      // 命中后仍尝试在软跳过目录（build/dist/out/target）内寻找嵌套项目，
      // 解决 Cocos / JSB 等把 Android 壳工程放在源项目 build/ 内部的场景。
      if (depth < maxDepth) {
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          if (e.name.startsWith('.')) continue;
          if (!SOFT_SKIP_DIRS.has(e.name)) continue;
          await walk(path.join(dir, e.name), depth + 1);
        }
      }
      return;
    }

    if (depth >= maxDepth) return;

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue; // 跳过隐藏目录
      // 硬跳过：node_modules/.git/.gradle/Pods 等永远不下钻
      if (HARD_SKIP_DIRS.has(e.name)) continue;
      // 软跳过目录（build/dist/out/target）在父目录未命中 marker 时不再无条件跳过，
      // 允许识别 Cocos 等引擎在产物路径里嵌套的子项目
      // 仅在顶层（depth === 0）过滤系统目录，避免误伤子目录中同名项目
      if (skipSystem && depth === 0 && SYSTEM_SKIP_DIRS.has(e.name)) continue;
      await walk(path.join(dir, e.name), depth + 1);
    }
  }

  await walk(rootDir, 0);
  // 按可清理大小倒序
  projects.sort((a, b) => b.cleanableSize - a.cleanableSize);
  // 重复项目分组：基于 remote URL 标准化后匹配
  markDuplicateGroups(projects);
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
    // android 不参与 marker 自动匹配，由下方内容嗅探单独处理
    if (spec.id === 'android') continue;
    const matched = spec.markers.some((m) => {
      if (m.startsWith('*.')) {
        const ext = m.slice(1); // ".xcodeproj"
        return names.some((n) => n.endsWith(ext));
      }
      return names.includes(m);
    });
    if (matched) hit.push(spec.id);
  }
  // Android 嗅探：仅当 java-gradle 命中时才进一步检查 build.gradle* 是否包含 com.android.* 插件，
  // 命中后用 android 取代 java-gradle，避免双标签
  if (hit.includes('java-gradle') && (await detectAndroid(dir, entries))) {
    const idx = hit.indexOf('java-gradle');
    if (idx >= 0) hit.splice(idx, 1);
    hit.push('android');
  }
  return hit;
}

/**
 * 判定一个 Gradle 项目是否是 Android 项目：
 * 读取项目根目录和一级子模块下的 build.gradle / build.gradle.kts，
 * 查找 com.android.* 插件声明。
 */
async function detectAndroid(
  dir: string,
  entries: import('node:fs').Dirent[]
): Promise<boolean> {
  const files: string[] = [];
  for (const e of entries) {
    if (e.isFile() && /^build\.gradle(\.kts)?$/.test(e.name)) {
      files.push(path.join(dir, e.name));
    }
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    let subEntries: import('node:fs').Dirent[];
    try {
      subEntries = await fs.readdir(path.join(dir, e.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const se of subEntries) {
      if (se.isFile() && /^build\.gradle(\.kts)?$/.test(se.name)) {
        files.push(path.join(dir, e.name, se.name));
      }
    }
  }
  for (const f of files) {
    try {
      const content = await fs.readFile(f, 'utf8');
      if (ANDROID_PLUGIN_RE.test(content)) return true;
    } catch {
      // ignore
    }
  }
  return false;
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
    cleanableSize,
    duplicateGroup: null,
    suggestedEditor: inferSuggestedEditor(entries, ecosystems)
  };
}

/**
 * 根据项目根目录条目和生态推断"默认启动编辑器"。
 *
 * 优先级：用户主动添加的 AI 编辑器配置 > 苹果原生工程 > JetBrains 系（按生态二次推断）> 通用 IDE。
 * 未命中任何特征时返回 undefined，渲染层会回退到 DEFAULT_EDITOR。
 *
 * marker 来源：
 *  - .qoder/        → Qoder（项目内 RepoWiki 缓存目录）
 *  - .trae/         → Trae（rules/ 或 settings.json）
 *  - .cursor/ 或 .cursorrules → Cursor
 *  - .windsurf/ 或 .windsurfrules → Windsurf
 *  - *.xcworkspace / *.xcodeproj → Xcode
 *  - .idea/         → JetBrains 系（按 ecosystems 选具体产品）
 *  - .vscode/       → Visual Studio Code
 */
function inferSuggestedEditor(
  entries: import('node:fs').Dirent[],
  ecosystems: EcosystemId[]
): string | undefined {
  const isDir = (name: string) =>
    entries.some((e) => e.name === name && e.isDirectory());
  const isFile = (name: string) =>
    entries.some((e) => e.name === name && e.isFile());
  const hasSuffixDir = (suffix: string) =>
    entries.some((e) => e.name.endsWith(suffix) && e.isDirectory());

  // 1. AI 编辑器特征（用户主动添加，独占性最高）
  if (isDir('.qoder')) return 'Qoder';
  if (isDir('.trae')) return 'Trae';
  if (isDir('.cursor') || isFile('.cursorrules')) return 'Cursor';
  if (isDir('.windsurf') || isFile('.windsurfrules')) return 'Windsurf';

  // 2. 苹果原生工程
  if (hasSuffixDir('.xcworkspace') || hasSuffixDir('.xcodeproj')) return 'Xcode';

  // 3. JetBrains 系：按生态二次推断；无法精确分辨时按 IntelliJ IDEA 兜底
  if (isDir('.idea')) {
    if (ecosystems.includes('android')) return 'Android Studio';
    if (ecosystems.includes('go')) return 'GoLand';
    if (ecosystems.includes('python')) return 'PyCharm';
    if (ecosystems.includes('java-maven') || ecosystems.includes('java-gradle'))
      return 'IntelliJ IDEA';
    if (ecosystems.includes('node')) return 'WebStorm';
    return 'IntelliJ IDEA';
  }

  // 4. 通用 IDE
  if (isDir('.vscode')) return 'Visual Studio Code';

  return undefined;
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
  // Android：典型多模块结构，子模块 build/ 是最大头，额外递归收集一级子模块下的 build/ 与 .cxx/
  if (ecosystems.includes('android')) {
    await collectAndroidModuleArtifacts(projectDir, seen);
  }
  return Array.from(seen.values()).sort((a, b) => b.size - a.size);
}

/** 收集 Android 一级子模块下的 build/ 与 .cxx/ 目录（仅当子目录包含 build.gradle* 时视为模块） */
async function collectAndroidModuleArtifacts(
  projectDir: string,
  seen: Map<string, CleanableDir>
): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(projectDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const moduleDir = path.join(projectDir, e.name);
    let subFiles: import('node:fs').Dirent[];
    try {
      subFiles = await fs.readdir(moduleDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const isModule = subFiles.some(
      (f) => f.isFile() && /^build\.gradle(\.kts)?$/.test(f.name)
    );
    if (!isModule) continue;
    for (const dirName of ['build', '.cxx'] as const) {
      const target = path.join(moduleDir, dirName);
      if (seen.has(target)) continue;
      try {
        const st = await fs.stat(target);
        if (!st.isDirectory()) continue;
        const size = await dirSize(target);
        seen.set(target, {
          path: target,
          name: dirName,
          size,
          ecosystem: 'android',
          hint:
            dirName === '.cxx'
              ? 'Android NDK 构建产物，可重建'
              : 'Android 模块构建产物，gradle assemble 可重建'
        });
      } catch {
        // 目录不存在
      }
    }
  }
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

/**
 * 为已知是 git 仓库的项目检测未提交修改。
 *
 * 语义：仅检测 tracked 文件的未提交改动（与 archiver 的 hasUncommitted 对齐），
 * 不包含 untracked 文件。这样用户 commit 后状态会立即变干净，避免被
 * 临时脚本 / .env.local / 构建产物误标记为 dirty。
 *
 * 同时忽略 macOS 的 .DS_Store —— 它是 Finder 自动重建的元数据，不应视为脏内容。
 */
export async function readGitDirty(dir: string): Promise<boolean | null> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: dir,
      timeout: 3000,
      maxBuffer: 10 * 1024 * 1024
    });
    for (const raw of stdout.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (!line) continue;
      // porcelain v1：行首两位是状态码，第 3 位空格，之后是路径
      const code = line.slice(0, 2);
      const file = line.slice(3);
      // untracked（??）不算 dirty：用户尚未 add，可能是临时脚本 / .env.local 等
      if (code === '??') continue;
      // .DS_Store 是 macOS Finder 元数据，删除后系统会自动重建，不视为脏内容
      if (path.basename(file) === '.DS_Store') continue;
      return true;
    }
    return false;
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

// ─────────────── 重复项目检测 ───────────────

/**
 * 标准化 git remote URL，用于重复项目分组。
 * 将 SSH 和 HTTPS 格式统一为 "host/user/repo" 形式。
 */
export function normalizeRemoteUrl(url: string): string {
  let s = url.trim();
  // 去掉尾部 .git
  if (s.endsWith('.git')) s = s.slice(0, -4);
  // SSH 格式: git@github.com:user/repo
  const sshMatch = s.match(/^[\w.-]+@([\w.-]+):(.*)/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  // HTTPS 格式: https://github.com/user/repo
  try {
    const u = new URL(s);
    return `${u.host}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    // 无法解析就原样返回
    return s;
  }
}

/**
 * 对扫描完成的项目列表做重复分组后处理。
 * 策略 1：基于 gitRemote 标准化后分组
 * 策略 2：基于目录名相似度匹配（处理手动复制目录的场景）
 * 组内 >= 2 个成员即标记为重复。
 */
export function markDuplicateGroups(projects: ProjectInfo[]): void {
  const groups = new Map<string, ProjectInfo[]>();

  // 策略 1：按 remote URL 分组
  for (const p of projects) {
    if (!p.gitRemote) continue;
    const key = `remote:${normalizeRemoteUrl(p.gitRemote)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // 策略 2：按目录名相似度分组（针对手动复制/备份的目录）
  // 已被策略 1 命中的项目不再参与策略 2
  const remoteGrouped = new Set<string>();
  for (const [, members] of groups) {
    if (members.length >= 2) {
      for (const p of members) remoteGrouped.add(p.path);
    }
  }

  const nameGroups = new Map<string, ProjectInfo[]>();
  for (const p of projects) {
    if (remoteGrouped.has(p.path)) continue;
    const baseName = stripCopySuffix(p.name);
    // 只有名称确实被去除了后缀的项目才参与分组（避免无后缀项目单独成组）
    const key = `name:${baseName}`;
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key)!.push(p);
  }
  // 合并策略 2 的结果（组内 >= 2 成员即可，复制后缀本身就是强信号）
  for (const [key, members] of nameGroups) {
    if (members.length < 2) continue;
    groups.set(key, members);
  }

  // 写入结果
  for (const [groupId, members] of groups) {
    if (members.length < 2) continue;
    const paths = members.map((m) => m.path);
    const group: DuplicateGroup = { groupId, members: paths };
    for (const p of members) {
      p.duplicateGroup = group;
    }
  }
}

/**
 * 去除目录名中常见的复制/备份后缀，提取基础名称。
 * 覆盖 macOS Finder 复制（"xxx 副本"/"xxx_副本"）、
 * 手动后缀（"-copy"/"-backup"/"-bak"/" (2)"）等。
 */
export function stripCopySuffix(name: string): string {
  return name
    // macOS Finder 风格：xxx 副本 / xxx_副本 / xxx 副本 2
    .replace(/[\s_]?副本[\s_]?\d*$/, '')
    // 英文常见后缀：-copy / _copy / -backup / _backup / -bak / _bak
    .replace(/[-_\s]?(copy|backup|bak|old)\s*\d*$/i, '')
    // 括号编号后缀：xxx (2) / xxx（3）
    .replace(/\s*[(\uff08]\d+[)\uff09]$/, '')
    .trim();
}


// ─────────────── 项目详细信息（按需加载） ───────────────

/** 获取最近一次 git commit 的时间戳（毫秒） */
export async function readLastCommitTime(dir: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync('git log -1 --format=%ct', {
      cwd: dir,
      timeout: 3000
    });
    const sec = parseInt(stdout.trim(), 10);
    return isNaN(sec) ? null : sec * 1000;
  } catch {
    return null;
  }
}

/** 获取本地未推送的 commit 数量 */
export async function readUnpushedCount(dir: string): Promise<number> {
  try {
    // 先尝试有 upstream 的情况
    const { stdout } = await execAsync('git rev-list @{upstream}..HEAD --count', {
      cwd: dir,
      timeout: 3000
    });
    const n = parseInt(stdout.trim(), 10);
    return isNaN(n) ? 0 : n;
  } catch {
    // 没有 upstream：返回本地全部 commit 数
    try {
      const { stdout } = await execAsync('git rev-list HEAD --count', {
        cwd: dir,
        timeout: 3000
      });
      const n = parseInt(stdout.trim(), 10);
      return isNaN(n) ? 0 : n;
    } catch {
      return 0;
    }
  }
}

/** 计算项目总大小（排除 .git 目录） */
export async function readTotalSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (e.name === '.git') continue; // 排除 .git
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    try {
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

/** 获取当前所在分支名 */
export async function readCurrentBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      timeout: 3000
    });
    const branch = stdout.trim();
    // detached HEAD 时返回 "HEAD"
    return branch && branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

/** 获取项目详细信息（用于重复对比视图的按需加载） */
export async function getProjectDetail(projectPath: string): Promise<ProjectDetail> {
  const [lastCommitTime, unpushedCount, totalSize, branch] = await Promise.all([
    readLastCommitTime(projectPath),
    readUnpushedCount(projectPath),
    readTotalSize(projectPath),
    readCurrentBranch(projectPath)
  ]);
  return { path: projectPath, lastCommitTime, unpushedCount, totalSize, branch };
}
