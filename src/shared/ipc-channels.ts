/** IPC 通道名集中定义，避免主进程与 preload 之间字符串散落 */
export const IpcChannels = {
  GetDefaultRootDir: 'devzen:getDefaultRootDir',
  PickRootDir: 'devzen:pickRootDir',
  ScanProjects: 'devzen:scanProjects',
  ScanProgress: 'devzen:scanProgress',
  CleanDirs: 'devzen:cleanDirs',
  RevealInFinder: 'devzen:revealInFinder',
  CheckProjectDirty: 'devzen:checkProjectDirty',
  ArchiveProject: 'devzen:archiveProject',
  ListArchives: 'devzen:listArchives',
  RestoreProject: 'devzen:restoreProject',
  ForgetArchive: 'devzen:forgetArchive',
  GetProjectDetail: 'devzen:getProjectDetail',
  RefreshProjectDirty: 'devzen:refreshProjectDirty',
  OpenWithEditor: 'devzen:openWithEditor',
  OpenWithTerminal: 'devzen:openWithTerminal',
  ListHistory: 'devzen:listHistory',
  UpsertHistory: 'devzen:upsertHistory',
  RemoveHistory: 'devzen:removeHistory',
  BulkMergeHistory: 'devzen:bulkMergeHistory'
} as const;
