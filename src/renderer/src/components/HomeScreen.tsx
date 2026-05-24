import { shortenPath, formatRelative, formatBytes } from '../utils/format';
import type { HistoryEntry } from '../utils/storage';

interface Props {
  rootDir: string | null;
  history: HistoryEntry[];
  onPickDir: () => void;
  onScan: () => void;
  onViewEntry: (entry: HistoryEntry) => void;
  onRescanEntry: (entry: HistoryEntry) => void;
  onRemoveEntry: (rootDir: string) => void;
}

/**
 * 首页：
 *  - 没有任何扫描历史时，保持原来的居中欢迎卡片（弹窗式引导首次扫描）。
 *  - 有历史时，改为列表式：上方简单介绍 + 历史路径条目（可查看/重扫/删除），
 *    底部提供「扫描新目录」按钮。这样清理这种低频操作不会强制每次都走扫描流程。
 */
export function HomeScreen({
  rootDir,
  history,
  onPickDir,
  onScan,
  onViewEntry,
  onRescanEntry,
  onRemoveEntry
}: Props) {
  if (history.length === 0) {
    return <WelcomeCard rootDir={rootDir} onPickDir={onPickDir} onScan={onScan} />;
  }

  return (
    <div className="home-screen home-screen--list">
      <div className="home-list-card">
        <div className="home-list-head">
          <div>
            <div className="home-brand">⌬ DevZen</div>
            <h1 className="home-list-title">你的扫描历史</h1>
            <p className="home-list-tagline muted">
              点击条目可直接查看上次结果；清理是低频操作，重扫请按需触发。
            </p>
          </div>
        </div>

        <ul className="history-list">
          {history.map((entry) => {
            const totalCleanable = entry.projects.reduce((s, p) => s + p.cleanableSize, 0);
            return (
              <li
                key={entry.rootDir}
                className="history-item"
                onClick={() => onViewEntry(entry)}
                title="点击查看上次扫描结果"
              >
                <div className="history-item-main">
                  <div className="history-item-path" title={entry.rootDir}>
                    {shortenPath(entry.rootDir, 64)}
                  </div>
                  <div className="history-item-meta muted">
                    {entry.projects.length} 个项目 · 可清理 {formatBytes(totalCleanable)} ·
                    上次扫描 {formatRelative(entry.scannedAt)}
                  </div>
                </div>
                <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="link-btn" onClick={() => onViewEntry(entry)}>
                    查看
                  </button>
                  <button className="link-btn" onClick={() => onRescanEntry(entry)}>
                    重新扫描
                  </button>
                  <button
                    className="icon-btn history-remove"
                    onClick={() => onRemoveEntry(entry.rootDir)}
                    title="从历史中移除"
                    aria-label="从历史中移除"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="home-list-foot">
          <div className="home-path">
            <span className="home-path-label">扫描新目录</span>
            <span className="home-path-value" title={rootDir ?? ''}>
              {rootDir ? shortenPath(rootDir, 50) : '加载中…'}
            </span>
            <button className="link-btn" onClick={onPickDir}>
              换个目录
            </button>
          </div>
          <button className="primary" onClick={onScan} disabled={!rootDir}>
            开始扫描
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 首次进入或历史被清空时的欢迎卡片：
 * 居中弹窗式引导，让用户第一眼就知道接下来要做什么。
 */
function WelcomeCard({
  rootDir,
  onPickDir,
  onScan
}: Pick<Props, 'rootDir' | 'onPickDir' | 'onScan'>) {
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
