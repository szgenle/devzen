import { useEffect, useRef, useState } from 'react';
import type { ProjectInfo } from '@shared/types';
import { formatBytes, shortenPath } from '../utils/format';
import type { Messages } from '../utils/i18n';

interface Props {
  projects: ProjectInfo[];
  selected: Set<string>;
  t: Messages;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
}

// 拖拽刷选状态：项目级与目录级互不串扰
type DragState =
  | { kind: 'project'; desired: boolean; visited: Set<string> }
  | { kind: 'dir'; desired: boolean; visited: Set<string> }
  | null;

// 起点位于交互控件内时不进入拖动模式（让原始点击/键盘语义生效）
function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, button, a, label');
}

/**
 * 清理页：专注于"可以安全清理什么"。
 * 仅展示有可清理目录的项目，信息精简为项目名 + 可清理大小 + 展开详情。
 * 无描述、无来源标签、无生态标签（这些在概览页看）。
 *
 * 交互增强：支持按住鼠标拖拽刷选/反选（Finder 风格）。
 * - 在项目行上拖动 → 批量切换项目级勾选
 * - 在展开的子目录条目上拖动 → 批量切换目录级勾选
 * - 起点是 input/button/链接时不进入拖动，保留原始点击语义
 */
export function CleanupList({ projects, selected, t, onToggleDir, onToggleProject, onReveal }: Props) {
  // 只展示有可清理内容的项目
  const cleanable = projects.filter((p) => p.cleanables.length > 0);

  // 用 ref 承载拖拽状态，避免每次拖过一行就重渲染整个列表
  const dragRef = useRef<DragState>(null);

  // 全局 mouseup 兜底：拖出窗口外松开也能正确结束
  useEffect(() => {
    const end = () => {
      dragRef.current = null;
    };
    window.addEventListener('mouseup', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('mouseup', end);
      window.removeEventListener('blur', end);
    };
  }, []);

  const beginProjectDrag = (project: ProjectInfo, allSelected: boolean, e: React.MouseEvent) => {
    if (isInteractive(e.target)) return;
    e.preventDefault(); // 抑制文本选中
    const desired = !allSelected;
    onToggleProject(project, desired);
    dragRef.current = { kind: 'project', desired, visited: new Set([project.path]) };
  };

  const enterProject = (project: ProjectInfo) => {
    const s = dragRef.current;
    if (!s || s.kind !== 'project') return;
    if (s.visited.has(project.path)) return;
    s.visited.add(project.path);
    // toggleProject 是幂等 set（按 desired 强制设定），重复调用安全
    onToggleProject(project, s.desired);
  };

  const beginDirDrag = (dirPath: string, isSelected: boolean, e: React.MouseEvent) => {
    if (isInteractive(e.target)) return;
    e.preventDefault();
    const desired = !isSelected;
    onToggleDir(dirPath);
    dragRef.current = { kind: 'dir', desired, visited: new Set([dirPath]) };
  };

  const enterDir = (dirPath: string, isSelected: boolean) => {
    const s = dragRef.current;
    if (!s || s.kind !== 'dir') return;
    if (s.visited.has(dirPath)) return;
    s.visited.add(dirPath);
    // toggleDir 是真正 toggle，仅当当前态与目标不一致时才翻转
    if (isSelected !== s.desired) onToggleDir(dirPath);
  };

  if (cleanable.length === 0) {
    return (
      <div className="cleanup-empty muted">
        <div className="cleanup-empty-icon">✓</div>
        <p>{t.cleanEmptyState}</p>
      </div>
    );
  }

  return (
    <div className="cleanup-list">
      <div className="cleanup-summary muted">
        {cleanable.length} {t.cleanSummaryPrefix}{' '}
        <strong>{formatBytes(cleanable.reduce((s, p) => s + p.cleanableSize, 0))}</strong>
      </div>
      {cleanable.map((p) => (
        <CleanupRow
          key={p.path}
          project={p}
          selected={selected}
          t={t}
          onToggleDir={onToggleDir}
          onToggleProject={onToggleProject}
          onReveal={onReveal}
          onProjectMouseDown={beginProjectDrag}
          onProjectMouseEnter={enterProject}
          onDirMouseDown={beginDirDrag}
          onDirMouseEnter={enterDir}
        />
      ))}
    </div>
  );
}

interface RowProps {
  project: ProjectInfo;
  selected: Set<string>;
  t: Messages;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
  onProjectMouseDown: (p: ProjectInfo, allSelected: boolean, e: React.MouseEvent) => void;
  onProjectMouseEnter: (p: ProjectInfo) => void;
  onDirMouseDown: (dirPath: string, isSelected: boolean, e: React.MouseEvent) => void;
  onDirMouseEnter: (dirPath: string, isSelected: boolean) => void;
}

function CleanupRow({
  project,
  selected,
  t,
  onToggleDir,
  onToggleProject,
  onReveal,
  onProjectMouseDown,
  onProjectMouseEnter,
  onDirMouseDown,
  onDirMouseEnter,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const allSelected = project.cleanables.every((c) => selected.has(c.path));
  const someSelected = project.cleanables.some((c) => selected.has(c.path));

  return (
    <div className={`cleanup-row ${expanded ? 'expanded' : ''}`}>
      <div
        className="cleanup-head"
        onMouseDown={(e) => onProjectMouseDown(project, allSelected, e)}
        onMouseEnter={() => onProjectMouseEnter(project)}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = !allSelected && someSelected;
          }}
          onChange={(e) => onToggleProject(project, e.target.checked)}
          title={t.selectAllProject}
        />
        <button
          className="expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label={t.expandCollapse}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="cleanup-info">
          <span className="project-name">{project.name}</span>
          <span className="cleanup-path muted" title={project.path}>
            {shortenPath(project.path, 60)}
          </span>
        </div>
        <div className="cleanup-size">
          <strong>{formatBytes(project.cleanableSize)}</strong>
          <span className="muted">{project.cleanables.length} {t.dirs}</span>
        </div>
      </div>

      {expanded && (
        <ul className="cleanable-list">
          {project.cleanables.map((c) => {
            const isSelected = selected.has(c.path);
            return (
              <li
                key={c.path}
                onMouseDown={(e) => onDirMouseDown(c.path, isSelected, e)}
                onMouseEnter={() => onDirMouseEnter(c.path, isSelected)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleDir(c.path)}
                />
                <span className="cleanable-name">{c.name}</span>
                <span className="cleanable-hint muted">{c.hint}</span>
                <span className="cleanable-size">{formatBytes(c.size)}</span>
                <button className="link-btn" onClick={() => onReveal(c.path)}>
                  {t.reveal}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
