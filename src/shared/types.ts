/**
 * 共享类型：主进程与渲染进程通过 IPC 交换的数据形态。
 */

/** 项目所属生态的唯一标识 */
export type EcosystemId =
  | 'node'
  | 'rust'
  | 'go'
  | 'python'
  | 'java-maven'
  | 'java-gradle'
  | 'apple-xcode'
  | 'apple-spm'
  | 'android'
  | 'godot'
  | 'unknown';

/** 一个可清理的目录 */
export interface CleanableDir {
  /** 目录绝对路径 */
  path: string;
  /** 目录名（如 node_modules） */
  name: string;
  /** 该目录字节大小 */
  size: number;
  /** 所属生态 */
  ecosystem: EcosystemId;
  /** 简短说明（"npm install 可恢复"） */
  hint: string;
}

/**
 * 项目来源：影响"删了就没了"的提示强度。
 * - github：可重新 clone
 * - remote：有其他远程（GitLab/Codeup 等），可重新 clone
 * - local：无远程或非 git 仓库，删除后无法恢复
 */
export type ProjectSource = 'github' | 'remote' | 'local';

/** 识别到的远程仓库托管商 */
export type RemoteProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'gitee'
  | 'codeup'
  | 'coding'
  | 'unknown';

/** 重复项目组信息（扫描后由分组逻辑填充） */
export interface DuplicateGroup {
  /** 组 ID（标准化后的 remote URL） */
  groupId: string;
  /** 该组内的项目路径列表（含自身） */
  members: string[];
}

/** 扫描得到的项目 */
export interface ProjectInfo {
  /** 项目根目录绝对路径 */
  path: string;
  /** 显示名（默认目录名） */
  name: string;
  /** 一句话描述。来自 package.json description 或 README 首段。 */
  description: string | null;
  /** 识别到的生态（一个项目可能匹配多个 marker） */
  ecosystems: EcosystemId[];
  /** Git remote URL（若为 Git 仓库） */
  gitRemote: string | null;
  /** 是否为 Git 仓库（即使没有 remote，也可能是本地 git init） */
  isGitRepo: boolean;
  /** 项目来源分类，决定删除时的提醒强度 */
  source: ProjectSource;
  /** 识别到的远程托管商列表（可能有多个 remote 对应不同平台） */
  remoteProviders: RemoteProvider[];
  /** 是否有未提交的修改；非 git 仓库或检测失败为 null */
  gitDirty: boolean | null;
  /** 最近修改时间（毫秒时间戳，取 marker 文件 mtime） */
  lastModified: number | null;
  /** 可清理目录列表 */
  cleanables: CleanableDir[];
  /** 该项目可清理总字节数 */
  cleanableSize: number;
  /** 所属重复组（扫描后由 grouping 逻辑填充；无重复则为 null） */
  duplicateGroup: DuplicateGroup | null;
  /**
   * 根据项目根目录特征文件推断的"建议编辑器"（macOS .app 名）。
   * 例：存在 .qoder/ → 'Qoder'；.trae/ → 'Trae'；.cursor/ 或 .cursorrules → 'Cursor'。
   * 未识别到任何特征时为 undefined。仅作渲染层的"默认启动应用"兜底建议，用户实际选过的会覆盖。
   */
  suggestedEditor?: string;
}

/** 扫描进度事件 */
export interface ScanProgress {
  scannedDirs: number;
  foundProjects: number;
  currentPath: string;
}

/** 清理结果 */
export interface CleanResult {
  path: string;
  success: boolean;
  freedBytes: number;
  error?: string;
}

/**
 * 归档记录：用于"卸载本地保留远程"功能的元信息。
 * 列表渲染时会动态校验 path 是否仍存在，所以 pathExists 不持久化到 JSON。
 */
export interface ArchiveRecord {
  /** 原项目根绝对路径，作为索引主键 */
  path: string;
  /** 显示名 */
  name: string;
  /** 归档时记录的首个 git remote URL，用于展示与万一 .git 损坏时的兜底恢复 */
  remoteUrl: string;
  /** 归档时识别到的远程托管商 */
  remoteProviders: RemoteProvider[];
  /** 归档时识别到的项目生态，用于恢复后给出 followUpHints */
  ecosystems: EcosystemId[];
  /** 归档时间戳（毫秒） */
  archivedAt: number;
  /** 本次归档实际释放的字节数 */
  freedBytes: number;
  /** 列表渲染时刷新；不持久化 */
  pathExists?: boolean;
}

/** 归档执行结果 */
export interface ArchiveResult {
  path: string;
  success: boolean;
  freedBytes: number;
  error?: string;
}

/** 恢复执行结果 */
export interface RestoreResult {
  path: string;
  success: boolean;
  error?: string;
  /** 后续建议执行的命令（npm install / cargo build 等），仅作展示 */
  followUpHints: string[];
}

/** 项目详细信息（按需加载，用于重复对比视图） */
export interface ProjectDetail {
  /** 项目路径 */
  path: string;
  /** 最近一次 git commit 的时间戳（毫秒）；非 git 仓库为 null */
  lastCommitTime: number | null;
  /** 本地有多少未推送的 commit；无 upstream 时为本地全部 commit 数 */
  unpushedCount: number;
  /** 项目总大小（字节），不含 .git 目录 */
  totalSize: number;
  /** 当前所在分支名；非 git 仓库或 detached HEAD 为 null */
  branch: string | null;
}

/** 项目脏状态详情，用于归档前置确认 */
export interface ProjectDirtyInfo {
  /** 是否存在已修改/新增/删除但未提交的 tracked 改动 */
  hasUncommitted: boolean;
  /** 是否存在 untracked 但未被 ignored 的文件（用户尚未 add 的脏文件） */
  hasUntrackedNonIgnored: boolean;
  /** 是否存在未推送的本地 commit（包含没有上游分支的情况） */
  hasUnpushed: boolean;
  /** 给用户看的多行文本说明 */
  detail: string;
}

/**
 * 冷备包（bundle）：归档项目压缩为单一 .tar.gz 文件后的元信息。
 *
 * 与 ArchiveRecord 解耦，因为 bundle 是用户主动产出的「冷备份」：
 *  - 同一项目允许多次打包，按 archivedAt + bundledAt 区分版本（id 全局唯一）
 *  - 即使原归档目录被恢复或删除，bundle 仍可独立存在
 *  - bundle 内嵌 devzen-manifest.json，索引丢失时可手动 unbundle 还原
 */
export interface BundleRecord {
  /** uuid v4，主键 */
  id: string;
  /** 归档时的原项目根目录绝对路径，恢复时作为默认目标位置 */
  originalPath: string;
  /** 显示名（项目根目录名） */
  name: string;
  /** .tar.gz 绝对路径（位于用户配置的备份目录下） */
  bundlePath: string;
  /** 打包时间戳（毫秒） */
  bundledAt: number;
  /** 压缩包字节数 */
  sizeBytes: number;
  /** bundle 文件 sha256，恢复前校验 */
  sha256: string;
  /** 原归档时记录的远程 URL */
  remoteUrl: string;
  /** 原归档时识别到的远程托管商 */
  remoteProviders: RemoteProvider[];
  /** 原归档时识别到的项目生态，用于恢复后给出 followUpHints */
  ecosystems: EcosystemId[];
  /** 原归档时间（从 ArchiveRecord 复制） */
  archivedAt: number;
  /** 列表渲染时刷新；不持久化。bundle 文件是否仍存在 */
  bundleExists?: boolean;
}

/** 打包/解包过程的进度事件 */
export interface BundleProgress {
  /** 操作 id（与 BundleRecord.id 一致；解包时为 bundle id） */
  id: string;
  /** 'bundle' = 正在压缩；'restore' = 正在解压恢复 */
  phase: 'bundle' | 'restore';
  /** 已处理字节数 */
  bytesProcessed: number;
  /** 总字节数（压缩时为源文件总大小，解压时为 bundle 大小） */
  bytesTotal: number;
  /** 当前正在处理的文件相对路径（可空） */
  currentEntry?: string;
}

/** 打包结果 */
export interface BundleResult {
  success: boolean;
  record?: BundleRecord;
  error?: string;
}

/** 解包恢复结果 */
export interface RestoreBundleResult {
  success: boolean;
  /** 解压后的项目目录 */
  path?: string;
  /** 是否完成最终的 git restore（一步到位时为 true） */
  restoredFromGit: boolean;
  /** 后续建议执行的命令（npm install / cargo build 等） */
  followUpHints: string[];
  error?: string;
}

/** 用户首选项中的存储设置 */
export interface AppSettings {
  /** 冷备包统一存放目录；null 表示尚未配置 */
  backupDir: string | null;
}

/** 选择目录的结果 */
export interface PickDirResult {
  /** null 表示用户取消 */
  path: string | null;
}

/** 扫描历史条目（主进程 history.json 的单元，也是 IPC 传输形态） */
export interface HistoryEntry {
  /** 扫描根目录绝对路径，作为索引主键 */
  rootDir: string;
  /** 该次扫描得到的项目快照 */
  projects: ProjectInfo[];
  /** 扫描时间戳（毫秒） */
  scannedAt: number;
}

/** preload 暴露给渲染层的 API */
export interface DevZenAPI {
  /** 当前运行平台（与 Node.js process.platform 一致），用于渲染层做差异化 UI */
  platform: 'darwin' | 'win32' | 'linux' | 'aix' | 'freebsd' | 'openbsd' | 'sunos' | 'cygwin' | 'netbsd' | 'haiku';
  /** 默认建议的扫描根目录（一般为用户主目录） */
  getDefaultRootDir(): Promise<string>;
  /** 选择扫描根目录（打开系统目录选择对话框） */
  pickRootDir(): Promise<string | null>;
  /** 扫描指定目录下的所有项目 */
  scanProjects(rootDir: string): Promise<ProjectInfo[]>;
  /** 订阅扫描进度（返回取消函数） */
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
  /** 清理指定目录列表 */
  cleanDirs(paths: string[]): Promise<CleanResult[]>;
  /** 在 Finder 中显示该路径 */
  revealInFinder(path: string): Promise<void>;
  /** 检测项目脏状态（用于归档前置确认） */
  checkProjectDirty(path: string): Promise<ProjectDirtyInfo>;
  /** 归档项目（删 tracked + 白名单 ignored；保留 .git/untracked/敏感配置） */
  archiveProject(path: string, force: boolean): Promise<ArchiveResult>;
  /** 列出全部归档记录（自动刷新 pathExists） */
  listArchives(): Promise<ArchiveRecord[]>;
  /** 离线恢复：git restore . 把 tracked 文件还原 */
  restoreProject(path: string): Promise<RestoreResult>;
  /** 仅从索引中删除该条目，不动文件 */
  forgetArchive(path: string): Promise<void>;
  /** 获取项目详细信息（按需加载，用于重复对比视图） */
  getProjectDetail(path: string): Promise<ProjectDetail>;
  /**
   * 轻量刷新单个项目的 git dirty 状态。
   * 用于详情面板打开 / 手动刷新场景，避免全量重扫。
   * 返回 true=有未提交修改；false=工作区干净；null=非 git 仓库或检测失败。
   */
  refreshProjectDirty(path: string): Promise<boolean | null>;
  /** 用指定 macOS 应用打开项目目录（编辑器场景，例如 "Visual Studio Code"）；空串表示用系统默认行为 `open path` */
  openWithEditor(path: string, editor: string): Promise<void>;
  /** 在指定终端应用中打开项目目录（例如 "Terminal" / "iTerm" / "Warp"） */
  openWithTerminal(path: string, terminal: string): Promise<void>;
  /** 读取扫描历史（按 scannedAt 倒序） */
  listHistory(): Promise<HistoryEntry[]>;
  /** 按 rootDir 主键插入或替换一条扫描历史，返回排序后的新列表 */
  upsertHistory(entry: HistoryEntry): Promise<HistoryEntry[]>;
  /** 按 rootDir 主键删除一条扫描历史，返回剩余列表 */
  removeHistory(rootDir: string): Promise<HistoryEntry[]>;
  /** 一次性把若干历史条目合并入主进程存档，用于从旧 localStorage 迁移 */
  bulkMergeHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]>;

  // ---------------- 冷备包（bundle） ----------------
  /** 读取应用配置（含备份目录） */
  getSettings(): Promise<AppSettings>;
  /** 设置备份目录（绝对路径），返回更新后的 settings */
  setBackupDir(dir: string): Promise<AppSettings>;
  /** 打开系统目录选择对话框，让用户选备份目录 */
  pickBackupDir(): Promise<string | null>;
  /** 通用目录选择对话框（用于选恮复目标目录等场景） */
  pickDir(title: string): Promise<string | null>;
  /** 将一个已归档项目压缩为冷备包（写入用户配置的备份目录） */
  bundleArchive(archivePath: string): Promise<BundleResult>;
  /** 列出全部冷备包（自动刷新 bundleExists） */
  listBundles(): Promise<BundleRecord[]>;
  /** 校验单个 bundle 的 sha256 完整性 */
  verifyBundle(bundleId: string): Promise<{ ok: boolean; error?: string }>;
  /** 从冷备包恢复到目标目录（不存在则创建；存在且非空则报错） */
  restoreBundle(bundleId: string, targetDir: string): Promise<RestoreBundleResult>;
  /** 删除冷备包（删除 .tar.gz 文件 + 索引条目） */
  deleteBundle(bundleId: string): Promise<void>;
  /** 订阅打包/解包进度（返回取消函数） */
  onBundleProgress(cb: (p: BundleProgress) => void): () => void;
}

declare global {
  interface Window {
    devzen: DevZenAPI;
  }
}

export {};
