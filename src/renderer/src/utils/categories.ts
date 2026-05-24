import type { ArchiveRecord, ProjectInfo, ProjectSource } from '@shared/types';

/**
 * 项目分类（主分类）本地存档。
 *
 * 设计要点：
 *  1. 用户希望能"一目了然"地看到全部项目，分类是组织信息的核心维度。
 *  2. 提供 4 个内置分类作为零配置默认；同时允许用户新建自定义分类，
 *     以适配不同人群（个人 / 公司 / 学习 / 实验 等）。
 *  3. 自动推断 ≤ 用户手动分配。即使自动推断变化，用户曾经显式设置过的
 *     项目仍保留其手动选择。
 *  4. 数据存 localStorage，按项目绝对路径关联，重新扫描后不丢；
 *     若一个项目在某次扫描后消失（被删/移走），其 assignment 会变成
 *     "孤儿"但不影响功能，且不会自动清理（用户可能只是临时挪走）。
 */

const KEY = 'devzen.categories.v1';

export interface Category {
  id: string;
  name: string;
  /** 是否内置分类，内置分类不可重命名/删除 */
  builtin: boolean;
  /** 排序权重，数字越小越靠前 */
  order: number;
}

/** 内置分类 ID 常量，主要供 inferCategoryId 使用 */
export const BUILTIN_IDS = {
  work: 'builtin:work',
  personal: 'builtin:personal',
  thirdParty: 'builtin:third-party',
  localDraft: 'builtin:local-draft'
} as const;

/** 内置分类定义；顺序即默认展示顺序 */
export const BUILTIN_CATEGORIES: Category[] = [
  { id: BUILTIN_IDS.work, name: '工作', builtin: true, order: 10 },
  { id: BUILTIN_IDS.personal, name: '个人', builtin: true, order: 20 },
  { id: BUILTIN_IDS.thirdParty, name: '第三方', builtin: true, order: 30 },
  { id: BUILTIN_IDS.localDraft, name: '本地草稿', builtin: true, order: 40 }
];

interface StoreFile {
  /** 用户自定义分类，order 自动追加到内置分类之后 */
  custom: Category[];
  /** 项目绝对路径 -> 分类 ID */
  assignments: Record<string, string>;
}

export interface CategoryStore extends StoreFile {}

const EMPTY: CategoryStore = { custom: [], assignments: {} };

function read(): CategoryStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { custom: [], assignments: {} };
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {}
    };
  } catch {
    return { custom: [], assignments: {} };
  }
}

function write(store: CategoryStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 配额异常静默忽略，不影响核心流程
  }
}

export function loadStore(): CategoryStore {
  return read();
}

/** 内置 + 自定义分类的合并视图，按 order 升序 */
export function getAllCategories(store: CategoryStore): Category[] {
  return [...BUILTIN_CATEGORIES, ...store.custom].sort((a, b) => a.order - b.order);
}

/** 自动推断：source = github/remote/local 分别对应第三方/工作/本地草稿 */
export function inferCategoryId(source: ProjectSource): string {
  switch (source) {
    case 'github':
      return BUILTIN_IDS.thirdParty;
    case 'remote':
      return BUILTIN_IDS.work;
    case 'local':
    default:
      return BUILTIN_IDS.localDraft;
  }
}

/** 取项目当前分类 ID：手动分配优先，否则按 source 自动推断 */
export function getProjectCategoryId(p: ProjectInfo, store: CategoryStore): string {
  const manual = store.assignments[p.path];
  if (manual) {
    // 若用户曾分配到一个已被删除的自定义分类，回退到自动推断
    const all = getAllCategories(store);
    if (all.some((c) => c.id === manual)) return manual;
  }
  return inferCategoryId(p.source);
}

/**
 * 取已归档项目的分类 ID。
 * 归档项目没有 source 字段（已被卸载），但归档准入要求 source ∈ {github, remote}，
 * 因此用 remoteProviders 兜底推断：含 github 提供商 → 第三方，否则 → 工作。
 * 用户曾经手动分配的分类（按路径关联）依然优先生效。
 */
export function getArchiveCategoryId(rec: ArchiveRecord, store: CategoryStore): string {
  const manual = store.assignments[rec.path];
  if (manual) {
    const all = getAllCategories(store);
    if (all.some((c) => c.id === manual)) return manual;
  }
  const isGithub = rec.remoteProviders?.includes('github');
  return isGithub ? BUILTIN_IDS.thirdParty : BUILTIN_IDS.work;
}

export function findCategory(id: string, store: CategoryStore): Category | null {
  return getAllCategories(store).find((c) => c.id === id) ?? null;
}

/** 设置项目分类（手动覆盖）。返回更新后的 store。 */
export function assignCategory(path: string, categoryId: string, store: CategoryStore): CategoryStore {
  const next: CategoryStore = {
    ...store,
    assignments: { ...store.assignments, [path]: categoryId }
  };
  write(next);
  return next;
}

/** 清除项目的手动分类，回退到自动推断。 */
export function unassignCategory(path: string, store: CategoryStore): CategoryStore {
  if (!(path in store.assignments)) return store;
  const nextAssign = { ...store.assignments };
  delete nextAssign[path];
  const next: CategoryStore = { ...store, assignments: nextAssign };
  write(next);
  return next;
}

/**
 * 新建一个用户自定义分类。
 * @returns 更新后的 store 与新分类。若同名分类已存在则复用之。
 */
export function addCustomCategory(
  name: string,
  store: CategoryStore
): { store: CategoryStore; category: Category } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('分类名不能为空');
  // 同名复用：避免用户重复新建
  const existing = getAllCategories(store).find((c) => c.name === trimmed);
  if (existing) return { store, category: existing };
  // 自定义分类的 order 在内置之后递增
  const maxOrder = getAllCategories(store).reduce((m, c) => Math.max(m, c.order), 40);
  const cat: Category = {
    id: `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    builtin: false,
    order: maxOrder + 10
  };
  const next: CategoryStore = { ...store, custom: [...store.custom, cat] };
  write(next);
  return { store: next, category: cat };
}

/**
 * 删除一个自定义分类；指向它的 assignment 一并移除（自动回退到推断）。
 * 内置分类不可删除。
 */
export function removeCustomCategory(id: string, store: CategoryStore): CategoryStore {
  if (BUILTIN_CATEGORIES.some((c) => c.id === id)) return store;
  const custom = store.custom.filter((c) => c.id !== id);
  const assignments: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.assignments)) {
    if (v !== id) assignments[k] = v;
  }
  const next: CategoryStore = { custom, assignments };
  write(next);
  return next;
}

/** 重命名自定义分类；内置分类忽略。 */
export function renameCustomCategory(
  id: string,
  name: string,
  store: CategoryStore
): CategoryStore {
  const trimmed = name.trim();
  if (!trimmed) return store;
  if (BUILTIN_CATEGORIES.some((c) => c.id === id)) return store;
  const custom = store.custom.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
  const next: CategoryStore = { ...store, custom };
  write(next);
  return next;
}

/** 测试用空 store 工厂 */
export function emptyStore(): CategoryStore {
  return { ...EMPTY, custom: [], assignments: {} };
}
