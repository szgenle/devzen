import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CleanResult, ProjectInfo, ScanProgress } from '@shared/types';
import { ProjectList } from './components/ProjectList';
import { ProjectDetailPanel } from './components/ProjectDetailPanel';
import { HomeScreen } from './components/HomeScreen';
import { ScanScreen } from './components/ScanScreen';
import { ResultsHeader } from './components/ResultsHeader';
import { ActionBar } from './components/ActionBar';
import { ConfirmDialog } from './components/ConfirmDialog';
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

type View = 'home' | 'scanning' | 'results';

export function App() {
  const [view, setView] = useState<View>('home');
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
  // 当前打开详情侧边栏的项目；null 表示未打开
  const [detailProject, setDetailProject] = useState<ProjectInfo | null>(null);

  // 启动时加载历史与默认主目录，但保持在首页：
  // 清理是低频操作，没必要每次进入都自动扫描。
  useEffect(() => {
    setHistory(loadHistory());
    window.devzen.getDefaultRootDir().then((dir) => {
      setRootDir((curr) => curr ?? dir);
    });
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

  // 详情面板要展示的是当前 projects 列表里的最新数据，
  // 防止外部状态变更后面板里还指着旧引用。
  const detailLatest = useMemo<ProjectInfo | null>(() => {
    if (!detailProject) return null;
    return projects.find((p) => p.path === detailProject.path) ?? detailProject;
  }, [detailProject, projects]);

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

  return (
    <div className={`app app-${view}`}>
      {view === 'home' && (
        <HomeScreen
          rootDir={rootDir}
          history={history}
          onPickDir={handlePickRootDir}
          onScan={handleScan}
          onViewEntry={handleViewEntry}
          onRescanEntry={handleRescanEntry}
          onRemoveEntry={handleRemoveEntry}
        />
      )}

      {view === 'scanning' && <ScanScreen progress={progress} />}

      {view === 'results' && (
        <>
          <ResultsHeader
            rootDir={rootDir}
            cleaning={cleaning}
            scannedAt={scannedAt}
            onBackHome={handleBackHome}
            onRescan={handleScan}
          />

          <main className="main">
            <ProjectList
              projects={projects}
              selected={selected}
              categoryStore={categoryStore}
              onToggleDir={toggleDir}
              onToggleProject={toggleProject}
              onReveal={(p) => window.devzen.revealInFinder(p)}
              onSelectProject={(p) => setDetailProject(p)}
            />
          </main>

          <ActionBar
            projectCount={projects.length}
            totalCleanable={totalCleanable}
            selectedCount={selected.size}
            selectedSize={selectedSize}
            cleaning={cleaning}
            lastResults={lastResults}
            onCleanClick={() => setConfirmOpen(true)}
            onClearSelection={() => setSelected(new Set())}
          />
        </>
      )}

      <ProjectDetailPanel
        project={detailLatest}
        categoryStore={categoryStore}
        onClose={() => setDetailProject(null)}
        onAssignCategory={handleAssignCategory}
        onUnassignCategory={handleUnassignCategory}
        onAddCategory={handleAddCategory}
        onRemoveCategory={handleRemoveCategory}
        onReveal={(p) => window.devzen.revealInFinder(p)}
      />

      {confirmOpen && (
        <ConfirmDialog
          title="确认清理"
          message={
            <>
              <p>
                将删除 <strong>{selected.size}</strong> 个目录， 预计释放{' '}
                <strong>{formatBytes(selectedSize)}</strong>。
                <br />
                <span className="muted">
                  仅删除构建产物目录（node_modules、target、build 等），不会动你的源码。
                </span>
              </p>
              {localOnlyProjects.length > 0 && (
                <div className="warn-block">
                  <strong>⚠ 以下项目没有远程备份</strong>
                  <ul>
                    {localOnlyProjects.map((p) => (
                      <li key={p.path}>{p.name}</li>
                    ))}
                  </ul>
                  <span className="muted">
                    本次只会删除这些项目下的构建产物，不会删除项目本身。但请确认你知道自己在做什么。
                  </span>
                </div>
              )}
            </>
          }
          confirmText={cleaning ? '清理中…' : '确认清理'}
          confirmDisabled={cleaning}
          onConfirm={handleClean}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
