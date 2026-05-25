import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { IpcChannels } from '@shared/ipc-channels.js';
import { scanProjects, getProjectDetail } from '../core/scanner.js';
import { cleanDirectories } from '../core/cleaner.js';
import {
  archive as archiveProject,
  checkDirty,
  forgetArchive,
  listArchives,
  restore as restoreProject
} from '../core/archiver.js';
import type { ScanProgress } from '@shared/types';

const execFileAsync = promisify(execFile);

/** 仅允许在用户家目录内打开，避免渲染层把任意路径丢进来。跨平台：用 path.relative 判断。 */
function ensureInsideHome(target: string): void {
  const home = app.getPath('home');
  if (!home) throw new Error('无法解析用户家目录');
  const rel = path.relative(path.normalize(home), path.normalize(target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('仅允许打开用户家目录内的项目');
  }
}

async function ensureDirectory(target: string): Promise<void> {
  const st = await fs.stat(target);
  if (!st.isDirectory()) throw new Error('目标路径不是目录');
}

/** 注册全部 IPC handler。需在 app ready 之后、创建 window 之前调用一次。 */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.GetDefaultRootDir, () => {
    // 面向非程序员用户，默认从主目录扫起；用户可随时换为其他目录。
    return app.getPath('home');
  });

  ipcMain.handle(IpcChannels.PickRootDir, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: '选择要扫描的根目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.ScanProjects, async (event, rootDir: string) => {
    const sender = event.sender;
    return scanProjects(rootDir, {
      onProgress: (p: ScanProgress) => {
        // 节流：每 10 次或路径变化时发一次
        if (!sender.isDestroyed()) {
          sender.send(IpcChannels.ScanProgress, p);
        }
      }
    });
  });

  ipcMain.handle(IpcChannels.CleanDirs, async (_event, paths: string[]) => {
    return cleanDirectories(paths);
  });

  ipcMain.handle(IpcChannels.RevealInFinder, async (_event, target: string) => {
    shell.showItemInFolder(target);
  });

  ipcMain.handle(IpcChannels.CheckProjectDirty, async (_event, target: string) => {
    return checkDirty(target);
  });

  ipcMain.handle(IpcChannels.ArchiveProject, async (_event, target: string, force: boolean) => {
    return archiveProject(target, force);
  });

  ipcMain.handle(IpcChannels.ListArchives, async () => {
    return listArchives();
  });

  ipcMain.handle(IpcChannels.RestoreProject, async (_event, target: string) => {
    return restoreProject(target);
  });

  ipcMain.handle(IpcChannels.ForgetArchive, async (_event, target: string) => {
    return forgetArchive(target);
  });

  ipcMain.handle(IpcChannels.GetProjectDetail, async (_event, target: string) => {
    return getProjectDetail(target);
  });

  ipcMain.handle(
    IpcChannels.OpenWithEditor,
    async (_event, target: string, editor: string) => {
      ensureInsideHome(target);
      await ensureDirectory(target);
      const appName = (editor ?? '').trim();
      await launchApp('editor', appName, target);
    }
  );

  ipcMain.handle(
    IpcChannels.OpenWithTerminal,
    async (_event, target: string, terminal: string) => {
      ensureInsideHome(target);
      await ensureDirectory(target);
      const appName = (terminal ?? '').trim();
      await launchApp('terminal', appName, target);
    }
  );
}

/** 识别 macOS `open -a` 在找不到目标应用时返回的错误信息。 */
function isMacAppNotFoundError(msg: string): boolean {
  return /Unable to find application named/i.test(msg);
}

/** 识别 Windows / *nix 找不到可执行文件的常见错误信息。 */
function isCmdNotFoundError(msg: string): boolean {
  return (
    /ENOENT/i.test(msg) ||
    /is not recognized as an internal or external command/i.test(msg) ||
    /command not found/i.test(msg) ||
    /系统找不到指定的文件/.test(msg) ||
    /系统找不到指定的路径/.test(msg)
  );
}

type LaunchKind = 'editor' | 'terminal';

/**
 * 把渲染层传过来的"逻辑应用名"映射成 Windows 上常见的 CLI 命令。
 * 这些 CLI 大多数随对应编辑器安装时会写入 PATH（VS Code / Cursor / Trae / JetBrains Toolbox 等都支持）。
 * 找不到映射时退化为原始名称，让用户也能输入"自定义…"指定 exe 名。
 */
const WIN_EDITOR_CLI: Record<string, string> = {
  'Visual Studio Code': 'code',
  Cursor: 'cursor',
  Qoder: 'qoder',
  Trae: 'trae',
  'Trae CN': 'trae-cn',
  CodeBuddy: 'codebuddy',
  Windsurf: 'windsurf',
  Zed: 'zed',
  'Sublime Text': 'subl',
  WebStorm: 'webstorm',
  'IntelliJ IDEA': 'idea',
  PyCharm: 'pycharm',
  GoLand: 'goland',
  'Android Studio': 'studio'
};

const WIN_TERMINAL_CLI: Record<string, string> = {
  'Windows Terminal': 'wt',
  PowerShell: 'powershell',
  'Command Prompt': 'cmd',
  Cmder: 'cmder',
  'Git Bash': 'bash'
};

/**
 * 跨平台启动入口。
 *  - macOS：沿用 `open -a "<App>" <path>`，appName 为空走 `open <path>`
 *  - Windows：把逻辑名映射到 CLI（code / cursor / wt 等），spawn 时 detached + ignore stdio
 *  - Linux/其他：appName 为空走 `xdg-open`，否则把名字当命令直接 spawn
 */
async function launchApp(kind: LaunchKind, appName: string, target: string): Promise<void> {
  const platform = process.platform;

  if (platform === 'darwin') {
    // 终端无指定时默认走系统 Terminal，保持原有体感
    const macAppName = appName || (kind === 'terminal' ? 'Terminal' : '');
    try {
      if (macAppName) {
        await execFileAsync('open', ['-a', macAppName, target], { timeout: 5000 });
      } else {
        await execFileAsync('open', [target], { timeout: 5000 });
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (macAppName && isMacAppNotFoundError(msg)) {
        throw new Error(notFoundHint(kind, macAppName));
      }
      throw new Error(
        macAppName ? `无法用「${macAppName}」打开：${msg}` : `无法打开目录：${msg}`
      );
    }
  }

  if (platform === 'win32') {
    // 终端默认到 Windows Terminal；用户也可改成 cmd / powershell
    const logicalName = appName || (kind === 'terminal' ? 'Windows Terminal' : '');
    if (!logicalName) {
      // 编辑器无指定 → 用资源管理器打开目录
      await spawnDetached('explorer.exe', [target], false, kind, '资源管理器');
      return;
    }

    // 用户输入了完整 .exe 路径或带盘符路径，直接执行
    const looksLikePath = /\.exe$/i.test(logicalName) || /^[a-z]:[\\/]/i.test(logicalName);
    if (looksLikePath) {
      await spawnDetached(logicalName, [target], false, kind, logicalName);
      return;
    }

    if (kind === 'editor') {
      const cli = WIN_EDITOR_CLI[logicalName] ?? logicalName;
      // 走 shell:true 是为了让 `code.cmd` 这类 .cmd 包装能被解析到；shell 模式下手动加引号
      await spawnDetached(cli, [winQuote(target)], true, kind, logicalName);
      return;
    }

    // terminal
    const cli = WIN_TERMINAL_CLI[logicalName] ?? logicalName;
    if (/^wt(\.exe)?$/i.test(cli)) {
      await spawnDetached('wt', ['-d', winQuote(target)], true, kind, logicalName);
      return;
    }
    if (/^cmd(\.exe)?$/i.test(cli)) {
      await spawnDetached('cmd', ['/K', `cd /D ${winQuote(target)}`], true, kind, logicalName);
      return;
    }
    if (/^powershell(\.exe)?$/i.test(cli) || /^pwsh(\.exe)?$/i.test(cli)) {
      await spawnDetached(
        cli,
        ['-NoExit', '-Command', `Set-Location -LiteralPath '${target.replace(/'/g, "''")}'`],
        true,
        kind,
        logicalName
      );
      return;
    }
    await spawnDetached(cli, [winQuote(target)], true, kind, logicalName);
    return;
  }

  // Linux / 其他类 Unix
  try {
    if (!appName) {
      await execFileAsync('xdg-open', [target], { timeout: 5000 });
    } else {
      await spawnDetached(appName, [target], false, kind, appName);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isCmdNotFoundError(msg)) {
      throw new Error(notFoundHint(kind, appName || 'xdg-open'));
    }
    throw new Error(
      appName ? `无法用「${appName}」打开：${msg}` : `无法打开目录：${msg}`
    );
  }
}

/**
 * 以"启动后立即脱离父进程"的方式拉起 GUI 程序。
 * - 监听 `error` 事件区分 ENOENT
 * - 监听 `spawn` 事件作为成功标志
 * - 1 秒内若没收到 error 即视为启动成功（GUI 启动通常是异步的）
 */
function spawnDetached(
  cmd: string,
  args: string[],
  useShell: boolean,
  kind: LaunchKind,
  display: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        shell: useShell,
        windowsHide: true
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isCmdNotFoundError(msg)) {
        reject(new Error(notFoundHint(kind, display)));
      } else {
        reject(new Error(`无法用「${display}」打开：${msg}`));
      }
      return;
    }
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (isCmdNotFoundError(msg)) {
        reject(new Error(notFoundHint(kind, display)));
      } else {
        reject(new Error(`无法用「${display}」打开：${msg}`));
      }
    });
    child.once('spawn', () => {
      try {
        child.unref();
      } catch {
        // 忽略
      }
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.unref();
      } catch {
        // 忽略
      }
      resolve();
    }, 1000);
  });
}

function notFoundHint(kind: LaunchKind, appName: string): string {
  const slot = kind === 'editor' ? '编辑器' : '终端';
  return `未找到应用「${appName}」。请在项目详情面板的「快速启动」中点击 ▾ 选择已安装的${slot}。`;
}

/**
 * Windows shell:true 时手动给参数加引号。
 * Node.js 在 shell:true 下不会自动 escape，路径含空格时必须加双引号；
 * 内部双引号转义为 \" ，符合 cmd.exe 规则。
 */
function winQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}
