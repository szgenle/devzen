import { shortenPath, formatRelative } from '../utils/format';
import type { ViewMode } from '../App';
import type { Messages } from '../utils/i18n';

interface Props {
  rootDir: string | null;
  cleaning: boolean;
  /** 上次扫描完成的时间戳，用于展示数据新鲜度 */
  scannedAt: number | null;
  viewMode: ViewMode;
  /** 是否禁用「清理」按钮（当前筛选结果中没有可清理目录时禁用） */
  cleanDisabled: boolean;
  /** 「清理」按钮 hover 提示，由父组件根据筛选状态生成 */
  cleanTitle: string;
  t: Messages;
  onViewModeChange: (mode: ViewMode) => void;
  onBackHome: () => void;
  /** 清理详情视图下传入：在「← 首页」旁渲染「← 概览」，返回入口集中在左侧 */
  onBackToOverview?: () => void;
  onRescan: () => void;
  /** 清理详情视图下不传：右侧不渲染「清理」按钮（清理入口在底部 ActionBar） */
  onClean?: () => void;
}

/**
 * 结果页顶部 header：
 * 左侧"← 首页"返回入口 + 品牌（清理详情视图下追加"← 概览"，返回按钮集中在左侧）；
 * 右侧视图切换 + 扫描路径 + 重新扫描 + 清理。
 * 「清理」按钮的作用范围由当前筛选结果决定（搜索 / 分类 / 标签等）。
 */
export function ResultsHeader({
  rootDir,
  cleaning,
  scannedAt,
  viewMode,
  cleanDisabled,
  cleanTitle,
  t,
  onViewModeChange,
  onBackHome,
  onBackToOverview,
  onRescan,
  onClean
}: Props) {
  return (
    <header className="results-header">
      <div className="results-header-left">
        <button
          className="ghost-btn back-btn"
          onClick={onBackHome}
          disabled={cleaning}
          title={t.backToHome}
        >
          {t.backHome}
        </button>
        {onBackToOverview && (
          <button
            className="ghost-btn back-btn"
            onClick={onBackToOverview}
            disabled={cleaning}
            title={t.backToOverviewTitle}
          >
            {t.backToOverview}
          </button>
        )}
        <span className="brand">⌬ DevZen</span>
      </div>
      <div className="results-header-center" />
      <div className="results-header-right">
        <div className="view-toggle" title={t.viewToggle}>
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title={t.viewList}
          >
            ☰
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
            onClick={() => onViewModeChange('card')}
            title={t.viewCard}
          >
            ▦
          </button>
        </div>
        <span className="root-path" title={rootDir ?? ''}>
          {rootDir ? shortenPath(rootDir, 50) : ''}
        </span>
        {scannedAt && (
          <span className="scanned-at" title={new Date(scannedAt).toLocaleString()}>
            {formatRelative(scannedAt, t._lang as 'zh' | 'en')}
          </span>
        )}
        <button onClick={onRescan} disabled={cleaning} title={t.rescanTitle}>
          {t.rescanBtn}
        </button>
        {onClean && (
          <button
            className="clean-btn-primary"
            onClick={onClean}
            disabled={cleaning || cleanDisabled}
            title={cleanTitle}
          >
            {cleaning ? t.cleaning : t.cleanBtn}
          </button>
        )}
      </div>
    </header>
  );
}
