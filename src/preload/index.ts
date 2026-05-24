import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels.js';
import type { CleanResult, DevZenAPI, ProjectInfo, ScanProgress } from '@shared/types';

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
    ipcRenderer.invoke(IpcChannels.RevealInFinder, target) as Promise<void>
};

contextBridge.exposeInMainWorld('devzen', api);
