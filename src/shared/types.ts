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

/** 扫描得到的项目 */
export interface ProjectInfo {
  /** 项目根目录绝对路径 */
  path: string;
  /** 显示名（默认目录名） */
  name: string;
  /** 一句话描述。来自 package.json description 或 README 首段，未来可由 LLM 改写。 */
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

/** preload 暴露给渲染层的 API */
export interface DevZenAPI {
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
}

declare global {
  interface Window {
    devzen: DevZenAPI;
  }
}

export {};
