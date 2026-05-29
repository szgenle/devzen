import { useMemo, useState } from 'react';
import type { ArchiveRecord, BundleRecord, RemoteProvider } from '@shared/types';
import type { ViewMode } from '../App';
import { shortenPath, formatRelative, formatBytes } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getArchiveCategoryId,
  getCategoryDisplayName
} from '../utils/categories';
import { type TagStore, getProjectTags } from '../utils/tags';
import type { Messages } from '../utils/i18n';

type SortKey = 'archivedAt' | 'freedBytes' | 'name';
type SortOrder = 'desc' | 'asc';

interface Props {
  archives: ArchiveRecord[];
  bundles: BundleRecord[];
  bundlingPath: string | null;
  hasBackupDir: boolean;
  categoryStore: CategoryStore;
  tagStore: TagStore;
  viewMode: ViewMode;
  t: Messages;
  restoringPath: string | null;
  onBack: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onRestore: (record: ArchiveRecord) => void;
  onForget: (path: string) => void;
  onReveal: (path: string) => void;
  onBundle: (record: ArchiveRecord) => void;
  onRestoreBundle: (b: BundleRecord) => void;
  onDeleteBundle: (b: BundleRecord) => void;
  onVerifyBundle: (b: BundleRecord) => void;
}

/** 与 OverviewList 保持一致的来源 / 生态映射 */
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
  records: ArchiveRecord[];
}

interface Group {
  category: Category;
  records: ArchiveRecord[];
  /** 若该分类下有归档项目设置了标签，则按标签拆分出子分组 */
  tagSubGroups: TagSubGroup[] | null;
}

/**
 * 已归档项目独立页面：
 *  - 列表是真正的清单，不再嵌在首页里。
 *  - 提供搜索（名称 / 路径）+ 排序（归档时间 / 释放空间 / 名称）。
 *  - 按分类分组展示，与概览页保持一致。
 *  - 操作：恢复、定位、忘记。
 */
export function ArchivesScreen({
  archives,
  bundles,
  bundlingPath,
  hasBackupDir,
  categoryStore,
  tagStore,
  viewMode,
  t,
  restoringPath,
  onBack,
  onViewModeChange,
  onRestore,
  onForget,
  onReveal,
  onBundle,
  onRestoreBundle,
  onDeleteBundle,
  onVerifyBundle
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('archivedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  // 记录已展开 bundle 列表的归档路径
  const [expandedPath, setExpandedPath] = useState<Set<string>>(new Set());

  // 按 originalPath 聚合 bundle，方便按归档记录快速查询
  const bundlesByOriginal = useMemo(() => {
    const map = new Map<string, BundleRecord[]>();
    for (const b of bundles) {
      const list = map.get(b.originalPath) ?? [];
      list.push(b);
      map.set(b.originalPath, list);
    }
    return map;
  }, [bundles]);

  // 孤立 bundle：originalPath 不在 archives 中的
  const archivedPaths = useMemo(() => new Set(archives.map((a) => a.path)), [archives]);
  const orphanBundles = useMemo(
    () => bundles.filter((b) => !archivedPaths.has(b.originalPath)),
    [bundles, archivedPaths]
  );

  const togglePath = (p: string) => {
    setExpandedPath((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  /** 底层 bundle 列表，在 list 与 card 视图中复用 */
  const renderBundleList = (list: BundleRecord[]) => (
    <ul className="bundle-list">
      {[...list]
        .sort((a, b) => b.bundledAt - a.bundledAt)
        .map((b) => {
          const missing = b.bundleExists === false;
          return (
            <li key={b.id} className="bundle-item">
              <div className="bundle-item-main">
                <div className="bundle-item-name" title={b.bundlePath}>
                  {b.bundlePath.split(/[\\/]/).pop()}
                  {missing && (
                    <span className="archived-missing">{' '}· {t.bundleItemMissing}</span>
                  )}
                </div>
                <div className="bundle-item-meta muted">
                  {t.bundleItemSize} {formatBytes(b.sizeBytes)} ·{' '}
                  {t.bundleItemBundledAt}{' '}
                  {formatRelative(b.bundledAt, t._lang as 'zh' | 'en')}
                </div>
                <div className="bundle-item-sha muted small" title={b.sha256}>
                  {t.bundleItemSha256}: {b.sha256.slice(0, 16)}…
                </div>
              </div>
              <div className="bundle-item-actions">
                {!missing && (
                  <button
                    className="link-btn"
                    onClick={() => onReveal(b.bundlePath)}
                    title={t.bundleItemReveal}
                  >
                    {t.reveal}
                  </button>
                )}
                <button
                  className="link-btn"
                  onClick={() => onVerifyBundle(b)}
                  disabled={missing}
                  title={t.bundleItemVerify}
                >
                  {t.bundleItemVerify}
                </button>
                <button
                  className="primary"
                  onClick={() => onRestoreBundle(b)}
                  disabled={missing}
                >
                  {t.bundleItemRestore}
                </button>
                <button
                  className="link-btn"
                  onClick={() => onDeleteBundle(b)}
                  title={t.bundleItemDelete}
                >
                  {t.remove}
                </button>
              </div>
            </li>
          );
        })}
    </ul>
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list: ArchiveRecord[] = archives;
    if (kw) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(kw) || r.path.toLowerCase().includes(kw)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'archivedAt') cmp = a.archivedAt - b.archivedAt;
      else if (sortKey === 'freedBytes') cmp = a.freedBytes - b.freedBytes;
      else cmp = a.name.localeCompare(b.name);
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [archives, keyword, sortKey, sortOrder]);

  // 按分类分组：和概览页一致，按 category.order 升序，空组不显示。
  // 组内顺序沿用上方 filtered 的全局排序（搜索 + 排序已生效）。
  // 若分类下有归档项目带标签，则进一步按标签拆出子分组。
  const groups = useMemo<Group[]>(() => {
    const all = getAllCategories(categoryStore);
    const map = new Map<string, ArchiveRecord[]>();
    for (const rec of filtered) {
      const cid = getArchiveCategoryId(rec, categoryStore);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(rec);
    }
    const result: Group[] = [];
    for (const cat of all) {
      const list = map.get(cat.id);
      if (!list || list.length === 0) continue;

      // 检查该分类下是否有归档项目设置了标签（标签按归档原路径关联）
      const hasAnyTag = list.some(
        (r) => getProjectTags(r.path, tagStore).length > 0
      );
      let tagSubGroups: TagSubGroup[] | null = null;
      if (hasAnyTag) {
        const tagMap = new Map<string, { tagName: string; records: ArchiveRecord[] }>();
        const untagged: ArchiveRecord[] = [];
        for (const r of list) {
          const tags = getProjectTags(r.path, tagStore);
          if (tags.length === 0) {
            untagged.push(r);
          } else {
            for (const tag of tags) {
              if (!tagMap.has(tag.id))
                tagMap.set(tag.id, { tagName: tag.name, records: [] });
              tagMap.get(tag.id)!.records.push(r);
            }
          }
        }
        tagSubGroups = [];
        for (const [, group] of tagMap) {
          tagSubGroups.push({ tagName: group.tagName, records: group.records });
        }
        if (untagged.length > 0) {
          tagSubGroups.push({ tagName: null, records: untagged });
        }
      }

      result.push({ category: cat, records: list, tagSubGroups });
    }
    return result;
  }, [filtered, categoryStore, tagStore]);

  const totalFreed = useMemo(
    () => archives.reduce((s, r) => s + r.freedBytes, 0),
    [archives]
  );

  // 抽取列表渲染，以便在"仅分类"与"分类+标签子分组"两种结构下复用
  const renderArchivedList = (list: ArchiveRecord[]) => (
    <ul className="archived-list">
      {list.map((rec) => {
        const isRestoring = restoringPath === rec.path;
        const missing = rec.pathExists === false;
        const isBundling = bundlingPath === rec.path;
        const recBundles = bundlesByOriginal.get(rec.path) ?? [];
        const expanded = expandedPath.has(rec.path);
        return (
          <li key={rec.path} className="archived-item">
            <div className="archived-item-row">
            <div className="archived-item-icon" aria-hidden>
              📦
            </div>
            <div className="archived-item-main">
              <div className="archived-item-name" title={rec.path}>
                {rec.name}
                {missing && (
                  <span
                    className="archived-missing"
                    title={t.homeArchivedMissing}
                  >
                    {' '}· {t.homeArchivedMissing}
                  </span>
                )}
              </div>
              <div className="archived-item-path muted" title={rec.path}>
                {shortenPath(rec.path, 60)}
              </div>
              <div className="archived-item-meta muted">
                {t.homeArchivedFreed} {formatBytes(rec.freedBytes)} ·{' '}
                {t.homeArchivedAt}{' '}
                {formatRelative(rec.archivedAt, t._lang as 'zh' | 'en')}
              </div>
            </div>
            <div className="archived-item-actions">
              {!missing && (
                <button
                  className="link-btn"
                  onClick={() => onReveal(rec.path)}
                  title={t.reveal}
                >
                  {t.reveal}
                </button>
              )}
              <button
                className="link-btn"
                onClick={() => onBundle(rec)}
                disabled={missing || isBundling || !hasBackupDir}
                title={
                  !hasBackupDir
                    ? t.bundleBtnDisabledNoBackupDir
                    : missing
                    ? t.bundleBtnDisabledMissing
                    : t.bundleBtnTitle
                }
              >
                {isBundling ? t.archiving : t.bundleBtn}
              </button>
              <button
                className="primary"
                onClick={() => onRestore(rec)}
                disabled={missing || isRestoring}
              >
                {isRestoring ? t.restoring : t.homeArchivedRestore}
              </button>
              <button
                className="link-btn"
                onClick={() => onForget(rec.path)}
                title={t.homeArchivedForgetTitle}
              >
                {t.homeArchivedForget}
              </button>
            </div>
            </div>
            {recBundles.length > 0 && (
              <div className="bundle-toggle-row">
                <button
                  className="link-btn"
                  onClick={() => togglePath(rec.path)}
                >
                  {expanded
                    ? t.bundleListToggleHide
                    : t.bundleListToggleShow.replace('{count}', String(recBundles.length))}
                </button>
              </div>
            )}
            {expanded && renderBundleList(recBundles)}
          </li>
        );
      })}
    </ul>
  );

  // 卡片网格渲染：项目名独占首行，徽标分左右两端对齐，与概览卡片保持一致
  const renderArchivedGrid = (list: ArchiveRecord[]) => (
    <div className="archived-card-grid">
      {list.map((rec) => {
        const isRestoring = restoringPath === rec.path;
        const missing = rec.pathExists === false;
        const isBundling = bundlingPath === rec.path;
        const recBundles = bundlesByOriginal.get(rec.path) ?? [];
        const expanded = expandedPath.has(rec.path);
        const sourceTags =
          rec.remoteProviders.length > 0
            ? rec.remoteProviders.map((p) => {
                const meta = PROVIDER_KEYS[p];
                return {
                  label: meta.label || t.providerUnknownLabel,
                  title: t[meta.titleKey],
                  cls: meta.cls
                };
              })
            : [{ label: t.localOnly, title: t.localOnlyTitle, cls: 'tag-source-local' }];
        return (
          <div key={rec.path} className="archived-card" title={rec.path}>
            <div className="archived-card-header">
              <span className="archived-card-icon" aria-hidden>
                📦
              </span>
              <span className="project-name" title={rec.name}>
                {rec.name}
              </span>
            </div>
            {(sourceTags.length > 0 || rec.ecosystems.length > 0 || missing) && (
              <div className="archived-card-tags">
                <div className="archived-card-tags-left">
                  {sourceTags.map((meta) => (
                    <span key={meta.label} className={`tag ${meta.cls}`} title={meta.title}>
                      {meta.label}
                    </span>
                  ))}
                  {missing && (
                    <span className="tag tag-dirty" title={t.homeArchivedMissing}>
                      {t.homeArchivedMissing}
                    </span>
                  )}
                </div>
                <div className="archived-card-tags-right">
                  {rec.ecosystems.map((e) => (
                    <span key={e} className={`tag tag-${e}`}>
                      {ECO_LABELS[e] ?? (e === 'unknown' ? t.ecoUnknown : e)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="archived-card-meta muted">
              <span className="archived-card-freed">
                {t.homeArchivedFreed} {formatBytes(rec.freedBytes)}
              </span>
              <span className="archived-card-time">
                {formatRelative(rec.archivedAt, t._lang as 'zh' | 'en')}
              </span>
            </div>
            <div
              className="archived-card-path muted"
              title={rec.path}
              onClick={(e) => {
                e.stopPropagation();
                if (!missing) onReveal(rec.path);
              }}
            >
              {shortenPath(rec.path, 40)}
            </div>
            <div className="archived-card-actions">
              <button
                className="link-btn"
                onClick={() => onReveal(rec.path)}
                disabled={missing}
                title={t.reveal}
              >
                {t.reveal}
              </button>
              <button
                className="link-btn"
                onClick={() => onBundle(rec)}
                disabled={missing || isBundling || !hasBackupDir}
                title={
                  !hasBackupDir
                    ? t.bundleBtnDisabledNoBackupDir
                    : missing
                    ? t.bundleBtnDisabledMissing
                    : t.bundleBtnTitle
                }
              >
                {isBundling ? t.archiving : t.bundleBtn}
              </button>
              <button
                className="primary"
                onClick={() => onRestore(rec)}
                disabled={missing || isRestoring}
              >
                {isRestoring ? t.restoring : t.homeArchivedRestore}
              </button>
              <button
                className="link-btn"
                onClick={() => onForget(rec.path)}
                title={t.homeArchivedForgetTitle}
              >
                {t.homeArchivedForget}
              </button>
            </div>
            {recBundles.length > 0 && (
              <div className="bundle-toggle-row">
                <button
                  className="link-btn"
                  onClick={() => togglePath(rec.path)}
                >
                  {expanded
                    ? t.bundleListToggleHide
                    : t.bundleListToggleShow.replace('{count}', String(recBundles.length))}
                </button>
              </div>
            )}
            {expanded && renderBundleList(recBundles)}
          </div>
        );
      })}
    </div>
  );

  const renderArchived = (list: ArchiveRecord[]) =>
    viewMode === 'card' ? renderArchivedGrid(list) : renderArchivedList(list);

  return (
    <div className="archives-screen">
      <header className="archives-header">
        <div className="archives-header-left">
          <button
            className="ghost-btn back-btn"
            onClick={onBack}
            title={t.backToHome}
          >
            {t.backHome}
          </button>
          <span className="brand">⌬ DevZen</span>
        </div>
        <div className="archives-header-center">
          <h1 className="archives-title">{t.homeArchivedTitle}</h1>
        </div>
        <div className="archives-header-right">
          {archives.length > 0 && (
            <div className="view-toggle" title={t.viewToggle}>
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => onViewModeChange('list')}
                title={t.viewList}
              >
                ☰
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => onViewModeChange('card')}
                title={t.viewCard}
              >
                ▦
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="archives-main">
        <p className="archives-tagline muted">{t.homeArchivedTagline}</p>

        {archives.length === 0 ? (
          <div className="archives-empty muted">{t.homeArchivedEmpty}</div>
        ) : (
          <>
            <div className="archives-stats">
              <div className="archives-stat">
                <span className="archives-stat-label">{t.archivesCount}</span>
                <span className="archives-stat-value">{archives.length}</span>
              </div>
              <div className="archives-stat-divider" />
              <div className="archives-stat">
                <span className="archives-stat-label">{t.archivesTotalFreed}</span>
                <span className="archives-stat-value is-accent">
                  {formatBytes(totalFreed)}
                </span>
              </div>
            </div>

            <div className="archives-toolbar">
              <input
                className="archives-search"
                type="text"
                placeholder={t.archivesSearch}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <div className="archives-sort">
                <label className="muted">{t.archivesSortBy}</label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="archivedAt">{t.archivesSortArchivedAt}</option>
                  <option value="freedBytes">{t.archivesSortFreed}</option>
                  <option value="name">{t.archivesSortName}</option>
                </select>
                <button
                  className="ghost-btn archives-sort-order"
                  onClick={() =>
                    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                  }
                  title={
                    sortOrder === 'desc' ? t.archivesSortDesc : t.archivesSortAsc
                  }
                >
                  {sortOrder === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="archives-empty muted">{t.archivesNoMatch}</div>
            ) : (
              <div className="archives-groups">
                {groups.map((g) => (
                  <section key={g.category.id} className="overview-group archives-group">
                    <header className="overview-group-head">
                      <span className="group-name">{getCategoryDisplayName(g.category, t)}</span>
                      <span className="group-count">
                        {g.records.length} {t.overviewProjectCount}
                      </span>
                    </header>
                    {g.tagSubGroups ? (
                      g.tagSubGroups.map((sub) => (
                        <div
                          key={sub.tagName ?? '__untagged__'}
                          className="overview-tag-subgroup"
                        >
                          <div className="overview-tag-subgroup-head">
                            <span className="tag-subgroup-name">
                              {sub.tagName ?? t.tagUntagged}
                            </span>
                            <span className="tag-subgroup-count">{sub.records.length}</span>
                          </div>
                          {renderArchived(sub.records)}
                        </div>
                      ))
                    ) : (
                      renderArchived(g.records)
                    )}
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {/* 孤立 bundle：原归档已 forget 但 bundle 仍在 */}
        {orphanBundles.length > 0 && (
          <section className="orphan-bundles-section">
            <header className="overview-group-head">
              <span className="group-name">{t.bundleOrphanTitle}</span>
              <span className="group-count">
                {orphanBundles.length}
              </span>
            </header>
            {renderBundleList(orphanBundles)}
          </section>
        )}
      </main>
    </div>
  );
}
