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

  // 对有未推送 commit 的项目生成警告
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

  // 找出最新的副本，建议归档其他副本
  if (projects.length === 2) {
    const [a, b] = projects;
    const da = details.get(a.path);
    const db = details.get(b.path);
    if (da && db) {
      const aTime = da.lastCommitTime ?? 0;
      const bTime = db.lastCommitTime ?? 0;
      const newer = aTime >= bTime ? a : b;
      const older = aTime >= bTime ? b : a;
      const newerDetail = aTime >= bTime ? da : db;
      // 仅当较新的副本已全部推送时，才建议归档旧的
      if (newerDetail.unpushedCount === 0 && older.source !== 'local') {
        suggestions.push(
          t.duplicateSuggestionSafe
            .replace('{name}', newer.name)
            .replace('{other}', `${older.name} (${shortenPath(older.path, 30)})`)
        );
      }
    }
  }

  return suggestions;
}
