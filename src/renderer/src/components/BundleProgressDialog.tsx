import { useEffect, useState } from 'react';
import type { BundleProgress } from '@shared/types';
import type { Messages } from '../utils/i18n';
import { formatBytes } from '../utils/format';

interface Props {
  /** 当前进度；null 表示尚未开始 / 已结束 */
  progress: BundleProgress | null;
  /** 模式：bundle 显示「正在压缩」title；restore 显示「正在恢复」 */
  phase: 'bundle' | 'restore';
  t: Messages;
}

/**
 * 冷备包进度对话框：>3s 才显示，避免短任务闪烁。
 * 计时从 Props.progress 第一次出现非 null 起算。
 * 进度条按 bytesProcessed / bytesTotal 渲染；总字节数 0 时退化为不确定进度。
 */
export function BundleProgressDialog({ progress, phase, t }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!progress) {
      setVisible(false);
      return;
    }
    // 已经在显示就不再设置定时器
    if (visible) return;
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [progress, visible]);

  if (!progress || !visible) return null;

  const percent =
    progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesProcessed / progress.bytesTotal) * 100))
      : null;

  const title = phase === 'bundle' ? t.bundleProgressTitle : t.bundleProgressRestoreTitle;

  return (
    <div className="modal-mask">
      <div className="modal bundle-progress-modal" role="dialog" aria-modal="true">
        <h3 className="modal-title">{title}</h3>
        <div className="bundle-progress-bar-wrap">
          <div
            className={`bundle-progress-bar ${percent == null ? 'is-indeterminate' : ''}`}
            style={percent != null ? { width: `${percent}%` } : undefined}
          />
        </div>
        <div className="bundle-progress-meta muted">
          {percent != null ? `${percent}% · ` : ''}
          {t.bundleProgressBytes
            .replace('{processed}', formatBytes(progress.bytesProcessed))
            .replace('{total}', formatBytes(progress.bytesTotal))}
        </div>
        {progress.currentEntry && (
          <div className="bundle-progress-entry muted" title={progress.currentEntry}>
            {t.bundleProgressEntry.replace('{path}', progress.currentEntry)}
          </div>
        )}
      </div>
    </div>
  );
}
