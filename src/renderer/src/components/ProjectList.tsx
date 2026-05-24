import { useMemo, useState } from 'react';
import type { ProjectInfo, ProjectSource } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getProjectCategoryId
} from '../utils/categories';

interface Props {
  projects: ProjectInfo[];
  selected: Set<string>;
  categoryStore: CategoryStore;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
  /** 点击项目主体，打开详情侧边栏 */
  onSelectProject: (p: ProjectInfo) => void;
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

interface Group {
  category: Category;
  projects: ProjectInfo[];
  totalCleanable: number;
}

/**
 * 项目列表（分组视图）。
 * 按主分类（用户手动 > 自动推断）将项目分组展示，
 * 每组组头给出汇总信息，组内仍按可清理大小倒序，
 * 兼顾"看全貌"与"清理"两类任务。
 */
export function ProjectList({
  projects,
  selected,
  categoryStore,
  onToggleDir,
  onToggleProject,
  onReveal,
  onSelectProject
}: Props) {
  const groups = useMemo<Group[]>(() => {
    const all = getAllCategories(categoryStore);
    const map = new Map<string, ProjectInfo[]>();
    for (const p of projects) {
      const cid = getProjectCategoryId(p, categoryStore);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(p);
    }
    const result: Group[] = [];
    for (const cat of all) {
      const list = map.get(cat.id);
      if (!list || list.length === 0) continue;
      list.sort((a, b) => b.cleanableSize - a.cleanableSize);
      const totalCleanable = list.reduce((s, p) => s + p.cleanableSize, 0);
      result.push({ category: cat, projects: list, totalCleanable });
    }
    // 兜底：处理 store 中已不存在但 inferCategoryId 也覆盖不到的边缘情况
    return result;
  }, [projects, categoryStore]);

  // 折叠状态：默认全部展开；用户折叠后状态保存在组件内（不持久化，简化交互）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (projects.length === 0) {
    return (
      <div className="project-list-empty muted">
        当前目录下没有识别到项目。可以试试在首页换个目录或重新扫描。
      </div>
    );
  }

  return (
    <div className="project-list">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.category.id);
        return (
          <section key={g.category.id} className="project-group">
            <header
              className={`group-head ${isCollapsed ? 'collapsed' : ''}`}
              onClick={() => toggleGroup(g.category.id)}
            >
              <span className="group-toggle" aria-hidden>
                {isCollapsed ? '▸' : '▾'}
              </span>
              <span className="group-name">{g.category.name}</span>
              <span className="group-count">{g.projects.length} 个项目</span>
              <span className="group-cleanable">
                {g.totalCleanable > 0 ? (
                  <>
                    可清理 <strong>{formatBytes(g.totalCleanable)}</strong>
                  </>
                ) : (
                  <span className="muted">已整洁</span>
                )}
              </span>
            </header>
            {!isCollapsed &&
              g.projects.map((p) => (
                <ProjectRow
                  key={p.path}
                  project={p}
                  selected={selected}
                  onToggleDir={onToggleDir}
                  onToggleProject={onToggleProject}
                  onReveal={onReveal}
                  onSelectProject={onSelectProject}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

interface RowProps {
  project: ProjectInfo;
  selected: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onToggleProject: (p: ProjectInfo, allOn: boolean) => void;
  onReveal: (path: string) => void;
  onSelectProject: (p: ProjectInfo) => void;
}

function ProjectRow({
  project,
  selected,
  onToggleDir,
  onToggleProject,
  onReveal,
  onSelectProject
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const allSelected =
    project.cleanables.length > 0 && project.cleanables.every((c) => selected.has(c.path));
  const someSelected = project.cleanables.some((c) => selected.has(c.path));
  const sourceMeta = SOURCE_META[project.source];
  const hasCleanable = project.cleanables.length > 0;

  return (
    <div className={`project-row ${hasCleanable ? 'has-cleanable' : 'empty-row'} ${expanded ? 'expanded' : ''}`}>
      <div className="project-head">
        {hasCleanable ? (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={(e) => onToggleProject(project, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            title="勾选该项目下全部可清理目录"
          />
        ) : (
          <span className="cell-placeholder" aria-hidden />
        )}
        {hasCleanable ? (
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label="展开/收起"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="cell-placeholder" aria-hidden />
        )}
        <div
          className="project-info clickable"
          onClick={() => onSelectProject(project)}
          title="查看项目详情 / 修改分类"
        >
          <div className="project-name-row">
            {hasCleanable && (
              <span className="cleanable-dot" title="存在可清理目录" aria-hidden />
            )}
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
            <span
              className="path"
              title={project.path}
              onClick={(e) => {
                e.stopPropagation();
                onReveal(project.path);
              }}
            >
              {shortenPath(project.path, 70)}
            </span>
            <span className="muted">· {formatRelative(project.lastModified)}</span>
          </div>
        </div>
        <div className="project-size">
          {hasCleanable ? (
            <>
              <strong>{formatBytes(project.cleanableSize)}</strong>
              <span className="muted">{project.cleanables.length} 个目录</span>
            </>
          ) : (
            <span className="clean-badge" title="未发现可清理目录">
              已整洁
            </span>
          )}
        </div>
      </div>

      {expanded && hasCleanable && (
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
