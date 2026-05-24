import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CleanResult, ProjectInfo, ScanProgress } from '@shared/types';
import { ProjectList } from './components/ProjectList';
import { HomeScreen } from './components/HomeScreen';
import { ScanScreen } from './components/ScanScreen';
import { ResultsHeader } from './components/ResultsHeader';
import { ActionBar } from './components/ActionBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { formatBytes } from './utils/format';
import { loadSnapshot, saveSnapshot, clearSnapshot } from './utils/storage';

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

  // 启动时优先恢复上次扫描快照；没有快照才取默认主目录
  useEffect(() => {
    const snap = loadSnapshot();
    if (snap && snap.projects.length > 0) {
      setRootDir(snap.rootDir);
      setProjects(snap.projects);
      setScannedAt(snap.scannedAt);
      setView('results');
      return;
    }
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
      // 扫描成功立刻持久化，下次进入应用直接看到结果
      saveSnapshot({ rootDir, projects: list, scannedAt: ts });
      setView('results');
    } catch {
      setView('home');
    }
  }, [rootDir]);

  // 返回首页：仅切换视图，不动持久化的快照与当前结果，
  // 这样用户从首页再次扫描或重启应用都能继续看到上次数据
  const handleBackHome = useCallback(() => {
    setView('home');
    setSelected(new Set());
    setProgress(null);
    setLastResults(null);
  }, []);

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
      // 重新扫描以刷新状态，同时更新快照
      if (rootDir) {
        const list = await window.devzen.scanProjects(rootDir);
        const ts = Date.now();
        setProjects(list);
        setScannedAt(ts);
        saveSnapshot({ rootDir, projects: list, scannedAt: ts });
      }
      setSelected(new Set());
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  }, [selected, rootDir]);

  // 切换扫描目录后，旧目录的快照已不再适用，直接清掉
  const handlePickAndReset = useCallback(async () => {
    const dir = await window.devzen.pickRootDir();
    if (!dir) return;
    setRootDir(dir);
    setProjects([]);
    setScannedAt(null);
    clearSnapshot();
  }, []);

  return (
    <div className={`app app-${view}`}>
      {view === 'home' && (
        <HomeScreen rootDir={rootDir} onPickDir={handlePickAndReset} onScan={handleScan} />
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
              onToggleDir={toggleDir}
              onToggleProject={toggleProject}
              onReveal={(p) => window.devzen.revealInFinder(p)}
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
