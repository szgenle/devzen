import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels.js';
import type {
  AppSettings,
  ArchiveRecord,
  ArchiveResult,
  BundleProgress,
  BundleRecord,
  BundleResult,
  CleanResult,
  DevZenAPI,
  HistoryEntry,
  ProjectDetail,
  ProjectDirtyInfo,
  ProjectInfo,
  RestoreBundleResult,
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

  cleanDirs: (paths: string[], projectRoots: string[]) =>
    ipcRenderer.invoke(IpcChannels.CleanDirs, paths, projectRoots) as Promise<CleanResult[]>,

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

  refreshProjectDirty: (target: string) =>
    ipcRenderer.invoke(IpcChannels.RefreshProjectDirty, target) as Promise<boolean | null>,

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
    ipcRenderer.invoke(IpcChannels.BulkMergeHistory, entries) as Promise<HistoryEntry[]>,

  // ---------------- 冷备包（bundle） ----------------
  getSettings: () =>
    ipcRenderer.invoke(IpcChannels.GetSettings) as Promise<AppSettings>,

  setBackupDir: (dir: string) =>
    ipcRenderer.invoke(IpcChannels.SetBackupDir, dir) as Promise<AppSettings>,

  pickBackupDir: () =>
    ipcRenderer.invoke(IpcChannels.PickBackupDir) as Promise<string | null>,

  pickDir: (title: string) =>
    ipcRenderer.invoke(IpcChannels.PickDir, title) as Promise<string | null>,

  bundleArchive: (archivePath: string) =>
    ipcRenderer.invoke(IpcChannels.BundleArchive, archivePath) as Promise<BundleResult>,

  bundleAndRemove: (archivePath: string) =>
    ipcRenderer.invoke(IpcChannels.BundleAndRemove, archivePath) as Promise<BundleResult>,

  listBundles: () =>
    ipcRenderer.invoke(IpcChannels.ListBundles) as Promise<BundleRecord[]>,

  verifyBundle: (bundleId: string) =>
    ipcRenderer.invoke(IpcChannels.VerifyBundle, bundleId) as Promise<{ ok: boolean; error?: string }>,

  restoreBundle: (bundleId: string, targetDir: string) =>
    ipcRenderer.invoke(IpcChannels.RestoreBundle, bundleId, targetDir) as Promise<RestoreBundleResult>,

  deleteBundle: (bundleId: string) =>
    ipcRenderer.invoke(IpcChannels.DeleteBundle, bundleId) as Promise<void>,

  onBundleProgress: (cb: (p: BundleProgress) => void) => {
    const listener = (_e: unknown, payload: BundleProgress) => cb(payload);
    ipcRenderer.on(IpcChannels.BundleProgress, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.BundleProgress, listener);
    };
  },

  openHelp: () => ipcRenderer.invoke(IpcChannels.OpenHelp) as Promise<void>
};

contextBridge.exposeInMainWorld('devzen', api);
