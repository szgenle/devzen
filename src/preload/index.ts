import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels.js';
import type {
  ArchiveRecord,
  ArchiveResult,
  CleanResult,
  DevZenAPI,
  ProjectDirtyInfo,
  ProjectInfo,
  RestoreResult,
  ScanProgress
} from '@shared/types';

const api: DevZenAPI = {
  getDefaultRootDir: () =>
    ipcRenderer.invoke(IpcChannels.GetDefaultRootDir) as Promise<string>,

  pickRootDir: () => ipcRenderer.invoke(IpcChannels.PickRootDir) as Promise<string | null>,

  scanProjects: (rootDir: string) =>
    ipcRenderer.invoke(IpcChannels.ScanProjects, rootDir) as Promise<ProjectInfo[]>,

  onScanProgress: (cb: (p: ScanProgress) => void) => {
    const listener = (_e: unknown, payload: ScanProgress) => cb(payload);
    ipcRenderer.on(IpcChannels.ScanProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.ScanProgress, listener);
    };
  },

  cleanDirs: (paths: string[]) =>
    ipcRenderer.invoke(IpcChannels.CleanDirs, paths) as Promise<CleanResult[]>,

  revealInFinder: (target: string) =>
    ipcRenderer.invoke(IpcChannels.RevealInFinder, target) as Promise<void>,

  checkProjectDirty: (target: string) =>
    ipcRenderer.invoke(IpcChannels.CheckProjectDirty, target) as Promise<ProjectDirtyInfo>,

  archiveProject: (target: string, force: boolean) =>
    ipcRenderer.invoke(IpcChannels.ArchiveProject, target, force) as Promise<ArchiveResult>,

  listArchives: () =>
    ipcRenderer.invoke(IpcChannels.ListArchives) as Promise<ArchiveRecord[]>,

  restoreProject: (target: string) =>
    ipcRenderer.invoke(IpcChannels.RestoreProject, target) as Promise<RestoreResult>,

  forgetArchive: (target: string) =>
    ipcRenderer.invoke(IpcChannels.ForgetArchive, target) as Promise<void>
};

contextBridge.exposeInMainWorld('devzen', api);
