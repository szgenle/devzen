import type { CleanResult } from '@shared/types';
import { formatBytes } from '../utils/format';
import type { Messages } from '../utils/i18n';

interface Props {
  projectCount: number;
  totalCleanable: number;
  selectedCount: number;
  selectedSize: number;
  cleaning: boolean;
  lastResults: CleanResult[] | null;
  t: Messages;
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
  t,
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
          {t.projects} <strong>{projectCount}</strong>
        </span>
        <span className="sep">·</span>
        <span>
          {t.cleanable} <strong>{formatBytes(totalCleanable)}</strong>
        </span>
        {lastResults && (
          <>
            <span className="sep">·</span>
            <span className="last-result">
              {t.freed} <strong>{formatBytes(lastFreed)}</strong>
              {lastFailed > 0 && <span className="error"> ({lastFailed} {t.failed})</span>}
            </span>
          </>
        )}
      </div>

      <div className="action-bar-right">
        {hasSelection ? (
          <>
            <span className="selection-summary">
              {t.selectedDirs} <strong>{selectedCount}</strong> {t.dirs} ·{' '}
              <strong>{formatBytes(selectedSize)}</strong>
            </span>
            <button className="link-btn" onClick={onClearSelection} disabled={cleaning}>
              {t.clearSelection}
            </button>
            <button className="danger" onClick={onCleanClick} disabled={cleaning}>
              {t.cleanSelected}
            </button>
          </>
        ) : (
          <span className="action-bar-hint muted">{t.selectHint}</span>
        )}
      </div>
    </footer>
  );
}
