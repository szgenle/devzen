import { useEffect, useState } from 'react';
import type { ProjectInfo, RemoteProvider } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getCategoryDisplayName,
  getProjectCategoryId
} from '../utils/categories';
import { type Tag, type TagStore, getAllTags, getProjectTags } from '../utils/tags';
import {
  COMMON_EDITORS,
  COMMON_TERMINALS,
  getDefaultEditor,
  getDefaultTerminal
} from '../utils/launchApps';
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
  /**
   * 刷新该项目的 git dirty 状态。面板打开时会自动调用一次，
   * 用户也可点 Git 状态行的刷新按钮手动触发。
   */
  onRefreshDirty: (project: ProjectInfo) => void;
  /** 用指定 macOS 应用打开项目目录（编辑器） */
  onOpenWithEditor: (project: ProjectInfo, app: string) => void;
  /** 用指定 macOS 应用打开项目目录（终端） */
  onOpenWithTerminal: (project: ProjectInfo, app: string) => void;
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
  onArchive,
  onRefreshDirty,
  onOpenWithEditor,
  onOpenWithTerminal
}: Props) {
  // 受控显隐：项目存在时打开，便于做退场动画
  const open = project != null;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  // 快速启动菜单：'editor' / 'terminal' / null
  const [launchMenu, setLaunchMenu] = useState<'editor' | 'terminal' | null>(null);
  // 刷新 dirty 状态的 loading，避免连击与表明“正在刷新”
  const [refreshingDirty, setRefreshingDirty] = useState(false);

  // 切换不同项目时收起新建态，避免输入残留
  useEffect(() => {
    setCreating(false);
    setNewName('');
    setCreatingTag(false);
    setNewTagName('');
    setLaunchMenu(null);
  }, [project?.path]);

  // 面板打开或切换到另一个项目时，自动拉一次最新的 git dirty 状态。
  // 这能涵盖最常见场景：用户在外部 commit 后点开该项目详情，状态能及时变干净。
  // 项目路径未变时不重复拉（避免与本组件外部状态变动报错重复触发）。
  useEffect(() => {
    if (!project) return;
    if (!project.isGitRepo) return;
    onRefreshDirty(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  const handleManualRefreshDirty = async () => {
    if (!project || refreshingDirty) return;
    setRefreshingDirty(true);
    try {
      onRefreshDirty(project);
    } finally {
      // 上层刷新是 fire-and-forget，这里快速复位loading，避免按钮闪烁
      setTimeout(() => setRefreshingDirty(false), 400);
    }
  };

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
            <span className="category-pill">{currentCategory ? getCategoryDisplayName(currentCategory, t) : t.detailUncategorized}</span>
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
                <dd className={project.gitDirty ? 'detail-warn detail-git-status' : 'detail-git-status'}>
                  <span>{project.gitDirty ? t.detailGitDirty : t.detailGitClean}</span>
                  <button
                    type="button"
                    className="detail-refresh-btn"
                    onClick={handleManualRefreshDirty}
                    disabled={refreshingDirty}
                    title={t.detailGitRefreshTitle}
                    aria-label={t.detailGitRefresh}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className={refreshingDirty ? 'spin' : ''}
                    >
                      <path
                        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.88M13.5 3v3h-3"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
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
          <div className="detail-label">{t.detailLaunch}</div>
          <div className="detail-launch-row">
            <LaunchControl
              kind="editor"
              currentApp={getDefaultEditor(project)}
              options={COMMON_EDITORS}
              menuOpen={launchMenu === 'editor'}
              t={t}
              onOpen={(app) => {
                setLaunchMenu(null);
                onOpenWithEditor(project, app);
              }}
              onToggleMenu={() =>
                setLaunchMenu(launchMenu === 'editor' ? null : 'editor')
              }
              onPickCustom={() => {
                const ans = window.prompt(
                  t.detailLaunchCustomEditorPrompt,
                  getDefaultEditor(project)
                );
                if (ans && ans.trim()) {
                  setLaunchMenu(null);
                  onOpenWithEditor(project, ans.trim());
                }
              }}
            />
            <LaunchControl
              kind="terminal"
              currentApp={getDefaultTerminal(project)}
              options={COMMON_TERMINALS}
              menuOpen={launchMenu === 'terminal'}
              t={t}
              onOpen={(app) => {
                setLaunchMenu(null);
                onOpenWithTerminal(project, app);
              }}
              onToggleMenu={() =>
                setLaunchMenu(launchMenu === 'terminal' ? null : 'terminal')
              }
              onPickCustom={() => {
                const ans = window.prompt(
                  t.detailLaunchCustomTerminalPrompt,
                  getDefaultTerminal(project)
                );
                if (ans && ans.trim()) {
                  setLaunchMenu(null);
                  onOpenWithTerminal(project, ans.trim());
                }
              }}
            />
          </div>
          <div className="muted detail-hint">{t.detailLaunchHint}</div>
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
  const displayName = getCategoryDisplayName(category, t);
  return (
    <span className={`category-chip ${active ? 'active' : ''}`}>
      <button className="category-chip-pick" onClick={onPick} title={t.detailSwitchCategory}>
        {displayName}
      </button>
      {onRemove && (
        <button
          className="category-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(t.detailDeleteCategoryConfirm.replace('{name}', displayName))) {
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

/**
 * 快速启动控件：主按钮（直接用当前应用打开） + ▾ 切换按钮（弹出可选应用列表）。
 * 应用选择按项目记忆，不在全局首选项中固定。
 */
function LaunchControl({
  kind,
  currentApp,
  options,
  menuOpen,
  t,
  onOpen,
  onToggleMenu,
  onPickCustom
}: {
  kind: 'editor' | 'terminal';
  currentApp: string;
  options: readonly string[];
  menuOpen: boolean;
  t: Messages;
  onOpen: (app: string) => void;
  onToggleMenu: () => void;
  onPickCustom: () => void;
}) {
  const prefix = kind === 'editor' ? t.detailLaunchEditorPrefix : t.detailLaunchTerminalPrefix;
  const suffix = kind === 'editor' ? t.detailLaunchEditorSuffix : t.detailLaunchTerminalSuffix;
  const pickLabel = kind === 'editor' ? t.detailLaunchPickEditor : t.detailLaunchPickTerminal;

  return (
    <div className="detail-launch-control">
      <div className="detail-launch-group">
        <button
          className="detail-launch-btn detail-launch-btn-primary"
          onClick={() => onOpen(currentApp)}
          title={`${prefix} ${currentApp} ${suffix}`.trim()}
        >
          <span className="detail-launch-prefix">{prefix}</span>
          <span className="detail-launch-app-name"> {currentApp} </span>
          {suffix && <span className="detail-launch-prefix">{suffix}</span>}
        </button>
        <button
          className="detail-launch-btn detail-launch-btn-toggle"
          onClick={onToggleMenu}
          title={t.detailLaunchSwitch}
          aria-expanded={menuOpen}
        >
          ▾
        </button>
      </div>
      {menuOpen && (
        <div className="detail-launch-menu" role="menu">
          <div className="detail-launch-menu-head muted">{pickLabel}</div>
          {options.map((app) => (
            <button
              key={app}
              role="menuitem"
              className={`detail-launch-menu-item ${app === currentApp ? 'active' : ''}`}
              onClick={() => onOpen(app)}
            >
              {app}
            </button>
          ))}
          <div className="detail-launch-menu-sep" />
          <button
            role="menuitem"
            className="detail-launch-menu-item detail-launch-menu-custom"
            onClick={onPickCustom}
          >
            {t.detailLaunchCustomEditor}
          </button>
        </div>
      )}
    </div>
  );
}
