import { useMemo } from 'react';
import type { ProjectInfo, ProjectSource } from '@shared/types';
import { formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getProjectCategoryId
} from '../utils/categories';

interface Props {
  projects: ProjectInfo[];
  categoryStore: CategoryStore;
  onReveal: (path: string) => void;
  onSelectProject: (p: ProjectInfo) => void;
}

const SOURCE_META: Record<ProjectSource, { label: string; title: string; cls: string }> = {
  github: { label: 'GitHub', title: '来自 GitHub，可重新 clone', cls: 'tag-source-github' },
  remote: { label: '远程仓库', title: '有远程备份', cls: 'tag-source-remote' },
  local: { label: '仅本地', title: '没有远程备份', cls: 'tag-source-local' }
};

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

interface Group {
  category: Category;
  projects: ProjectInfo[];
}

/**
 * 概览页：项目清单一目了然。
 * 只展示"你有哪些项目"相关信息：名称、描述、来源、生态、路径。
 * 不涉及清理操作（无 checkbox、无可清理大小）。
 */
export function OverviewList({ projects, categoryStore, onReveal, onSelectProject }: Props) {
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
      // 按最近修改时间倒序
      list.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
      result.push({ category: cat, projects: list });
    }
    return result;
  }, [projects, categoryStore]);

  if (projects.length === 0) {
    return (
      <div className="overview-empty muted">
        当前目录下没有识别到项目。可以试试在首页换个目录或重新扫描。
      </div>
    );
  }

  return (
    <div className="overview-list">
      {groups.map((g) => (
        <section key={g.category.id} className="overview-group">
          <header className="overview-group-head">
            <span className="group-name">{g.category.name}</span>
            <span className="group-count">{g.projects.length} 个项目</span>
          </header>
          {g.projects.map((p) => (
            <OverviewRow
              key={p.path}
              project={p}
              onReveal={onReveal}
              onSelect={() => onSelectProject(p)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  project: ProjectInfo;
  onReveal: (path: string) => void;
  onSelect: () => void;
}

function OverviewRow({ project, onReveal, onSelect }: RowProps) {
  const sourceMeta = SOURCE_META[project.source];

  return (
    <div className="overview-row" onClick={onSelect} title="查看详情 / 修改分类">
      <div className="overview-row-main">
        <div className="overview-name-row">
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
          <div className="overview-desc muted">{project.description}</div>
        )}
        <div className="overview-sub muted">
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
          {project.lastModified && (
            <span>· {formatRelative(project.lastModified)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
