import { shortenPath } from '../utils/format';

interface Props {
  rootDir: string | null;
  cleaning: boolean;
  onBackHome: () => void;
  onRescan: () => void;
}

/**
 * 结果页顶部精简 header：
 * 左侧"← 首页"返回入口 + 品牌；中间显示当前扫描路径；右侧"重新扫描"。
 * 主操作（清理选中）不放在这里，而是放到底部 ActionBar，避免顶部拥挤。
 */
export function ResultsHeader({ rootDir, cleaning, onBackHome, onRescan }: Props) {
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
        <span className="root-path" title={rootDir ?? ''}>
          {rootDir ? shortenPath(rootDir, 60) : ''}
        </span>
      </div>
      <div className="results-header-right">
        <button onClick={onRescan} disabled={cleaning} title="重新扫描当前目录">
          重新扫描
        </button>
      </div>
    </header>
  );
}
