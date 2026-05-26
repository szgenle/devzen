import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels.js';
import type {
  ArchiveRecord,
  ArchiveResult,
  CleanResult,
  DevZenAPI,
  HistoryEntry,
  ProjectDetail,
  ProjectDirtyInfo,
  ProjectInfo,
  RestoreResult,
  ScanProgress
} from '@shared/types';

const api: DevZenAPI = {
  platform: process.platform as DevZenAPI['platform'],

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
    ipcRenderer.invoke(IpcChannels.ForgetArchive, target) as Promise<void>,

  getProjectDetail: (target: string) =>
    ipcRenderer.invoke(IpcChannels.GetProjectDetail, target) as Promise<ProjectDetail>,

  openWithEditor: (target: string, editor: string) =>
    ipcRenderer.invoke(IpcChannels.OpenWithEditor, target, editor) as Promise<void>,

  openWithTerminal: (target: string, terminal: string) =>
    ipcRenderer.invoke(IpcChannels.OpenWithTerminal, target, terminal) as Promise<void>,

  listHistory: () =>
    ipcRenderer.invoke(IpcChannels.ListHistory) as Promise<HistoryEntry[]>,

  upsertHistory: (entry: HistoryEntry) =>
    ipcRenderer.invoke(IpcChannels.UpsertHistory, entry) as Promise<HistoryEntry[]>,

  removeHistory: (rootDir: string) =>
    ipcRenderer.invoke(IpcChannels.RemoveHistory, rootDir) as Promise<HistoryEntry[]>,

  bulkMergeHistory: (entries: HistoryEntry[]) =>
    ipcRenderer.invoke(IpcChannels.BulkMergeHistory, entries) as Promise<HistoryEntry[]>
};

contextBridge.exposeInMainWorld('devzen', api);
