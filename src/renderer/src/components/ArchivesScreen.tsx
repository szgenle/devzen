import { useMemo, useState } from 'react';
import type { ArchiveRecord } from '@shared/types';
import { shortenPath, formatRelative, formatBytes } from '../utils/format';
import {
  type Category,
  type CategoryStore,
  getAllCategories,
  getArchiveCategoryId
} from '../utils/categories';
import type { Messages } from '../utils/i18n';

type SortKey = 'archivedAt' | 'freedBytes' | 'name';
type SortOrder = 'desc' | 'asc';

interface Props {
  archives: ArchiveRecord[];
  categoryStore: CategoryStore;
  t: Messages;
  restoringPath: string | null;
  onBack: () => void;
  onRestore: (record: ArchiveRecord) => void;
  onForget: (path: string) => void;
  onReveal: (path: string) => void;
}

interface Group {
  category: Category;
  records: ArchiveRecord[];
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
  categoryStore,
  t,
  restoringPath,
  onBack,
  onRestore,
  onForget,
  onReveal
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('archivedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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
      result.push({ category: cat, records: list });
    }
    return result;
  }, [filtered, categoryStore]);

  const totalFreed = useMemo(
    () => archives.reduce((s, r) => s + r.freedBytes, 0),
    [archives]
  );

  return (
    <div className="archives-screen">
      <div className="archives-card">
        <div className="archives-head">
          <button className="link-btn back-btn" onClick={onBack}>
            ← {t.back}
          </button>
          <div className="archives-head-main">
            <h1 className="archives-title">{t.homeArchivedTitle}</h1>
            <p className="archives-tagline muted">{t.homeArchivedTagline}</p>
          </div>
        </div>

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
                      <span className="group-name">{g.category.name}</span>
                      <span className="group-count">
                        {g.records.length} {t.overviewProjectCount}
                      </span>
                    </header>
                    <ul className="archived-list">
                      {g.records.map((rec) => {
                        const isRestoring = restoringPath === rec.path;
                        const missing = rec.pathExists === false;
                        return (
                          <li key={rec.path} className="archived-item">
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
                              <div
                                className="archived-item-path muted"
                                title={rec.path}
                              >
                                {shortenPath(rec.path, 60)}
                              </div>
                              <div className="archived-item-meta muted">
                                {t.homeArchivedFreed} {formatBytes(rec.freedBytes)} ·{' '}
                                {t.homeArchivedAt}{' '}
                                {formatRelative(
                                  rec.archivedAt,
                                  t._lang as 'zh' | 'en'
                                )}
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
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
