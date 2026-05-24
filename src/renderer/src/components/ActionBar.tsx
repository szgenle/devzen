import type { CleanResult } from '@shared/types';
import { formatBytes } from '../utils/format';

interface Props {
  projectCount: number;
  totalCleanable: number;
  selectedCount: number;
  selectedSize: number;
  cleaning: boolean;
  lastResults: CleanResult[] | null;
  onCleanClick: () => void;
  onClearSelection: () => void;
}

/**
 * 底部操作栏：
 * - 左侧常驻汇总信息（项目数 / 可清理总量 / 上次释放）。
 * - 右侧仅当有选中目录时，浮现"清理选中"主按钮 + 取消选择链接。
 * 这样无选中时是一条安静的状态条，需要操作时才出现按钮，减少干扰。
 */
export function ActionBar({
  projectCount,
  totalCleanable,
  selectedCount,
  selectedSize,
  cleaning,
  lastResults,
  onCleanClick,
  onClearSelection
}: Props) {
  const hasSelection = selectedCount > 0;
  const lastFreed = lastResults
    ? lastResults.filter((r) => r.success).reduce((s, r) => s + r.freedBytes, 0)
    : 0;
  const lastFailed = lastResults ? lastResults.filter((r) => !r.success).length : 0;

  return (
    <footer className={`action-bar ${hasSelection ? 'has-selection' : ''}`}>
      <div className="action-bar-left">
        <span>
          项目 <strong>{projectCount}</strong>
        </span>
        <span className="sep">·</span>
        <span>
          可清理 <strong>{formatBytes(totalCleanable)}</strong>
        </span>
        {lastResults && (
          <>
            <span className="sep">·</span>
            <span className="last-result">
              已释放 <strong>{formatBytes(lastFreed)}</strong>
              {lastFailed > 0 && <span className="error"> ({lastFailed} 个失败)</span>}
            </span>
          </>
        )}
      </div>

      <div className="action-bar-right">
        {hasSelection ? (
          <>
            <span className="selection-summary">
              已选 <strong>{selectedCount}</strong> 个目录 ·{' '}
              <strong>{formatBytes(selectedSize)}</strong>
            </span>
            <button className="link-btn" onClick={onClearSelection} disabled={cleaning}>
              取消选择
            </button>
            <button className="danger" onClick={onCleanClick} disabled={cleaning}>
              清理选中
            </button>
          </>
        ) : (
          <span className="action-bar-hint muted">勾选要清理的目录后，这里会出现「清理选中」</span>
        )}
      </div>
    </footer>
  );
}
