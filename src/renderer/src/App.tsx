import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArchiveRecord, CleanResult, ProjectInfo, RestoreResult, ScanProgress } from '@shared/types';
import { OverviewList } from './components/OverviewList';
import { CleanupList } from './components/CleanupList';
import { ProjectDetailPanel } from './components/ProjectDetailPanel';
import { HomeScreen } from './components/HomeScreen';
import { ScanScreen } from './components/ScanScreen';
import { ResultsHeader } from './components/ResultsHeader';
import { ActionBar } from './components/ActionBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ArchiveDialog } from './components/ArchiveDialog';
import { RestoreResultDialog } from './components/RestoreResultDialog';
import { ArchivesScreen } from './components/ArchivesScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { FilterBar, EMPTY_FILTER, applyFilter, isFilterActive, type FilterState } from './components/FilterBar';
import { formatBytes } from './utils/format';
import {
  loadHistory,
  upsertHistoryEntry,
  removeHistoryEntry,
  type HistoryEntry
} from './utils/storage';
import {
  loadStore,
  assignCategory,
  unassignCategory,
  addCustomCategory,
  removeCustomCategory,
  type Category,
  type CategoryStore
} from './utils/categories';
import {
  loadTagStore,
  createTag,
  deleteTag,
  addTagToProject,
  removeTagFromProject,
  type Tag,
  type TagStore
} from './utils/tags';
import {
  loadPreferences,
  savePreferences,
  resolveTheme,
  type ThemeMode,
  type Lang
} from './utils/preferences';
import { getMessages } from './utils/i18n';

type View = 'home' | 'scanning' | 'results' | 'settings' | 'archives';
type ResultsTab = 'overview' | 'cleanup';
export type ViewMode = 'list' | 'card';

const VIEW_MODE_KEY = 'devzen.viewMode.v1';
function loadViewMode(): ViewMode {
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === 'list' ? 'list' : 'card';
}
function saveViewMode(mode: ViewMode): void {
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

export function App() {
  const [view, setView] = useState<View>('home');
  const [resultsTab, setResultsTab] = useState<ResultsTab>('overview');
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastResults, setLastResults] = useState<CleanResult[] | null>(null);
  // 上次扫描时间戳；用于在结果页头部展示"上次扫描于 X"，提示数据新鲜度
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  // 扫描历史列表：首页以列表形式呈现，用户自己决定查看或重扫
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // 项目分类存档（内置分类 + 自定义分类 + 项目分配）
  const [categoryStore, setCategoryStore] = useState<CategoryStore>(() => loadStore());
  // 项目标签存档（标签定义 + 项目关联）
  const [tagStore, setTagStore] = useState<TagStore>(() => loadTagStore());
  // 概览页视图模式：列表 / 卡片
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  // 当前打开详情侧边栏的项目；null 表示未打开
  const [detailProject, setDetailProject] = useState<ProjectInfo | null>(null);
  // 用户偏好设置（主题 / 语言）
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const t = useMemo(() => getMessages(prefs.lang), [prefs.lang]);
  // 概览页筛选状态
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  // 已归档项目列表（由主进程的 archive-store 驱动）
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  // 当前打开归档对话框的目标项目
  const [archiveTarget, setArchiveTarget] = useState<ProjectInfo | null>(null);
  // 恢复操作的结果对话框
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  // 正在恢复的归档路径，用于禁用按钮 / 显示 loading
  const [restoringPath, setRestoringPath] = useState<string | null>(null);

  // 应用主题到 <html> 标签
  useEffect(() => {
    const resolved = resolveTheme(prefs.theme);
    document.documentElement.setAttribute('data-theme', resolved);
    // system 模式下监听系统主题变化
    if (prefs.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const handler = () => {
        document.documentElement.setAttribute('data-theme', mq.matches ? 'light' : 'dark');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [prefs.theme]);

  // 启动时加载历史与默认主目录，但保持在首页：
  // 清理是低频操作，没必要每次进入都自动扫描。
  useEffect(() => {
    setHistory(loadHistory());
    window.devzen.getDefaultRootDir().then((dir) => {
      setRootDir((curr) => curr ?? dir);
    });
    // 加载归档列表
    window.devzen.listArchives().then(setArchives).catch(() => undefined);
  }, []);

  // 订阅扫描进度
  useEffect(() => {
    const off = window.devzen.onScanProgress((p) => setProgress(p));
    return off;
  }, []);

  const handleScan = useCallback(async () => {
    if (!rootDir) return;
    setView('scanning');
    setProjects([]);
    setSelected(new Set());
    setLastResults(null);
    setFilter(EMPTY_FILTER);
    setProgress({ scannedDirs: 0, foundProjects: 0, currentPath: rootDir });
    try {
      const list = await window.devzen.scanProjects(rootDir);
      const ts = Date.now();
      setProjects(list);
      setScannedAt(ts);
      // 扫描成功后写回历史，让下次进入首页能看到这条记录
      setHistory(upsertHistoryEntry({ rootDir, projects: list, scannedAt: ts }));
      setView('results');
    } catch {
      setView('home');
    }
  }, [rootDir]);

  // 从历史进入查看上次扫描结果，不重新扫描
  const handleViewEntry = useCallback((entry: HistoryEntry) => {
    setRootDir(entry.rootDir);
    setProjects(entry.projects);
    setScannedAt(entry.scannedAt);
    setSelected(new Set());
    setLastResults(null);
    setView('results');
  }, []);

  // 从历史列表里以某个路径为起点重新扫描
  const handleRescanEntry = useCallback(
    (entry: HistoryEntry) => {
      setRootDir(entry.rootDir);
      // 状态更新是异步的，用 setTimeout 让 setRootDir 先生效，
      // 避免 handleScan 里读到旧的 rootDir。
      setTimeout(() => {
        if (entry.rootDir) {
          setView('scanning');
          setProjects([]);
          setSelected(new Set());
          setLastResults(null);
          setProgress({ scannedDirs: 0, foundProjects: 0, currentPath: entry.rootDir });
          window.devzen
            .scanProjects(entry.rootDir)
            .then((list) => {
              const ts = Date.now();
              setProjects(list);
              setScannedAt(ts);
              setHistory(
                upsertHistoryEntry({ rootDir: entry.rootDir, projects: list, scannedAt: ts })
              );
              setView('results');
            })
            .catch(() => setView('home'));
        }
      }, 0);
    },
    []
  );

  // 删除某条历史，仅动本地存档，不会变动实际文件系统
  const handleRemoveEntry = useCallback((rootDir: string) => {
    setHistory(removeHistoryEntry(rootDir));
  }, []);

  // 返回首页：仅切换视图，历史与当前结果均保留，用户可从历史重新点进查看
  const handleBackHome = useCallback(() => {
    setView('home');
    setSelected(new Set());
    setProgress(null);
    setLastResults(null);
    setDetailProject(null);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  }, []);

  // ---------------- 偏好设置 ----------------
  const handleThemeChange = useCallback((mode: ThemeMode) => {
    setPrefs((prev) => {
      const next = { ...prev, theme: mode };
      savePreferences(next);
      return next;
    });
  }, []);

  const handleLangChange = useCallback((lang: Lang) => {
    setPrefs((prev) => {
      const next = { ...prev, lang };
      savePreferences(next);
      return next;
    });
  }, []);

  const handleOpenSettings = useCallback(() => setView('settings'), []);
  const handleBackFromSettings = useCallback(() => setView('home'), []);

  // 打开/关闭 已归档项目独立页
  const handleOpenArchives = useCallback(() => setView('archives'), []);
  const handleBackFromArchives = useCallback(() => setView('home'), []);

  // ---------------- 分类管理 ----------------
  const handleAssignCategory = useCallback((p: ProjectInfo, categoryId: string) => {
    setCategoryStore((prev) => assignCategory(p.path, categoryId, prev));
  }, []);

  const handleUnassignCategory = useCallback((p: ProjectInfo) => {
    setCategoryStore((prev) => unassignCategory(p.path, prev));
  }, []);

  const handleAddCategory = useCallback((name: string): Category => {
    let created: Category | null = null;
    setCategoryStore((prev) => {
      const { store, category } = addCustomCategory(name, prev);
      created = category;
      return store;
    });
    // setState 同步调用 updater，addCustomCategory 一定会赋值 created
    return created as unknown as Category;
  }, []);

  const handleRemoveCategory = useCallback((id: string) => {
    setCategoryStore((prev) => removeCustomCategory(id, prev));
  }, []);

  // ---------------- 标签管理 ----------------
  const handleCreateTag = useCallback((name: string): Tag => {
    let created: Tag | null = null;
    setTagStore((prev) => {
      const { store, tag } = createTag(name, prev);
      created = tag;
      return store;
    });
    return created as unknown as Tag;
  }, []);

  const handleDeleteTag = useCallback((id: string) => {
    setTagStore((prev) => deleteTag(id, prev));
  }, []);

  const handleAddTagToProject = useCallback((p: ProjectInfo, tagId: string) => {
    setTagStore((prev) => addTagToProject(p.path, tagId, prev));
  }, []);

  const handleRemoveTagFromProject = useCallback((p: ProjectInfo, tagId: string) => {
    setTagStore((prev) => removeTagFromProject(p.path, tagId, prev));
  }, []);

  // 详情面板要展示的是当前 projects 列表里的最新数据，
  // 防止外部状态变更后面板里还指着旧引用。
  const detailLatest = useMemo<ProjectInfo | null>(() => {
    if (!detailProject) return null;
    return projects.find((p) => p.path === detailProject.path) ?? detailProject;
  }, [detailProject, projects]);

  // 概览页经过筛选后的项目列表
  const filteredProjects = useMemo(
    () => applyFilter(projects, filter, categoryStore, tagStore),
    [projects, filter, categoryStore, tagStore]
  );
  const filterActive = isFilterActive(filter);

  const totalCleanable = useMemo(
    () => projects.reduce((s, p) => s + p.cleanableSize, 0),
    [projects]
  );

  const selectedSize = useMemo(() => {
    let total = 0;
    for (const p of projects) {
      for (const c of p.cleanables) {
        if (selected.has(c.path)) total += c.size;
      }
    }
    return total;
  }, [projects, selected]);

  /** 选中目录所属项目中，source === 'local' 的项目。
   *  这些项目没有远程备份，清理前需要在确认框里加强提醒。
   *  注意：我们清理的只是构建产物目录，不会删项目根，
   *  但仍要告知用户"这个项目只在本地"，让其知情确认。
   */
  const localOnlyProjects = useMemo(() => {
    const list: ProjectInfo[] = [];
    for (const p of projects) {
      if (p.source !== 'local') continue;
      const hit = p.cleanables.some((c) => selected.has(c.path));
      if (hit) list.push(p);
    }
    return list;
  }, [projects, selected]);

  const toggleDir = useCallback((dirPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const toggleProject = useCallback((p: ProjectInfo, allOn: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of p.cleanables) {
        if (allOn) next.add(c.path);
        else next.delete(c.path);
      }
      return next;
    });
  }, []);

  const handleClean = useCallback(async () => {
    if (selected.size === 0) return;
    setCleaning(true);
    try {
      const results = await window.devzen.cleanDirs(Array.from(selected));
      setLastResults(results);
      // 重新扫描以刷新状态，同时更新该路径的历史记录
      if (rootDir) {
        const list = await window.devzen.scanProjects(rootDir);
        const ts = Date.now();
        setProjects(list);
        setScannedAt(ts);
        setHistory(upsertHistoryEntry({ rootDir, projects: list, scannedAt: ts }));
      }
      setSelected(new Set());
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  }, [selected, rootDir]);

  // 首页点击"换个目录"：仅更新当前 rootDir，
  // 不动历史中其他路径的存档。
  const handlePickRootDir = useCallback(async () => {
    const dir = await window.devzen.pickRootDir();
    if (!dir) return;
    setRootDir(dir);
  }, []);

  // ---------------- 归档 / 恢复 ----------------
  // 详情面板触发归档：仅打开对话框，实际删除由对话框内部调用
  const handleOpenArchive = useCallback((p: ProjectInfo) => {
    setArchiveTarget(p);
  }, []);

  // 归档成功后：刷新归档列表、关闭对话框、关闭详情面板、
  // 若当前停留在结果页则把该项目从列表中剔除（已被卸载）
  const handleArchived = useCallback(
    async (_freedBytes: number) => {
      const target = archiveTarget;
      setArchiveTarget(null);
      setDetailProject(null);
      try {
        const next = await window.devzen.listArchives();
        setArchives(next);
      } catch {
        // 忽略列表刷新失败：不影响已完成的归档动作
      }
      if (target) {
        setProjects((prev) => prev.filter((p) => p.path !== target.path));
      }
    },
    [archiveTarget]
  );

  // 首页点击"恢复"：调用 restoreProject，结果展示在 RestoreResultDialog
  const handleRestoreArchive = useCallback(async (rec: ArchiveRecord) => {
    setRestoringPath(rec.path);
    try {
      const result = await window.devzen.restoreProject(rec.path);
      setRestoreResult(result);
      // 恢复后刷新归档列表（pathExists 可能变化；恢复成功后通常仍保留在列表）
      try {
        const next = await window.devzen.listArchives();
        setArchives(next);
      } catch {
        // ignore
      }
    } catch (e) {
      setRestoreResult({
        path: rec.path,
        success: false,
        error: (e as Error).message,
        followUpHints: []
      });
    } finally {
      setRestoringPath(null);
    }
  }, []);

  // 首页"忘记"：仅从索引移除，不动本地文件
  const handleForgetArchive = useCallback(
    async (path: string) => {
      const ok = window.confirm(t.forgetConfirm);
      if (!ok) return;
      try {
        await window.devzen.forgetArchive(path);
        const next = await window.devzen.listArchives();
        setArchives(next);
      } catch {
        // ignore
      }
    },
    [t.forgetConfirm]
  );

  return (
    <div className={`app app-${view === 'settings' || view === 'archives' ? 'home' : view}`}>
      {view === 'home' && (
        <HomeScreen
          rootDir={rootDir}
          history={history}
          archives={archives}
          t={t}
          onPickDir={handlePickRootDir}
          onScan={handleScan}
          onViewEntry={handleViewEntry}
          onRescanEntry={handleRescanEntry}
          onRemoveEntry={handleRemoveEntry}
          onOpenSettings={handleOpenSettings}
          onOpenArchives={handleOpenArchives}
        />
      )}

      {view === 'archives' && (
        <ArchivesScreen
          archives={archives}
          t={t}
          restoringPath={restoringPath}
          onBack={handleBackFromArchives}
          onRestore={handleRestoreArchive}
          onForget={handleForgetArchive}
          onReveal={(p) => window.devzen.revealInFinder(p)}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen
          theme={prefs.theme}
          lang={prefs.lang}
          t={t}
          onThemeChange={handleThemeChange}
          onLangChange={handleLangChange}
          onBack={handleBackFromSettings}
        />
      )}

      {view === 'scanning' && <ScanScreen progress={progress} t={t} />}

      {view === 'results' && (
        <>
          <ResultsHeader
            rootDir={rootDir}
            cleaning={cleaning}
            scannedAt={scannedAt}
            activeTab={resultsTab}
            viewMode={viewMode}
            t={t}
            onViewModeChange={handleViewModeChange}
            onTabChange={setResultsTab}
            onBackHome={handleBackHome}
            onRescan={handleScan}
          />

          <main className="main">
            {resultsTab === 'overview' ? (
              <>
                <FilterBar
                  projects={projects}
                  filter={filter}
                  categoryStore={categoryStore}
                  tagStore={tagStore}
                  t={t}
                  onChange={setFilter}
                />
                {filterActive && filteredProjects.length === 0 ? (
                  <div className="overview-empty muted">{t.filterNoResults}</div>
                ) : (
                  <OverviewList
                    projects={filteredProjects}
                    categoryStore={categoryStore}
                    viewMode={viewMode}
                    t={t}
                    onReveal={(p: string) => window.devzen.revealInFinder(p)}
                    onSelectProject={(p: ProjectInfo) => setDetailProject(p)}
                  />
                )}
              </>
            ) : (
              <CleanupList
                projects={projects}
                selected={selected}
                t={t}
                onToggleDir={toggleDir}
                onToggleProject={toggleProject}
                onReveal={(p) => window.devzen.revealInFinder(p)}
              />
            )}
          </main>

          {resultsTab === 'cleanup' && (
            <ActionBar
              projectCount={projects.length}
              totalCleanable={totalCleanable}
              selectedCount={selected.size}
              selectedSize={selectedSize}
              cleaning={cleaning}
              lastResults={lastResults}
              t={t}
              onCleanClick={() => setConfirmOpen(true)}
              onClearSelection={() => setSelected(new Set())}
            />
          )}
        </>
      )}

      <ProjectDetailPanel
        project={detailLatest}
        categoryStore={categoryStore}
        tagStore={tagStore}
        t={t}
        onClose={() => setDetailProject(null)}
        onAssignCategory={handleAssignCategory}
        onUnassignCategory={handleUnassignCategory}
        onAddCategory={handleAddCategory}
        onRemoveCategory={handleRemoveCategory}
        onAddTagToProject={handleAddTagToProject}
        onRemoveTagFromProject={handleRemoveTagFromProject}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        onReveal={(p) => window.devzen.revealInFinder(p)}
        onArchive={handleOpenArchive}
      />

      {confirmOpen && (
        <ConfirmDialog
          title={t.confirmTitle}
          message={
            <>
              <p>
                {t.confirmDeleteCount} <strong>{selected.size}</strong> {t.confirmDirsEstimate}{' '}
                <strong>{formatBytes(selectedSize)}</strong>。
                <br />
                <span className="muted">
                  {t.confirmSafeNote}
                </span>
              </p>
              {localOnlyProjects.length > 0 && (
                <div className="warn-block">
                  <strong>{t.confirmLocalWarn}</strong>
                  <ul>
                    {localOnlyProjects.map((p) => (
                      <li key={p.path}>{p.name}</li>
                    ))}
                  </ul>
                  <span className="muted">
                    {t.confirmLocalNote}
                  </span>
                </div>
              )}
            </>
          }
          confirmText={cleaning ? t.cleaning : t.confirmBtn}
          cancelText={t.cancel}
          confirmDisabled={cleaning}
          onConfirm={handleClean}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {archiveTarget && (
        <ArchiveDialog
          project={archiveTarget}
          t={t}
          onClose={() => setArchiveTarget(null)}
          onArchived={handleArchived}
        />
      )}

      {restoreResult && (
        <RestoreResultDialog
          result={restoreResult}
          t={t}
          onClose={() => setRestoreResult(null)}
          onReveal={(p) => window.devzen.revealInFinder(p)}
        />
      )}
    </div>
  );
}
