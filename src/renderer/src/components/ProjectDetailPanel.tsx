import { useEffect, useState } from 'react';
import type { ProjectInfo, RemoteProvider } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getProjectCategoryId
} from '../utils/categories';
import { type Tag, type TagStore, getAllTags, getProjectTags } from '../utils/tags';
import type { Messages } from '../utils/i18n';

interface Props {
  project: ProjectInfo | null;
  categoryStore: CategoryStore;
  tagStore: TagStore;
  t: Messages;
  onClose: () => void;
  onAssignCategory: (project: ProjectInfo, categoryId: string) => void;
  onUnassignCategory: (project: ProjectInfo) => void;
  onAddCategory: (name: string) => Category;
  onRemoveCategory: (id: string) => void;
  onAddTagToProject: (project: ProjectInfo, tagId: string) => void;
  onRemoveTagFromProject: (project: ProjectInfo, tagId: string) => void;
  onCreateTag: (name: string) => Tag;
  onDeleteTag: (id: string) => void;
  onReveal: (path: string) => void;
  /** 触发归档流程；source === 'local' 时上层应不触发，仅作兜底 */
  onArchive: (project: ProjectInfo) => void;
}

/** 每个远程提供商的 i18n key 映射 */
const PROVIDER_KEYS: Record<RemoteProvider, { label: string; titleKey: string }> = {
  github: { label: 'GitHub', titleKey: 'providerGithub' },
  gitlab: { label: 'GitLab', titleKey: 'providerGitlab' },
  bitbucket: { label: 'Bitbucket', titleKey: 'providerBitbucket' },
  gitee: { label: 'Gitee', titleKey: 'providerGitee' },
  codeup: { label: 'Codeup', titleKey: 'providerCodeup' },
  coding: { label: 'Coding', titleKey: 'providerCoding' },
  unknown: { label: '', titleKey: 'providerUnknown' }
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

/**
 * 项目详情侧边栏。
 *
 * 承担两个职责：
 *  1. 展示该项目的完整元信息（路径 / 来源 / 生态 / 描述 / 活跃度等）。
 *  2. 提供分类管理：切换分类、新建分类、移除自定义分类、清除手动分类回到自动推断。
 *
 * 清理操作仍走外部主列表的复选框 + 底部 ActionBar，保持原有清理流程不被打散。
 */
export function ProjectDetailPanel({
  project,
  categoryStore,
  tagStore,
  t,
  onClose,
  onAssignCategory,
  onUnassignCategory,
  onAddCategory,
  onRemoveCategory,
  onAddTagToProject,
  onRemoveTagFromProject,
  onCreateTag,
  onDeleteTag,
  onReveal,
  onArchive
}: Props) {
  // 受控显隐：项目存在时打开，便于做退场动画
  const open = project != null;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // 切换不同项目时收起新建态，避免输入残留
  useEffect(() => {
    setCreating(false);
    setNewName('');
    setCreatingTag(false);
    setNewTagName('');
  }, [project?.path]);

  // 关闭时按 ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!project) return null;

  const allCategories = getAllCategories(categoryStore);
  const currentCategoryId = getProjectCategoryId(project, categoryStore);
  const currentCategory = allCategories.find((c) => c.id === currentCategoryId) ?? null;
  const isManual = project.path in categoryStore.assignments;

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    const cat = onAddCategory(name);
    onAssignCategory(project, cat.id);
    setNewName('');
    setCreating(false);
  };

  return (
    <>
      <div className="detail-mask" onClick={onClose} aria-hidden />
      <aside className="detail-panel" role="dialog" aria-label={t.detailProjectInfo}>
        <header className="detail-head">
          <div className="detail-title-row">
            <h2 className="detail-title" title={project.name}>
              {project.name}
            </h2>
            <button
              className="detail-close"
              onClick={onClose}
              aria-label={t.close}
              title={`${t.close} (Esc)`}
            >
              ×
            </button>
          </div>
          {project.description && (
            <p className="detail-desc" title={project.description}>
              {project.description}
            </p>
          )}
        </header>

        <section className="detail-section">
          <div className="detail-label">{t.detailCategory}</div>
          <div className="category-current">
            <span className="category-pill">{currentCategory?.name ?? t.detailUncategorized}</span>
            {isManual ? (
              <button
                className="link-btn"
                onClick={() => onUnassignCategory(project)}
                title={t.detailClearCategoryTitle}
              >
                {t.detailClearCategory}
              </button>
            ) : (
              <span className="muted detail-hint">{t.detailAutoInferred}</span>
            )}
          </div>
          <div className="category-options">
            {allCategories.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                active={c.id === currentCategoryId}
                t={t}
                onPick={() => onAssignCategory(project, c.id)}
                onRemove={!c.builtin ? () => onRemoveCategory(c.id) : undefined}
              />
            ))}
            {creating ? (
              <form
                className="category-new-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNew();
                }}
              >
                <input
                  autoFocus
                  className="category-new-input"
                  value={newName}
                  placeholder={t.detailCategoryPlaceholder}
                  maxLength={20}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => {
                    if (!newName.trim()) setCreating(false);
                  }}
                />
                <button type="submit" className="primary" disabled={!newName.trim()}>
                  {t.add}
                </button>
              </form>
            ) : (
              <button
                className="category-new-btn"
                onClick={() => setCreating(true)}
                title={t.detailNewCategoryTitle}
              >
                {t.detailNewCategory}
              </button>
            )}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-label">{t.tagSectionTitle}</div>
          <div className="tag-list">
            {(() => {
              const projectTags = getProjectTags(project.path, tagStore);
              const allAvailable = getAllTags(tagStore);
              const projectTagIds = new Set(projectTags.map((tg) => tg.id));
              const unassigned = allAvailable.filter((tg) => !projectTagIds.has(tg.id));
              return (
                <>
                  {projectTags.length === 0 && !creatingTag && (
                    <span className="muted tag-empty">{t.tagEmpty}</span>
                  )}
                  {projectTags.map((tg) => (
                    <span key={tg.id} className="tag-pill">
                      <span className="tag-pill-name">{tg.name}</span>
                      <button
                        className="tag-pill-remove"
                        onClick={() => onRemoveTagFromProject(project, tg.id)}
                        title={t.remove}
                        aria-label={t.remove}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {unassigned.length > 0 && !creatingTag && (
                    <select
                      className="tag-add-select"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) onAddTagToProject(project, e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        + {t.tagAdd}
                      </option>
                      {unassigned.map((tg) => (
                        <option key={tg.id} value={tg.id}>
                          {tg.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {creatingTag ? (
                    <form
                      className="tag-new-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = newTagName.trim();
                        if (!name) return;
                        const tag = onCreateTag(name);
                        onAddTagToProject(project, tag.id);
                        setNewTagName('');
                        setCreatingTag(false);
                      }}
                    >
                      <input
                        autoFocus
                        className="tag-new-input"
                        value={newTagName}
                        placeholder={t.tagPlaceholder}
                        maxLength={20}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onBlur={() => {
                          if (!newTagName.trim()) setCreatingTag(false);
                        }}
                      />
                      <button type="submit" className="primary" disabled={!newTagName.trim()}>
                        {t.add}
                      </button>
                    </form>
                  ) : (
                    <button
                      className="tag-new-btn"
                      onClick={() => setCreatingTag(true)}
                      title={t.tagCreate}
                    >
                      {t.tagCreate}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-label">{t.detailMeta}</div>
          <dl className="detail-meta">
            <dt>{t.detailSource}</dt>
            <dd>
              {project.remoteProviders.length > 0
                ? project.remoteProviders.map((p) => {
                    const meta = PROVIDER_KEYS[p];
                    return (
                      <span key={p} className="detail-provider" title={t[meta.titleKey]}>
                        {meta.label || t.providerUnknownLabel}
                      </span>
                    );
                  })
                : <span title={t.localOnlyDetailTitle}>{t.localOnly}</span>
              }
              {project.gitRemote && (
                <>
                  <span className="muted"> · </span>
                  <span className="detail-remote" title={project.gitRemote}>
                    {project.gitRemote}
                  </span>
                </>
              )}
            </dd>

            <dt>{t.detailPath}</dt>
            <dd>
              <span
                className="detail-path"
                title={project.path}
                onClick={() => onReveal(project.path)}
              >
                {shortenPath(project.path, 64)}
              </span>
            </dd>

            <dt>{t.detailEcosystem}</dt>
            <dd>
              {project.ecosystems.length === 0
                ? '—'
                : project.ecosystems.map((e) => ECO_LABELS[e] ?? (e === 'unknown' ? t.ecoUnknown : e)).join(' · ')}
            </dd>

            <dt>{t.detailLastModified}</dt>
            <dd>{formatRelative(project.lastModified, t._lang as 'zh' | 'en')}</dd>

            {project.gitDirty != null && (
              <>
                <dt>{t.detailGitStatus}</dt>
                <dd className={project.gitDirty ? 'detail-warn' : ''}>
                  {project.gitDirty ? t.detailGitDirty : t.detailGitClean}
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className="detail-section">
          <div className="detail-label">
            {t.detailCleanables}{' '}
            {project.cleanables.length > 0 && (
              <span className="muted">
                {t.detailTotal} {formatBytes(project.cleanableSize)}
              </span>
            )}
          </div>
          {project.cleanables.length === 0 ? (
            <div className="muted detail-empty">{t.detailNoCleanables}</div>
          ) : (
            <ul className="detail-cleanables">
              {project.cleanables.map((c) => (
                <li key={c.path}>
                  <span className="cleanable-name">{c.name}</span>
                  <span className="cleanable-hint muted">{c.hint}</span>
                  <span className="cleanable-size">{formatBytes(c.size)}</span>
                  <button className="link-btn" onClick={() => onReveal(c.path)}>
                    {t.reveal}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="muted detail-hint">
            {t.detailCleanHint}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-label">{t.archiveBtn}</div>
          {project.source === 'local' ? (
            <div className="muted detail-hint">{t.archiveBtnLocal}</div>
          ) : (
            <>
              <button
                className="danger detail-archive-btn"
                onClick={() => onArchive(project)}
                title={t.archiveBtnTitle}
              >
                {t.archiveBtn}
              </button>
              <div className="muted detail-hint">{t.archiveDescClean}</div>
            </>
          )}
        </section>
      </aside>
    </>
  );
}

interface ChipProps {
  category: Category;
  active: boolean;
  t: Messages;
  onPick: () => void;
  /** 仅自定义分类传入，触发删除 */
  onRemove?: () => void;
}

function CategoryChip({ category, active, t, onPick, onRemove }: ChipProps) {
  return (
    <span className={`category-chip ${active ? 'active' : ''}`}>
      <button className="category-chip-pick" onClick={onPick} title={t.detailSwitchCategory}>
        {category.name}
      </button>
      {onRemove && (
        <button
          className="category-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(t.detailDeleteCategoryConfirm.replace('{name}', category.name))) {
              onRemove();
            }
          }}
          title={t.detailDeleteCategoryTitle}
          aria-label={t.remove}
        >
          ×
        </button>
      )}
    </span>
  );
}
