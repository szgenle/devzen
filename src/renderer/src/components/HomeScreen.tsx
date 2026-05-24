import { shortenPath } from '../utils/format';

interface Props {
  rootDir: string | null;
  onPickDir: () => void;
  onScan: () => void;
}

/**
 * 首页：欢迎屏。
 * 用一张垂直居中的卡片承载品牌、说明、路径选择与主操作，
 * 让用户第一眼就清楚"接下来要做什么"。
 */
export function HomeScreen({ rootDir, onPickDir, onScan }: Props) {
  return (
    <div className="home-screen">
      <div className="home-card">
        <div className="home-brand">⌬ DevZen</div>
        <h1 className="home-title">让你的项目目录一目了然</h1>
        <p className="home-tagline">
          扫描你的项目目录，DevZen 会列出你有哪些项目、来自哪里、占了多少空间，
          并准确告诉你哪些构建产物可以安全删除。
        </p>

        <div className="home-path">
          <span className="home-path-label">扫描路径</span>
          <span className="home-path-value" title={rootDir ?? ''}>
            {rootDir ? shortenPath(rootDir, 60) : '加载中…'}
          </span>
          <button className="link-btn" onClick={onPickDir}>
            换个目录
          </button>
        </div>

        <button className="primary home-cta" onClick={onScan} disabled={!rootDir}>
          开始扫描
        </button>

        <div className="home-foot muted">
          仅在你点击「清理选中」后才会删除文件，扫描阶段不会动你的任何数据。
        </div>
      </div>
    </div>
  );
}
