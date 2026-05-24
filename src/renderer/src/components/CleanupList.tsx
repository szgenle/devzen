import { useState } from 'react';
import type { ProjectInfo } from '@shared/types';
import { formatBytes, shortenPath } from '../utils/format';

interface Props {
  projects: ProjectInfo[];
  selected: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
}

/**
 * 清理页：专注于"可以安全清理什么"。
 * 仅展示有可清理目录的项目，信息精简为项目名 + 可清理大小 + 展开详情。
 * 无描述、无来源标签、无生态标签（这些在概览页看）。
 */
export function CleanupList({ projects, selected, onToggleDir, onToggleProject, onReveal }: Props) {
  // 只展示有可清理内容的项目
  const cleanable = projects.filter((p) => p.cleanables.length > 0);

  if (cleanable.length === 0) {
    return (
      <div className="cleanup-empty muted">
        <div className="cleanup-empty-icon">✓</div>
        <p>所有项目都很整洁，没有需要清理的构建产物。</p>
      </div>
    );
  }

  return (
    <div className="cleanup-list">
      <div className="cleanup-summary muted">
        {cleanable.length} 个项目有可清理内容 · 共{' '}
        <strong>{formatBytes(cleanable.reduce((s, p) => s + p.cleanableSize, 0))}</strong>
      </div>
      {cleanable.map((p) => (
        <CleanupRow
          key={p.path}
          project={p}
          selected={selected}
          onToggleDir={onToggleDir}
          onToggleProject={onToggleProject}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}

interface RowProps {
  project: ProjectInfo;
  selected: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
}

function CleanupRow({ project, selected, onToggleDir, onToggleProject, onReveal }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const allSelected = project.cleanables.every((c) => selected.has(c.path));
  const someSelected = project.cleanables.some((c) => selected.has(c.path));

  return (
    <div className={`cleanup-row ${expanded ? 'expanded' : ''}`}>
      <div className="cleanup-head">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = !allSelected && someSelected;
          }}
          onChange={(e) => onToggleProject(project, e.target.checked)}
          title="全选该项目下可清理目录"
        />
        <button
          className="expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label="展开/收起"
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
          <span className="muted">{project.cleanables.length} 个目录</span>
        </div>
      </div>

      {expanded && (
        <ul className="cleanable-list">
          {project.cleanables.map((c) => (
            <li key={c.path}>
              <input
                type="checkbox"
                checked={selected.has(c.path)}
                onChange={() => onToggleDir(c.path)}
              />
              <span className="cleanable-name">{c.name}</span>
              <span className="cleanable-hint muted">{c.hint}</span>
              <span className="cleanable-size">{formatBytes(c.size)}</span>
              <button className="link-btn" onClick={() => onReveal(c.path)}>
                定位
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
