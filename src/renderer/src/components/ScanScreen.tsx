import type { ScanProgress } from '@shared/types';
import type { Messages } from '../utils/i18n';

interface Props {
  progress: ScanProgress | null;
  t: Messages;
  onCancel?: () => void;
}

/**
 * 扫描中视图：进度卡片 + 脉动动画 + 当前路径。
 * 目的是让等待过程"看起来在动"，减少焦虑感。
 */
export function ScanScreen({ progress, t, onCancel }: Props) {
  return (
    <div className="scan-screen">
      <div className="scan-card">
        <div className="scan-pulse" aria-hidden />
        <h2 className="scan-title">{t.scanTitle}</h2>

        <div className="scan-stats">
          <div className="scan-stat">
            <strong>{progress?.scannedDirs ?? 0}</strong>
            <span>{t.scanDirs}</span>
          </div>
          <div className="scan-stat">
            <strong>{progress?.foundProjects ?? 0}</strong>
            <span>{t.scanFound}</span>
          </div>
        </div>

        <div className="scan-current" title={progress?.currentPath ?? ''}>
          {progress?.currentPath ?? t.scanPreparing}
        </div>

        {onCancel && (
          <button className="ghost-btn scan-cancel" onClick={onCancel}>
            {t.cancel}
          </button>
        )}
      </div>
    </div>
  );
}
