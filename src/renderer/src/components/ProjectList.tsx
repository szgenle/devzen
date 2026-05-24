import { useState } from 'react';
import type { ProjectInfo } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';

interface Props {
  projects: ProjectInfo[];
  selected: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
}

const ECO_LABELS: Record<string, string> = {
  node: 'Node',
  rust: 'Rust',
  go: 'Go',
  python: 'Python',
  'java-maven': 'Maven',
  'java-gradle': 'Gradle',
  'apple-xcode': 'Xcode',
  'apple-spm': 'SwiftPM',
  unknown: '未知'
};

export function ProjectList({
  projects,
  selected,
  onToggleDir,
  onToggleProject,
  onReveal
}: Props) {
  return (
    <div className="project-list">
      {projects.map((p) => (
        <ProjectRow
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

function ProjectRow({ project, selected, onToggleDir, onToggleProject, onReveal }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const allSelected =
    project.cleanables.length > 0 && project.cleanables.every((c) => selected.has(c.path));
  const someSelected = project.cleanables.some((c) => selected.has(c.path));

  if (project.cleanables.length === 0) {
    // 无可清理目录的项目，仍然显示但弱化
    return (
      <div className="project-row empty-row">
        <div className="project-head">
          <span className="project-name muted">{project.name}</span>
          <span className="project-meta muted">
            {project.ecosystems.map((e) => ECO_LABELS[e] ?? e).join(' · ')} · 无可清理目录
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`project-row ${expanded ? 'expanded' : ''}`}>
      <div className="project-head">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = !allSelected && someSelected;
          }}
          onChange={(e) => onToggleProject(project, e.target.checked)}
        />
        <button
          className="expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label="展开/收起"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="project-info">
          <div className="project-name-row">
            <span className="project-name">{project.name}</span>
            {project.ecosystems.map((e) => (
              <span key={e} className={`tag tag-${e}`}>
                {ECO_LABELS[e] ?? e}
              </span>
            ))}
            {project.gitRemote && <span className="tag tag-git">git</span>}
          </div>
          <div className="project-sub">
            <span className="path" title={project.path} onClick={() => onReveal(project.path)}>
              {shortenPath(project.path, 70)}
            </span>
            <span className="muted">· {formatRelative(project.lastModified)}</span>
          </div>
        </div>
        <div className="project-size">
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
