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
  /** 失败时的底层错误码（如 EPERM / EACCES），用于识别权限问题 */
  errorCode?: string;
}

interface Props {
  /** 已处理 / 处理中的条目列表 */
  items: CleanProgressItem[];
  /** 总数 */
  total: number;
  /** 是否全部完成（决定标题、汇总与「完成」按钮可用性） */
  done: boolean;
  /** 是否为用户主动取消（用于在汇总区提示剩余目录未处理） */
  canceled?: boolean;
  /** 是否正在取消中（取消请求已发出但当前目录尚未删完） */
  canceling?: boolean;
  /** 当前运行平台，用于差异化权限引导文案与按钮 */
  platform?: string;
  t: Messages;
  onClose: () => void;
  /** 请求取消清理 */
  onCancel: () => void;
  /** 打开系统「完全磁盘访问权限」设置面板（仅 macOS） */
  onOpenFullDiskAccess: () => void;
}

/** 权限类错误码：命中则提示用户去开启系统授权 */
const PERMISSION_CODES = new Set(['EPERM', 'EACCES']);

/**
 * 清理进度对话框：
 * - 进行中：标题「清理中…」，滚动列表逐条展示正在删除的目录，可点「取消清理」中断。
 * - 完成后：标题「清理完成」，顶部汇总（共释放 / 成功 / 失败），保留明细，启用「完成」按钮。
 * - 若出现权限类失败（EPERM/EACCES），完成后额外展示引导横幅，macOS 可一键跳转授权面板。
 */
export function CleanProgressDialog({
  items,
  total,
  done,
  canceled,
  canceling,
  platform,
  t,
  onClose,
  onCancel,
  onOpenFullDiskAccess
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新条目进来时自动滚到底部，保证最新进度可见
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items.length]);

  const processed = items.filter((it) => it.done).length;
  const totalFreed = items.reduce((s, it) => s + (it.done && it.success ? it.freedBytes ?? 0 : 0), 0);
  const successCount = items.filter((it) => it.done && it.success).length;
  const failedCount = items.filter((it) => it.done && !it.success).length;

  // 是否存在权限类失败：决定完成后是否展示引导横幅
  const hasPermissionError = items.some(
    (it) => it.done && !it.success && it.errorCode && PERMISSION_CODES.has(it.errorCode)
  );
  const isMac = platform === 'darwin';

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

        {done && canceled && (
          <div className="clean-progress-canceled muted">{t.cleanCanceledNote}</div>
        )}

        {done && hasPermissionError && (
          <div className="clean-perm-banner" role="alert">
            <div className="clean-perm-title">{t.cleanPermTitle}</div>
            <div className="clean-perm-hint">
              {isMac ? t.cleanPermHintMac : t.cleanPermHintOther}
            </div>
            {isMac && (
              <button className="clean-perm-btn" onClick={onOpenFullDiskAccess}>
                {t.cleanPermOpenSettings}
              </button>
            )}
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
          {!done && (
            <button className="ghost-btn" onClick={onCancel} disabled={canceling}>
              {canceling ? t.cleanCanceling : t.cleanCancel}
            </button>
          )}
          <button className="primary" onClick={onClose} disabled={!done}>
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
