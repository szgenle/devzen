import { useEffect, useState } from 'react';
import type { ProjectDetail, ProjectInfo } from '@shared/types';
import { formatBytes, formatRelative, shortenPath } from '../utils/format';
import type { Messages } from '../utils/i18n';

interface Props {
  /** 当前重复组中的所有项目 */
  projects: ProjectInfo[];
  t: Messages;
  onClose: () => void;
  onReveal: (path: string) => void;
  onArchive: (p: ProjectInfo) => void;
}

/**
 * 重复项目对比视图：全屏弹窗，表格形式对比同一仓库的多份副本。
 * 详细信息（lastCommitTime / unpushedCount / totalSize）通过 IPC 按需加载。
 */
export function DuplicateCompare({ projects, t, onClose, onReveal, onArchive }: Props) {
  const [details, setDetails] = useState<Map<string, ProjectDetail>>(new Map());
  const [loading, setLoading] = useState(true);

  // 打开时按需加载所有副本的详细信息
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(projects.map((p) => window.devzen.getProjectDetail(p.path)))
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, ProjectDetail>();
        for (const d of results) {
          map.set(d.path, d);
        }
        setDetails(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projects]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // 生成建议
  const suggestions = generateSuggestions(projects, details, t);

  return (
    <div className="duplicate-overlay" onClick={onClose}>
      <div className="duplicate-panel" onClick={(e) => e.stopPropagation()}>
        <header className="duplicate-header">
          <h2>{t.duplicateCompareTitle}</h2>
          <button className="btn-close" onClick={onClose}>{t.duplicateClose}</button>
        </header>

        {loading ? (
          <div className="duplicate-loading muted">{t.duplicateLoading}</div>
        ) : (
          <>
            <div className="duplicate-table-wrap">
              <table className="duplicate-table">
                <thead>
                  <tr>
                    <th>{t.duplicateColPath}</th>
                    <th>{t.duplicateColBranch}</th>
                    <th>{t.duplicateColLastCommit}</th>
                    <th>{t.duplicateColLastModified}</th>
                    <th>{t.duplicateColUnpushed}</th>
                    <th>{t.duplicateColDirty}</th>
                    <th>{t.duplicateColTotalSize}</th>
                    <th>{t.duplicateColCleanableSize}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const d = details.get(p.path);
                    return (
                      <tr key={p.path}>
                        <td className="duplicate-cell-path" title={p.path}>
                          {shortenPath(p.path, 50)}
                        </td>
                        <td className="duplicate-cell-branch">
                          {d?.branch ? <code>{d.branch}</code> : <span className="muted">—</span>}
                        </td>
                        <td>
                          {d?.lastCommitTime
                            ? formatRelative(d.lastCommitTime, t._lang as 'zh' | 'en')
                            : t.duplicateNone}
                        </td>
                        <td>
                          {p.lastModified
                            ? formatRelative(p.lastModified, t._lang as 'zh' | 'en')
                            : t.duplicateNone}
                        </td>
                        <td className={d && d.unpushedCount > 0 ? 'duplicate-warn' : ''}>
                          {d ? d.unpushedCount : '-'}
                        </td>
                        <td className={p.gitDirty ? 'duplicate-warn' : ''}>
                          {p.gitDirty ? t.duplicateYes : t.duplicateNo}
                        </td>
                        <td>{d ? formatBytes(d.totalSize) : '-'}</td>
                        <td>{formatBytes(p.cleanableSize)}</td>
                        <td className="duplicate-cell-actions">
                          <button
                            className="btn-small"
                            title={t.duplicateReveal}
                            onClick={() => onReveal(p.path)}
                          >
                            {t.reveal}
                          </button>
                          {p.source !== 'local' && (
                            <button
                              className="btn-small btn-warn"
                              title={t.duplicateArchiveThis}
                              onClick={() => onArchive(p)}
                            >
                              {t.archiveBtn}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {suggestions.length > 0 && (
              <div className="duplicate-suggestions">
                {suggestions.map((s, i) => (
                  <p key={i} className="duplicate-suggestion-item">{s}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 基于规则生成对比建议 */
function generateSuggestions(
  projects: ProjectInfo[],
  details: Map<string, ProjectDetail>,
  t: Messages
): string[] {
  const suggestions: string[] = [];
  if (details.size === 0) return suggestions;

  // 0. 分支感知：检测各副本是否位于不同分支
  const branches = new Set<string>();
  for (const p of projects) {
    const d = details.get(p.path);
    if (d?.branch) branches.add(d.branch);
  }
  const hasDifferentBranches = branches.size >= 2;

  // 如果分支不同，优先提示并抑制归档建议
  if (hasDifferentBranches) {
    suggestions.push(t.duplicateSuggestionDiffBranch);
  }

  // 1. 未提交修改警告
  for (const p of projects) {
    if (p.gitDirty) {
      suggestions.push(
        t.duplicateSuggestionDirtyWarn.replace('{name}', p.name)
      );
    }
  }

  // 2. 未推送 commit 警告
  for (const p of projects) {
    const d = details.get(p.path);
    if (d && d.unpushedCount > 0) {
      suggestions.push(
        t.duplicateSuggestionUnpushed
          .replace('{name}', p.name)
          .replace('{count}', String(d.unpushedCount))
      );
    }
  }

  // 如果分支不同，跳过保留/归档建议（有意保留场景）
  if (hasDifferentBranches) {
    return suggestions;
  }

  // 3. 推荐保留最新副本
  const withCommitTime = projects
    .map((p) => ({ project: p, detail: details.get(p.path) }))
    .filter((x) => x.detail?.lastCommitTime);

  if (withCommitTime.length >= 2) {
    withCommitTime.sort(
      (a, b) => (b.detail!.lastCommitTime ?? 0) - (a.detail!.lastCommitTime ?? 0)
    );
    const newest = withCommitTime[0];
    suggestions.push(
      t.duplicateSuggestionNewest
        .replace('{name}', newest.project.name)
        .replace('{time}', formatRelative(newest.detail!.lastCommitTime!, t._lang as 'zh' | 'en'))
    );

    // 4. 计算归档其余副本可释放的空间
    const freeableSize = withCommitTime
      .slice(1)
      .reduce((sum, x) => sum + (x.detail?.totalSize ?? 0), 0);
    if (freeableSize > 0) {
      suggestions.push(
        t.duplicateSuggestionFreeable.replace('{size}', formatBytes(freeableSize))
      );
    }

    // 5. 如果最新副本已全部同步，生成安全归档建议
    const newestDetail = newest.detail!;
    if (newestDetail.unpushedCount === 0 && !newest.project.gitDirty) {
      const allSynced = projects.every((p) => {
        const d = details.get(p.path);
        return d ? d.unpushedCount === 0 : true;
      });
      if (allSynced) {
        suggestions.push(t.duplicateSuggestionAllSynced);
      } else {
        const others = withCommitTime.slice(1);
        for (const other of others) {
          if (
            other.detail!.unpushedCount === 0 &&
            !other.project.gitDirty &&
            other.project.source !== 'local'
          ) {
            suggestions.push(
              t.duplicateSuggestionSafe
                .replace('{name}', newest.project.name)
                .replace('{other}', `${other.project.name} (${shortenPath(other.project.path, 30)})`)
            );
          }
        }
      }
    }
  } else if (projects.length >= 2) {
    // 没有 commit 时间数据（非 git 项目），基于 lastModified 推荐
    const sorted = [...projects].sort(
      (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0)
    );
    if (sorted[0].lastModified) {
      suggestions.push(
        t.duplicateSuggestionNewest
          .replace('{name}', sorted[0].name)
          .replace('{time}', formatRelative(sorted[0].lastModified!, t._lang as 'zh' | 'en'))
      );
    }
    const freeableSize = sorted
      .slice(1)
      .reduce((sum, p) => sum + (details.get(p.path)?.totalSize ?? 0), 0);
    if (freeableSize > 0) {
      suggestions.push(
        t.duplicateSuggestionFreeable.replace('{size}', formatBytes(freeableSize))
      );
    }
  }

  return suggestions;
}
