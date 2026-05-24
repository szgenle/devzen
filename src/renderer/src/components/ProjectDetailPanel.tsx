import { useEffect, useState } from 'react';
import type { ProjectInfo, ProjectSource } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getProjectCategoryId
} from '../utils/categories';

interface Props {
  project: ProjectInfo | null;
  categoryStore: CategoryStore;
  onClose: () => void;
  onAssignCategory: (project: ProjectInfo, categoryId: string) => void;
  onUnassignCategory: (project: ProjectInfo) => void;
  onAddCategory: (name: string) => Category;
  onRemoveCategory: (id: string) => void;
  onReveal: (path: string) => void;
}

const SOURCE_META: Record<ProjectSource, { label: string; title: string }> = {
  github: { label: 'GitHub', title: '来自 GitHub，可重新 clone' },
  remote: { label: '远程仓库', title: '有远程备份（GitLab/Codeup 等）' },
  local: { label: '仅本地', title: '没有远程备份，删了就没了' }
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
  onClose,
  onAssignCategory,
  onUnassignCategory,
  onAddCategory,
  onRemoveCategory,
  onReveal
}: Props) {
  // 受控显隐：项目存在时打开，便于做退场动画
  const open = project != null;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // 切换不同项目时收起新建态，避免输入残留
  useEffect(() => {
    setCreating(false);
    setNewName('');
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
      <aside className="detail-panel" role="dialog" aria-label="项目详情">
        <header className="detail-head">
          <div className="detail-title-row">
            <h2 className="detail-title" title={project.name}>
              {project.name}
            </h2>
            <button
              className="detail-close"
              onClick={onClose}
              aria-label="关闭"
              title="关闭 (Esc)"
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
          <div className="detail-label">分类</div>
          <div className="category-current">
            <span className="category-pill">{currentCategory?.name ?? '未分类'}</span>
            {isManual ? (
              <button
                className="link-btn"
                onClick={() => onUnassignCategory(project)}
                title="清除手动分类，回到自动推断"
              >
                清除
              </button>
            ) : (
              <span className="muted detail-hint">（自动推断）</span>
            )}
          </div>
          <div className="category-options">
            {allCategories.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                active={c.id === currentCategoryId}
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
                  placeholder="分类名"
                  maxLength={20}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => {
                    if (!newName.trim()) setCreating(false);
                  }}
                />
                <button type="submit" className="primary" disabled={!newName.trim()}>
                  添加
                </button>
              </form>
            ) : (
              <button
                className="category-new-btn"
                onClick={() => setCreating(true)}
                title="新建一个自定义分类"
              >
                + 新建分类
              </button>
            )}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-label">基本信息</div>
          <dl className="detail-meta">
            <dt>来源</dt>
            <dd title={SOURCE_META[project.source].title}>
              {SOURCE_META[project.source].label}
              {project.gitRemote && (
                <>
                  <span className="muted"> · </span>
                  <span className="detail-remote" title={project.gitRemote}>
                    {project.gitRemote}
                  </span>
                </>
              )}
            </dd>

            <dt>路径</dt>
            <dd>
              <span
                className="detail-path"
                title={project.path}
                onClick={() => onReveal(project.path)}
              >
                {shortenPath(project.path, 64)}
              </span>
            </dd>

            <dt>生态</dt>
            <dd>
              {project.ecosystems.length === 0
                ? '—'
                : project.ecosystems.map((e) => ECO_LABELS[e] ?? e).join(' · ')}
            </dd>

            <dt>最近修改</dt>
            <dd>{formatRelative(project.lastModified)}</dd>

            {project.gitDirty != null && (
              <>
                <dt>Git 状态</dt>
                <dd className={project.gitDirty ? 'detail-warn' : ''}>
                  {project.gitDirty ? '有未提交的修改' : '工作区干净'}
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className="detail-section">
          <div className="detail-label">
            可清理目录{' '}
            {project.cleanables.length > 0 && (
              <span className="muted">
                · 共 {formatBytes(project.cleanableSize)}
              </span>
            )}
          </div>
          {project.cleanables.length === 0 ? (
            <div className="muted detail-empty">该项目当前没有可清理的构建产物。</div>
          ) : (
            <ul className="detail-cleanables">
              {project.cleanables.map((c) => (
                <li key={c.path}>
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
          <div className="muted detail-hint">
            勾选与清理请回到列表里完成，详情面板只展示信息。
          </div>
        </section>
      </aside>
    </>
  );
}

interface ChipProps {
  category: Category;
  active: boolean;
  onPick: () => void;
  /** 仅自定义分类传入，触发删除 */
  onRemove?: () => void;
}

function CategoryChip({ category, active, onPick, onRemove }: ChipProps) {
  return (
    <span className={`category-chip ${active ? 'active' : ''}`}>
      <button className="category-chip-pick" onClick={onPick} title="切换到该分类">
        {category.name}
      </button>
      {onRemove && (
        <button
          className="category-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`删除自定义分类「${category.name}」？\n该分类下的项目将回退到自动推断。`)) {
              onRemove();
            }
          }}
          title="删除该自定义分类"
          aria-label="删除"
        >
          ×
        </button>
      )}
    </span>
  );
}
