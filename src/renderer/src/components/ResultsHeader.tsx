import { shortenPath, formatRelative } from '../utils/format';
import type { ViewMode } from '../App';
import type { Messages } from '../utils/i18n';

type ResultsTab = 'overview' | 'cleanup';

interface Props {
  rootDir: string | null;
  cleaning: boolean;
  /** 上次扫描完成的时间戳，用于展示数据新鲜度 */
  scannedAt: number | null;
  activeTab: ResultsTab;
  viewMode: ViewMode;
  t: Messages;
  onViewModeChange: (mode: ViewMode) => void;
  onTabChange: (tab: ResultsTab) => void;
  onBackHome: () => void;
  onRescan: () => void;
}

/**
 * 结果页顶部 header：
 * 左侧"← 首页"返回入口 + 品牌；中间 Tab 切换（概览/清理）；右侧扫描路径 + 重新扫描。
 */
export function ResultsHeader({
  rootDir,
  cleaning,
  scannedAt,
  activeTab,
  viewMode,
  t,
  onViewModeChange,
  onTabChange,
  onBackHome,
  onRescan
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
        <span className="brand">⌬ DevZen</span>
      </div>
      <div className="results-header-center">
        <nav className="results-tabs">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onTabChange('overview')}
          >
            {t.tabOverview}
          </button>
          <button
            className={`tab-btn ${activeTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => onTabChange('cleanup')}
          >
            {t.tabCleanup}
          </button>
        </nav>
      </div>
      <div className="results-header-right">
        {activeTab === 'overview' && (
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
        )}
        <span className="root-path" title={rootDir ?? ''}>
          {rootDir ? shortenPath(rootDir, 50) : ''}
        </span>
        {scannedAt && (
          <span className="scanned-at" title={new Date(scannedAt).toLocaleString()}>
            {formatRelative(scannedAt)}
          </span>
        )}
        <button onClick={onRescan} disabled={cleaning} title={t.rescanTitle}>
          {t.rescanBtn}
        </button>
      </div>
    </header>
  );
}
