import { useState } from 'react';
import type { ProjectInfo, ProjectSource } from '@shared/types';
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

const SOURCE_META: Record<ProjectSource, { label: string; title: string; cls: string }> = {
  github: {
    label: 'GitHub',
    title: '来自 GitHub，可重新 clone',
    cls: 'tag-source-github'
  },
  remote: {
    label: '远程仓库',
    title: '有远程备份（GitLab/Codeup 等）',
    cls: 'tag-source-remote'
  },
  local: {
    label: '仅本地',
    title: '没有远程备份，删了就没了',
    cls: 'tag-source-local'
  }
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
  const sourceMeta = SOURCE_META[project.source];

  if (project.cleanables.length === 0) {
    // 无可清理目录：不再整体灰化，保持与其他项目同等可见度
    return (
      <div className="project-row empty-row">
        <div className="project-head">
          <span className="cell-placeholder" aria-hidden />
          <span className="cell-placeholder" aria-hidden />
          <div className="project-info">
            <div className="project-name-row">
              <span className="project-name">{project.name}</span>
              <span className={`tag ${sourceMeta.cls}`} title={sourceMeta.title}>
                {sourceMeta.label}
              </span>
              {project.ecosystems.map((e) => (
                <span key={e} className={`tag tag-${e}`}>
                  {ECO_LABELS[e] ?? e}
                </span>
              ))}
            </div>
            {project.description && (
              <div className="project-desc" title={project.description}>
                {project.description}
              </div>
            )}
            <div className="project-sub">
              <span className="path" title={project.path} onClick={() => onReveal(project.path)}>
                {shortenPath(project.path, 70)}
              </span>
              <span className="muted">· {formatRelative(project.lastModified)}</span>
            </div>
          </div>
          <div className="project-size">
            <span className="clean-badge" title="未发现可清理目录">已整洁</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`project-row has-cleanable ${expanded ? 'expanded' : ''}`}>
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
            <span className="cleanable-dot" title="存在可清理目录" aria-hidden />
            <span className="project-name">{project.name}</span>
            <span className={`tag ${sourceMeta.cls}`} title={sourceMeta.title}>
              {sourceMeta.label}
            </span>
            {project.ecosystems.map((e) => (
              <span key={e} className={`tag tag-${e}`}>
                {ECO_LABELS[e] ?? e}
              </span>
            ))}
            {project.gitDirty && (
              <span className="tag tag-dirty" title="有未提交的修改">
                有修改
              </span>
            )}
          </div>
          {project.description && (
            <div className="project-desc muted" title={project.description}>
              {project.description}
            </div>
          )}
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
