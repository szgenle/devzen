import { useMemo } from 'react';
import type { ProjectInfo, RemoteProvider } from '@shared/types';
import type { ViewMode } from '../App';
import { formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getCategoryDisplayName,
  getProjectCategoryId
} from '../utils/categories';
import { type TagStore, getProjectTags } from '../utils/tags';
import { getDefaultEditor } from '../utils/launchApps';
import type { Messages } from '../utils/i18n';

/**
 * 可点击的项目名，点击后用默认编辑器打开项目目录。
 * 事件不冒泡，避免触发外层的"打开详情"。
 */
function ProjectNameLink({
  project,
  t,
  onOpenWithEditor
}: {
  project: ProjectInfo;
  t: Messages;
  onOpenWithEditor: (p: ProjectInfo, app: string) => void;
}) {
  const editorApp = getDefaultEditor(project);
  const title = `${t.detailLaunchEditorPrefix} ${editorApp} ${t.detailLaunchEditorSuffix}`.trim();
  return (
    <span
      className="project-name project-name-link"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onOpenWithEditor(project, editorApp);
      }}
    >
      {project.name}
    </span>
  );
}

interface Props {
  projects: ProjectInfo[];
  categoryStore: CategoryStore;
  tagStore: TagStore;
  viewMode: ViewMode;
  t: Messages;
  onReveal: (path: string) => void;
  onSelectProject: (p: ProjectInfo) => void;
  onCompareDuplicates: (groupId: string) => void;
  /** 点击项目名时直接用编辑器打开（应用名由 launchApps 的项目级记忆决定） */
  onOpenWithEditor: (p: ProjectInfo, app: string) => void;
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

interface TagSubGroup {
  /** 标签名；null 表示"未标记"分组 */
  tagName: string | null;
  projects: ProjectInfo[];
}

interface Group {
  category: Category;
  projects: ProjectInfo[];
  /** 若该分类下有项目设置了标签，则按标签拆分出子分组 */
  tagSubGroups: TagSubGroup[] | null;
}

/**
 * 概览页：项目清单一目了然。
 * 只展示"你有哪些项目"相关信息：名称、描述、来源、生态、路径。
 * 不涉及清理操作（无 checkbox、无可清理大小）。
 */
export function OverviewList({
  projects,
  categoryStore,
  tagStore,
  viewMode,
  t,
  onReveal,
  onSelectProject,
  onCompareDuplicates,
  onOpenWithEditor
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
      // 按最近修改时间倒序
      list.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));

      // 检查该分类下是否有项目设置了标签
      const hasAnyTag = list.some((p) => getProjectTags(p.path, tagStore).length > 0);
      let tagSubGroups: TagSubGroup[] | null = null;
      if (hasAnyTag) {
        // 按标签分组：每个标签一个子组，无标签的归入"未标记"
        const tagMap = new Map<string, { tagName: string; projects: ProjectInfo[] }>();
        const untagged: ProjectInfo[] = [];
        for (const p of list) {
          const tags = getProjectTags(p.path, tagStore);
          if (tags.length === 0) {
            untagged.push(p);
          } else {
            for (const tag of tags) {
              if (!tagMap.has(tag.id)) tagMap.set(tag.id, { tagName: tag.name, projects: [] });
              tagMap.get(tag.id)!.projects.push(p);
            }
          }
        }
        tagSubGroups = [];
        for (const [, group] of tagMap) {
          tagSubGroups.push({ tagName: group.tagName, projects: group.projects });
        }
        if (untagged.length > 0) {
          tagSubGroups.push({ tagName: null, projects: untagged });
        }
      }

      result.push({ category: cat, projects: list, tagSubGroups });
    }
    return result;
  }, [projects, categoryStore, tagStore]);

  if (projects.length === 0) {
    return (
      <div className="overview-empty muted">
        {t.overviewEmpty}
      </div>
    );
  }

  const renderProjects = (list: ProjectInfo[]) =>
    viewMode === 'card' ? (
      <div className="overview-card-grid">
        {list.map((p) => (
          <OverviewCard
            key={p.path}
            project={p}
            t={t}
            onReveal={onReveal}
            onSelect={() => onSelectProject(p)}
            onCompareDuplicates={onCompareDuplicates}
            onOpenWithEditor={onOpenWithEditor}
          />
        ))}
      </div>
    ) : (
      <>
        {list.map((p) => (
          <OverviewRow
            key={p.path}
            project={p}
            t={t}
            onReveal={onReveal}
            onSelect={() => onSelectProject(p)}
            onCompareDuplicates={onCompareDuplicates}
            onOpenWithEditor={onOpenWithEditor}
          />
        ))}
      </>
    );

  return (
    <div className={`overview-list ${viewMode === 'card' ? 'overview-card-mode' : ''}`}>
      {groups.map((g) => (
        <section key={g.category.id} className="overview-group">
          <header className="overview-group-head">
            <span className="group-name">{getCategoryDisplayName(g.category, t)}</span>
            <span className="group-count">{g.projects.length} {t.overviewProjectCount}</span>
          </header>
          {g.tagSubGroups ? (
            g.tagSubGroups.map((sub) => (
              <div key={sub.tagName ?? '__untagged__'} className="overview-tag-subgroup">
                <div className="overview-tag-subgroup-head">
                  <span className="tag-subgroup-name">{sub.tagName ?? t.tagUntagged}</span>
                  <span className="tag-subgroup-count">{sub.projects.length}</span>
                </div>
                {renderProjects(sub.projects)}
              </div>
            ))
          ) : (
            renderProjects(g.projects)
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
  onOpenWithEditor: (p: ProjectInfo, app: string) => void;
}

function OverviewRow({ project, t, onReveal, onSelect, onCompareDuplicates, onOpenWithEditor }: RowProps) {
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
          <ProjectNameLink project={project} t={t} onOpenWithEditor={onOpenWithEditor} />
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

function OverviewCard({ project, t, onReveal, onSelect, onCompareDuplicates, onOpenWithEditor }: RowProps) {
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
        <ProjectNameLink project={project} t={t} onOpenWithEditor={onOpenWithEditor} />
      </div>
      <div className="overview-card-tags">
        <div className="overview-card-tags-left">
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
        <div className="overview-card-tags-right">
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
