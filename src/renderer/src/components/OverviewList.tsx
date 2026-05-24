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
import type { Messages } from '../utils/i18n';

interface Props {
  projects: ProjectInfo[];
  categoryStore: CategoryStore;
  viewMode: ViewMode;
  t: Messages;
  onReveal: (path: string) => void;
  onSelectProject: (p: ProjectInfo) => void;
  onCompareDuplicates: (groupId: string) => void;
}

/** 每个远程提供商的 label + 对应的 i18n title key */
const PROVIDER_KEYS: Record<RemoteProvider, { label: string; titleKey: string; cls: string }> = {
  github: { label: 'GitHub', titleKey: 'providerGithub', cls: 'tag-source-github' },
  gitlab: { label: 'GitLab', titleKey: 'providerGitlab', cls: 'tag-source-remote' },
  bitbucket: { label: 'Bitbucket', titleKey: 'providerBitbucket', cls: 'tag-source-remote' },
  gitee: { label: 'Gitee', titleKey: 'providerGitee', cls: 'tag-source-remote' },
  codeup: { label: 'Codeup', titleKey: 'providerCodeup', cls: 'tag-source-remote' },
  coding: { label: 'Coding', titleKey: 'providerCoding', cls: 'tag-source-remote' },
  unknown: { label: '', titleKey: 'providerUnknown', cls: 'tag-source-remote' }
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
  android: 'Android'
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
export function OverviewList({ projects, categoryStore, viewMode, t, onReveal, onSelectProject, onCompareDuplicates }: Props) {
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
        {t.overviewEmpty}
      </div>
    );
  }

  return (
    <div className={`overview-list ${viewMode === 'card' ? 'overview-card-mode' : ''}`}>
      {groups.map((g) => (
        <section key={g.category.id} className="overview-group">
          <header className="overview-group-head">
            <span className="group-name">{g.category.name}</span>
            <span className="group-count">{g.projects.length} {t.overviewProjectCount}</span>
          </header>
          {viewMode === 'card' ? (
            <div className="overview-card-grid">
              {g.projects.map((p) => (
                <OverviewCard
                  key={p.path}
                  project={p}
                  t={t}
                  onReveal={onReveal}
                  onSelect={() => onSelectProject(p)}
                  onCompareDuplicates={onCompareDuplicates}
                />
              ))}
            </div>
          ) : (
            g.projects.map((p) => (
              <OverviewRow
                key={p.path}
                project={p}
                t={t}
                onReveal={onReveal}
                onSelect={() => onSelectProject(p)}
                onCompareDuplicates={onCompareDuplicates}
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
  t: Messages;
  onReveal: (path: string) => void;
  onSelect: () => void;
  onCompareDuplicates: (groupId: string) => void;
}

function OverviewRow({ project, t, onReveal, onSelect, onCompareDuplicates }: RowProps) {
  const sourceTags =
    project.remoteProviders.length > 0
      ? project.remoteProviders.map((p) => {
          const meta = PROVIDER_KEYS[p];
          return { label: meta.label || t.providerUnknownLabel, title: t[meta.titleKey], cls: meta.cls };
        })
      : [{ label: t.localOnly, title: t.localOnlyTitle, cls: 'tag-source-local' }];

  const dupGroup = project.duplicateGroup;

  return (
    <div className="overview-row" onClick={onSelect} title={t.overviewViewDetail}>
      <div className="overview-row-main">
        <div className="overview-name-row">
          <span className="project-name">{project.name}</span>
          {dupGroup && (
            <span
              className="tag tag-duplicate"
              title={t.duplicateBadgeTitle.replace('{count}', String(dupGroup.members.length))}
              onClick={(e) => {
                e.stopPropagation();
                onCompareDuplicates(dupGroup.groupId);
              }}
            >
              {t.duplicateBadge.replace('{count}', String(dupGroup.members.length))}
            </span>
          )}
          {sourceTags.map((meta) => (
            <span key={meta.label} className={`tag ${meta.cls}`} title={meta.title}>
              {meta.label}
            </span>
          ))}
          {project.ecosystems.map((e) => (
            <span key={e} className={`tag tag-${e}`}>
              {ECO_LABELS[e] ?? (e === 'unknown' ? t.ecoUnknown : e)}
            </span>
          ))}
          {project.gitDirty && (
            <span className="tag tag-dirty" title={t.overviewDirtyTitle}>
              {t.overviewDirty}
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
            <span>· {formatRelative(project.lastModified, t._lang as 'zh' | 'en')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ project, t, onReveal, onSelect, onCompareDuplicates }: RowProps) {
  const sourceTags =
    project.remoteProviders.length > 0
      ? project.remoteProviders.map((p) => {
          const meta = PROVIDER_KEYS[p];
          return { label: meta.label || t.providerUnknownLabel, title: t[meta.titleKey], cls: meta.cls };
        })
      : [{ label: t.localOnly, title: t.localOnlyTitle, cls: 'tag-source-local' }];

  const dupGroup = project.duplicateGroup;

  return (
    <div className="overview-card" onClick={onSelect} title={t.overviewViewDetail}>
      <div className="overview-card-header">
        <span className="project-name">{project.name}</span>
        {dupGroup && (
          <span
            className="tag tag-duplicate"
            title={t.duplicateBadgeTitle.replace('{count}', String(dupGroup.members.length))}
            onClick={(e) => {
              e.stopPropagation();
              onCompareDuplicates(dupGroup.groupId);
            }}
          >
            {t.duplicateBadge.replace('{count}', String(dupGroup.members.length))}
          </span>
        )}
        {sourceTags.map((meta) => (
          <span key={meta.label} className={`tag ${meta.cls}`} title={meta.title}>
            {meta.label}
          </span>
        ))}
      </div>
      <div className="overview-card-tags">
        {project.ecosystems.map((e) => (
          <span key={e} className={`tag tag-${e}`}>
            {ECO_LABELS[e] ?? (e === 'unknown' ? t.ecoUnknown : e)}
          </span>
        ))}
        {project.gitDirty && (
          <span className="tag tag-dirty" title={t.overviewDirtyTitle}>
            {t.overviewDirty}
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
          <span className="overview-card-time">{formatRelative(project.lastModified, t._lang as 'zh' | 'en')}</span>
        )}
      </div>
    </div>
  );
}
