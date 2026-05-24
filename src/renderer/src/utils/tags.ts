/**
 * 项目标签（多对多）本地存档。
 *
 * 设计要点：
 *  1. 与「分类」互补：分类是互斥的归属（每个项目只能属于一个分类），
 *     标签是自由标注（每个项目可以打 0~N 个标签，如 AI / 学习 / 实验）。
 *  2. 标签库全局维护，所有项目共享同一组标签定义。
 *  3. 数据存 localStorage，按项目绝对路径关联。
 */

const KEY = 'devzen.tags.v1';

export interface Tag {
  id: string;
  name: string;
  /** 创建时间戳，用于默认排序（先创建在前） */
  createdAt: number;
}

interface StoreFile {
  /** 全部可用标签 */
  tags: Tag[];
  /** 项目绝对路径 -> 该项目拥有的标签 ID 集合 */
  assignments: Record<string, string[]>;
}

export interface TagStore extends StoreFile {}

function read(): TagStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { tags: [], assignments: {} };
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {}
    };
  } catch {
    return { tags: [], assignments: {} };
  }
}

function write(store: TagStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 配额异常静默忽略
  }
}

export function loadTagStore(): TagStore {
  return read();
}

/** 获取所有标签，按创建时间升序 */
export function getAllTags(store: TagStore): Tag[] {
  return [...store.tags].sort((a, b) => a.createdAt - b.createdAt);
}

/** 获取某个项目当前拥有的标签 ID 列表 */
export function getProjectTagIds(projectPath: string, store: TagStore): string[] {
  return store.assignments[projectPath] ?? [];
}

/** 获取某个项目当前拥有的标签对象列表 */
export function getProjectTags(projectPath: string, store: TagStore): Tag[] {
  const ids = getProjectTagIds(projectPath, store);
  const idSet = new Set(ids);
  return store.tags.filter((t) => idSet.has(t.id));
}

/**
 * 创建一个新标签。若同名标签已存在则复用之。
 * @returns 更新后的 store 与标签对象。
 */
export function createTag(
  name: string,
  store: TagStore
): { store: TagStore; tag: Tag } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('标签名不能为空');
  // 同名复用
  const existing = store.tags.find((t) => t.name === trimmed);
  if (existing) return { store, tag: existing };
  const tag: Tag = {
    id: `tag:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    createdAt: Date.now()
  };
  const next: TagStore = { ...store, tags: [...store.tags, tag] };
  write(next);
  return { store: next, tag };
}

/** 删除一个标签；所有项目的关联一并移除。 */
export function deleteTag(id: string, store: TagStore): TagStore {
  const tags = store.tags.filter((t) => t.id !== id);
  const assignments: Record<string, string[]> = {};
  for (const [path, ids] of Object.entries(store.assignments)) {
    const filtered = ids.filter((tid) => tid !== id);
    if (filtered.length > 0) assignments[path] = filtered;
  }
  const next: TagStore = { tags, assignments };
  write(next);
  return next;
}

/** 给项目添加一个标签。 */
export function addTagToProject(
  projectPath: string,
  tagId: string,
  store: TagStore
): TagStore {
  const current = store.assignments[projectPath] ?? [];
  if (current.includes(tagId)) return store;
  const next: TagStore = {
    ...store,
    assignments: { ...store.assignments, [projectPath]: [...current, tagId] }
  };
  write(next);
  return next;
}

/** 从项目移除一个标签。 */
export function removeTagFromProject(
  projectPath: string,
  tagId: string,
  store: TagStore
): TagStore {
  const current = store.assignments[projectPath] ?? [];
  const filtered = current.filter((id) => id !== tagId);
  const assignments = { ...store.assignments };
  if (filtered.length > 0) {
    assignments[projectPath] = filtered;
  } else {
    delete assignments[projectPath];
  }
  const next: TagStore = { ...store, assignments };
  write(next);
  return next;
}
