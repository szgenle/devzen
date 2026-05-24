import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron';
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
}
