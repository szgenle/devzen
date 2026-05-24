import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
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

const HOME = process.env.HOME ?? '';

/** 仅允许在用户家目录内打开，避免渲染层把任意路径丢进来 */
function ensureInsideHome(target: string): void {
  if (!HOME || !target.startsWith(HOME + '/')) {
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
      // 空字符串 → 走系统默认行为（macOS：等同 `open <path>`，会用 Finder 或文件关联程序）。
      // 非空 → 用 macOS 的 `open -a "<App>" <path>`，无需依赖 GUI 进程是否能找到 CLI（如 code）。
      try {
        if (appName) {
          await execFileAsync('open', ['-a', appName, target], { timeout: 5000 });
        } else {
          await execFileAsync('open', [target], { timeout: 5000 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (appName && isAppNotFoundError(msg)) {
          throw new Error(
            `未找到应用「${appName}」。请在项目详情面板的「快速启动」中点击 ▾ 选择已安装的编辑器。`
          );
        }
        throw new Error(
          appName
            ? `无法用「${appName}」打开：${msg}`
            : `无法打开目录：${msg}`
        );
      }
    }
  );

  ipcMain.handle(
    IpcChannels.OpenWithTerminal,
    async (_event, target: string, terminal: string) => {
      ensureInsideHome(target);
      await ensureDirectory(target);
      const appName = (terminal ?? '').trim() || 'Terminal';
      try {
        await execFileAsync('open', ['-a', appName, target], { timeout: 5000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isAppNotFoundError(msg)) {
          throw new Error(
            `未找到应用「${appName}」。请在项目详情面板的「快速启动」中点击 ▾ 选择已安装的终端。`
          );
        }
        throw new Error(`无法用「${appName}」打开终端：${msg}`);
      }
    }
  );
}

/** 识别 macOS `open -a` 在找不到目标应用时返回的错误信息。 */
function isAppNotFoundError(msg: string): boolean {
  return /Unable to find application named/i.test(msg);
}
