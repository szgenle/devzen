import type { ScanProgress } from '@shared/types';

interface Props {
  progress: ScanProgress | null;
  onCancel?: () => void;
}

/**
 * 扫描中视图：进度卡片 + 脉动动画 + 当前路径。
 * 目的是让等待过程"看起来在动"，减少焦虑感。
 */
export function ScanScreen({ progress, onCancel }: Props) {
  return (
    <div className="scan-screen">
      <div className="scan-card">
        <div className="scan-pulse" aria-hidden />
        <h2 className="scan-title">正在扫描你的项目目录…</h2>

        <div className="scan-stats">
          <div className="scan-stat">
            <strong>{progress?.scannedDirs ?? 0}</strong>
            <span>已扫描目录</span>
          </div>
          <div className="scan-stat">
            <strong>{progress?.foundProjects ?? 0}</strong>
            <span>已发现项目</span>
          </div>
        </div>

        <div className="scan-current" title={progress?.currentPath ?? ''}>
          {progress?.currentPath ?? '准备中…'}
        </div>

        {onCancel && (
          <button className="ghost-btn scan-cancel" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}
