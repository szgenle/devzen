import { useEffect, useRef } from 'react';
import type { Messages } from '../utils/i18n';
import { formatBytes } from '../utils/format';

/** 单条清理进度项：随事件累积，done 之前为「删除中」，之后带结果 */
export interface CleanProgressItem {
  path: string;
  name: string;
  /** 是否已处理完成 */
  done: boolean;
  /** done 后的结果字段 */
  success?: boolean;
  freedBytes?: number;
  error?: string;
}

interface Props {
  /** 已处理 / 处理中的条目列表 */
  items: CleanProgressItem[];
  /** 总数 */
  total: number;
  /** 是否全部完成（决定标题、汇总与「完成」按钮可用性） */
  done: boolean;
  t: Messages;
  onClose: () => void;
}

/**
 * 清理进度对话框：
 * - 进行中：标题「清理中…」，滚动列表逐条展示正在删除的目录。
 * - 完成后：标题「清理完成」，顶部汇总（共释放 / 成功 / 失败），保留明细，启用「完成」按钮。
 */
export function CleanProgressDialog({ items, total, done, t, onClose }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新条目进来时自动滚到底部，保证最新进度可见
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items.length]);

  const processed = items.filter((it) => it.done).length;
  const totalFreed = items.reduce((s, it) => s + (it.done && it.success ? it.freedBytes ?? 0 : 0), 0);
  const successCount = items.filter((it) => it.done && it.success).length;
  const failedCount = items.filter((it) => it.done && !it.success).length;

  return (
    <div className="modal-mask">
      <div className="modal clean-progress-modal" role="dialog" aria-modal="true">
        <h3 className="modal-title">{done ? t.cleanDoneTitle : t.cleanProgressTitle}</h3>

        {done ? (
          <div className="clean-progress-summary">
            <span>
              {t.cleanReportFreed} <strong>{formatBytes(totalFreed)}</strong>
            </span>
            <span className="sep">·</span>
            <span>
              {t.cleanReportSuccess} <strong>{successCount}</strong>
            </span>
            {failedCount > 0 && (
              <>
                <span className="sep">·</span>
                <span className="error">
                  {t.cleanReportFailed} <strong>{failedCount}</strong>
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="clean-progress-count muted">
            {t.cleanProgressCount.replace('{n}', String(processed)).replace('{total}', String(total))}
          </div>
        )}

        <div className="clean-progress-list">
          {items.map((it, i) => (
            <div
              key={`${it.path}-${i}`}
              className={`clean-progress-item ${
                !it.done ? 'is-running' : it.success ? 'is-ok' : 'is-failed'
              }`}
            >
              <span className="clean-progress-status">
                {!it.done ? '…' : it.success ? '✓' : '✕'}
              </span>
              <span className="clean-progress-path" title={it.path}>
                {it.path}
              </span>
              <span className="clean-progress-info">
                {!it.done
                  ? t.cleanItemDeleting
                  : it.success
                    ? formatBytes(it.freedBytes ?? 0)
                    : it.error ?? ''}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose} disabled={!done}>
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
