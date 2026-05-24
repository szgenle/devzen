import { useMemo } from 'react';
import type { EcosystemId, ProjectInfo, ProjectSource } from '@shared/types';
import type { CategoryStore } from '../utils/categories';
import { getAllCategories, getProjectCategoryId } from '../utils/categories';
import { type TagStore, getAllTags, getProjectTagIds } from '../utils/tags';
import type { Messages } from '../utils/i18n';

export interface FilterState {
  /** 文本搜索（匹配名称 / 描述） */
  query: string;
  /** 按分类 ID 筛选；null = 全部 */
  categoryId: string | null;
  /** 按生态筛选；空集 = 全部 */
  ecosystems: Set<EcosystemId>;
  /** 按来源筛选；空集 = 全部 */
  sources: Set<ProjectSource>;
  /** 按标签 ID 筛选；空集 = 全部 */
  tagIds: Set<string>;
}

export const EMPTY_FILTER: FilterState = {
  query: '',
  categoryId: null,
  ecosystems: new Set(),
  sources: new Set(),
  tagIds: new Set()
};

export function isFilterActive(f: FilterState): boolean {
  return f.query !== '' || f.categoryId !== null || f.ecosystems.size > 0 || f.sources.size > 0 || f.tagIds.size > 0;
}

/** 根据筛选条件过滤项目列表 */
export function applyFilter(
  projects: ProjectInfo[],
  filter: FilterState,
  categoryStore: CategoryStore,
  tagStore: TagStore
): ProjectInfo[] {
  let list = projects;

  if (filter.query) {
    const q = filter.query.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }

  if (filter.categoryId) {
    const cid = filter.categoryId;
    list = list.filter((p) => getProjectCategoryId(p, categoryStore) === cid);
  }

  if (filter.ecosystems.size > 0) {
    list = list.filter((p) => p.ecosystems.some((e) => filter.ecosystems.has(e)));
  }

  if (filter.sources.size > 0) {
    list = list.filter((p) => filter.sources.has(p.source));
  }

  if (filter.tagIds.size > 0) {
    list = list.filter((p) => {
      const pTags = getProjectTagIds(p.path, tagStore);
      return pTags.some((tid) => filter.tagIds.has(tid));
    });
  }

  return list;
}

// ──────── 可用筛选维度提取 ────────

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

interface Props {
  projects: ProjectInfo[];
  filter: FilterState;
  categoryStore: CategoryStore;
  tagStore: TagStore;
  t: Messages;
  onChange: (filter: FilterState) => void;
}

/**
 * 筛选栏：搜索框 + 分类/生态/来源快速 chip 过滤。
 * 只在概览 Tab 且有项目时展示。
 */
export function FilterBar({ projects, filter, categoryStore, tagStore, t, onChange }: Props) {
  // 提取当前项目中实际存在的生态和来源，作为可选 chip
  const availableEcosystems = useMemo<EcosystemId[]>(() => {
    const set = new Set<EcosystemId>();
    for (const p of projects) {
      for (const e of p.ecosystems) {
        if (e !== 'unknown') set.add(e);
      }
    }
    return Array.from(set).sort();
  }, [projects]);

  const availableSources = useMemo<ProjectSource[]>(() => {
    const set = new Set<ProjectSource>();
    for (const p of projects) set.add(p.source);
    // 固定顺序
    const order: ProjectSource[] = ['github', 'remote', 'local'];
    return order.filter((s) => set.has(s));
  }, [projects]);

  const categories = useMemo(() => getAllCategories(categoryStore), [categoryStore]);

  const sourceLabels: Record<ProjectSource, string> = {
    github: t.filterGithub,
    remote: t.filterRemote,
    local: t.filterLocal
  };

  const toggleEcosystem = (eco: EcosystemId) => {
    const next = new Set(filter.ecosystems);
    if (next.has(eco)) next.delete(eco);
    else next.add(eco);
    onChange({ ...filter, ecosystems: next });
  };

  const toggleSource = (src: ProjectSource) => {
    const next = new Set(filter.sources);
    if (next.has(src)) next.delete(src);
    else next.add(src);
    onChange({ ...filter, sources: next });
  };

  const toggleTag = (tagId: string) => {
    const next = new Set(filter.tagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    onChange({ ...filter, tagIds: next });
  };

  const allTags = useMemo(() => getAllTags(tagStore), [tagStore]);

  const active = isFilterActive(filter);

  return (
    <div className="filter-bar">
      <div className="filter-search-row">
        <input
          type="text"
          className="filter-search-input"
          placeholder={t.filterSearch}
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
        />
        {active && (
          <button
            className="ghost-btn filter-clear-btn"
            onClick={() => onChange(EMPTY_FILTER)}
            title={t.filterClear}
          >
            {t.filterClear}
          </button>
        )}
      </div>

      <div className="filter-chips-row">
        {/* 分类 */}
        <span className="filter-label">{t.filterCategory}</span>
        <button
          className={`filter-chip ${filter.categoryId === null ? 'active' : ''}`}
          onClick={() => onChange({ ...filter, categoryId: null })}
        >
          {t.filterAll}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`filter-chip ${filter.categoryId === c.id ? 'active' : ''}`}
            onClick={() =>
              onChange({ ...filter, categoryId: filter.categoryId === c.id ? null : c.id })
            }
          >
            {c.name}
          </button>
        ))}

        {/* 来源 */}
        {availableSources.length > 1 && (
          <>
            <span className="filter-divider" />
            <span className="filter-label">{t.filterSource}</span>
            {availableSources.map((s) => (
              <button
                key={s}
                className={`filter-chip ${filter.sources.has(s) ? 'active' : ''}`}
                onClick={() => toggleSource(s)}
              >
                {sourceLabels[s]}
              </button>
            ))}
          </>
        )}

        {/* 生态 */}
        {availableEcosystems.length > 1 && (
          <>
            <span className="filter-divider" />
            <span className="filter-label">{t.filterEcosystem}</span>
            {availableEcosystems.map((e) => (
              <button
                key={e}
                className={`filter-chip ${filter.ecosystems.has(e) ? 'active' : ''}`}
                onClick={() => toggleEcosystem(e)}
              >
                {ECO_LABELS[e] ?? e}
              </button>
            ))}
          </>
        )}

        {/* 标签 */}
        {allTags.length > 0 && (
          <>
            <span className="filter-divider" />
            <span className="filter-label">{t.filterTag}</span>
            {allTags.map((tg) => (
              <button
                key={tg.id}
                className={`filter-chip ${filter.tagIds.has(tg.id) ? 'active' : ''}`}
                onClick={() => toggleTag(tg.id)}
              >
                {tg.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
