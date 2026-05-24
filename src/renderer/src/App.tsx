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

  // 启动时拿到默认主目录建议，省去手动选择目录的步骤
  useEffect(() => {
    window.devzen.getDefaultRootDir().then((dir) => {
      setRootDir((curr) => curr ?? dir);
    });
  }, []);

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

  /** 选中集中所属项目中，无远程备份（source === 'local'）的项目。
   *  这些项目只在本地，删了就没了，需要在清理前强提醒。
   *  注意：这里判的是"项目本身"在本地唯一，不是"删除项目根"。
   *  即使只是删 node_modules，对于不懂技术的用户也需要告诉他们：
   *  “这个项目没有远程备份，请确认你只是在清理构建产物、不是删代码。”
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
            <h2>让你的项目一目了然</h2>
            <p>
              扫描你的项目目录，DevZen 会列出你有哪些项目、来自哪里、占了多少空间，
              <br />并准确告诉你哪些构建产物可以安全删除。
            </p>
            {rootDir && (
              <p className="muted truncate">
                默认扫描路径：<code>{rootDir}</code>
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={handleScan} disabled={!rootDir}>
                开始扫描
              </button>
              <button onClick={handlePickDir}>换个目录</button>
            </div>
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
          message={
            <>
              <p>
                将删除 <strong>{selected.size}</strong> 个目录，
                预计释放 <strong>{formatBytes(selectedSize)}</strong>。
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
