import { shortenPath, formatRelative } from '../utils/format';
import type { ViewMode } from '../App';

type ResultsTab = 'overview' | 'cleanup';

interface Props {
  rootDir: string | null;
  cleaning: boolean;
  /** 上次扫描完成的时间戳，用于展示数据新鲜度 */
  scannedAt: number | null;
  activeTab: ResultsTab;
  viewMode: ViewMode;
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
          title="返回首页"
        >
          ← 首页
        </button>
        <span className="brand">⌬ DevZen</span>
      </div>
      <div className="results-header-center">
        <nav className="results-tabs">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onTabChange('overview')}
          >
            概览
          </button>
          <button
            className={`tab-btn ${activeTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => onTabChange('cleanup')}
          >
            清理
          </button>
        </nav>
      </div>
      <div className="results-header-right">
        {activeTab === 'overview' && (
          <div className="view-toggle" title="切换视图">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onViewModeChange('list')}
              title="列表视图"
            >
              ☰
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
              onClick={() => onViewModeChange('card')}
              title="卡片视图"
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
        <button onClick={onRescan} disabled={cleaning} title="重新扫描当前目录">
          重新扫描
        </button>
      </div>
    </header>
  );
}
