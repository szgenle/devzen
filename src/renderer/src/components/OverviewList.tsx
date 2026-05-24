import { useMemo } from 'react';
import type { ProjectInfo, RemoteProvider } from '@shared/types';
import type { ViewMode } from '../App';
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
  viewMode: ViewMode;
  onReveal: (path: string) => void;
  onSelectProject: (p: ProjectInfo) => void;
}

/** 每个远程提供商的显示信息 */
const PROVIDER_META: Record<RemoteProvider, { label: string; title: string; cls: string }> = {
  github: { label: 'GitHub', title: '来自 GitHub，可重新 clone', cls: 'tag-source-github' },
  gitlab: { label: 'GitLab', title: '来自 GitLab，可重新 clone', cls: 'tag-source-remote' },
  bitbucket: { label: 'Bitbucket', title: '来自 Bitbucket，可重新 clone', cls: 'tag-source-remote' },
  gitee: { label: 'Gitee', title: '来自 Gitee，可重新 clone', cls: 'tag-source-remote' },
  codeup: { label: 'Codeup', title: '来自阿里云 Codeup，可重新 clone', cls: 'tag-source-remote' },
  coding: { label: 'Coding', title: '来自腾讯云 Coding，可重新 clone', cls: 'tag-source-remote' },
  unknown: { label: '远程仓库', title: '有远程备份', cls: 'tag-source-remote' }
};

/** 仅本地项目的兜底标签 */
const LOCAL_META = { label: '仅本地', title: '没有远程备份', cls: 'tag-source-local' };

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
export function OverviewList({ projects, categoryStore, viewMode, onReveal, onSelectProject }: Props) {
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
    <div className={`overview-list ${viewMode === 'card' ? 'overview-card-mode' : ''}`}>
      {groups.map((g) => (
        <section key={g.category.id} className="overview-group">
          <header className="overview-group-head">
            <span className="group-name">{g.category.name}</span>
            <span className="group-count">{g.projects.length} 个项目</span>
          </header>
          {viewMode === 'card' ? (
            <div className="overview-card-grid">
              {g.projects.map((p) => (
                <OverviewCard
                  key={p.path}
                  project={p}
                  onReveal={onReveal}
                  onSelect={() => onSelectProject(p)}
                />
              ))}
            </div>
          ) : (
            g.projects.map((p) => (
              <OverviewRow
                key={p.path}
                project={p}
                onReveal={onReveal}
                onSelect={() => onSelectProject(p)}
              />
            ))
          )}
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
  const sourceTags =
    project.remoteProviders.length > 0
      ? project.remoteProviders.map((p) => PROVIDER_META[p])
      : [LOCAL_META];

  return (
    <div className="overview-row" onClick={onSelect} title="查看详情 / 修改分类">
      <div className="overview-row-main">
        <div className="overview-name-row">
          <span className="project-name">{project.name}</span>
          {sourceTags.map((meta) => (
            <span key={meta.label} className={`tag ${meta.cls}`} title={meta.title}>
              {meta.label}
            </span>
          ))}
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

function OverviewCard({ project, onReveal, onSelect }: RowProps) {
  const sourceTags =
    project.remoteProviders.length > 0
      ? project.remoteProviders.map((p) => PROVIDER_META[p])
      : [LOCAL_META];

  return (
    <div className="overview-card" onClick={onSelect} title="查看详情 / 修改分类">
      <div className="overview-card-header">
        <span className="project-name">{project.name}</span>
        {sourceTags.map((meta) => (
          <span key={meta.label} className={`tag ${meta.cls}`} title={meta.title}>
            {meta.label}
          </span>
        ))}
      </div>
      <div className="overview-card-tags">
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
        <div className="overview-card-desc muted">{project.description}</div>
      )}
      <div className="overview-card-footer muted">
        <span
          className="path"
          title={project.path}
          onClick={(e) => {
            e.stopPropagation();
            onReveal(project.path);
          }}
        >
          {shortenPath(project.path, 40)}
        </span>
        {project.lastModified && (
          <span className="overview-card-time">{formatRelative(project.lastModified)}</span>
        )}
      </div>
    </div>
  );
}
