import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CleanResult, ProjectInfo, ScanProgress } from '@shared/types';
import { ProjectList } from './components/ProjectList';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { formatBytes } from './utils/format';

export function App() {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastResults, setLastResults] = useState<CleanResult[] | null>(null);

  // 订阅扫描进度
  useEffect(() => {
    const off = window.devzen.onScanProgress((p) => setProgress(p));
    return off;
  }, []);

  const handlePickDir = useCallback(async () => {
    const dir = await window.devzen.pickRootDir();
    if (dir) setRootDir(dir);
  }, []);

  const handleScan = useCallback(async () => {
    if (!rootDir) return;
    setScanning(true);
    setProjects([]);
    setSelected(new Set());
    setProgress({ scannedDirs: 0, foundProjects: 0, currentPath: rootDir });
    try {
      const list = await window.devzen.scanProjects(rootDir);
      setProjects(list);
    } finally {
      setScanning(false);
    }
  }, [rootDir]);

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
      // 重新扫描以刷新状态
      if (rootDir) {
        const list = await window.devzen.scanProjects(rootDir);
        setProjects(list);
      }
      setSelected(new Set());
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  }, [selected, rootDir]);

  return (
    <div className="app">
      <Toolbar
        rootDir={rootDir}
        scanning={scanning}
        cleaning={cleaning}
        onPickDir={handlePickDir}
        onScan={handleScan}
        onCleanClick={() => setConfirmOpen(true)}
        selectedCount={selected.size}
        selectedSize={selectedSize}
      />

      <main className="main">
        {projects.length === 0 && !scanning && (
          <div className="empty">
            <h2>欢迎使用 DevZen</h2>
            <p>选择一个 Dev 根目录（例如 ~/Dev），扫描所有项目并清理构建产物，释放磁盘空间。</p>
            <button className="primary" onClick={handlePickDir}>
              选择目录
            </button>
          </div>
        )}

        {scanning && (
          <div className="empty">
            <h2>扫描中…</h2>
            <p>已扫描目录：{progress?.scannedDirs ?? 0}</p>
            <p>已发现项目：{progress?.foundProjects ?? 0}</p>
            <p className="muted truncate">{progress?.currentPath ?? ''}</p>
          </div>
        )}

        {projects.length > 0 && !scanning && (
          <ProjectList
            projects={projects}
            selected={selected}
            onToggleDir={toggleDir}
            onToggleProject={toggleProject}
            onReveal={(p) => window.devzen.revealInFinder(p)}
          />
        )}
      </main>

      <StatusBar
        projectCount={projects.length}
        totalCleanable={totalCleanable}
        selectedSize={selectedSize}
        lastResults={lastResults}
      />

      {confirmOpen && (
        <ConfirmDialog
          title="确认清理"
          message={`将删除 ${selected.size} 个目录，预计释放 ${formatBytes(selectedSize)}。此操作不可撤销。`}
          confirmText={cleaning ? '清理中…' : '确认清理'}
          confirmDisabled={cleaning}
          onConfirm={handleClean}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
