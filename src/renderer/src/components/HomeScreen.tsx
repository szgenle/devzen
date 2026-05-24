import { shortenPath, formatRelative, formatBytes } from '../utils/format';
import type { HistoryEntry } from '../utils/storage';
import type { Messages } from '../utils/i18n';

interface Props {
  rootDir: string | null;
  history: HistoryEntry[];
  t: Messages;
  onPickDir: () => void;
  onScan: () => void;
  onViewEntry: (entry: HistoryEntry) => void;
  onRescanEntry: (entry: HistoryEntry) => void;
  onRemoveEntry: (rootDir: string) => void;
  onOpenSettings: () => void;
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
  t,
  onPickDir,
  onScan,
  onViewEntry,
  onRescanEntry,
  onRemoveEntry,
  onOpenSettings
}: Props) {
  if (history.length === 0) {
    return <WelcomeCard rootDir={rootDir} t={t} onPickDir={onPickDir} onScan={onScan} onOpenSettings={onOpenSettings} />;
  }

  return (
    <div className="home-screen home-screen--list">
      <div className="home-list-card">
        <div className="home-list-head">
          <div>
            <div className="home-brand">⌬ DevZen</div>
            <h1 className="home-list-title">{t.homeHistoryTitle}</h1>
            <p className="home-list-tagline muted">
              {t.homeHistoryTagline}
            </p>
          </div>
          <button
            className="icon-btn settings-btn"
            onClick={onOpenSettings}
            title={t.settings}
            aria-label={t.settings}
          >
            ⚙
          </button>
        </div>

        <ul className="history-list">
          {history.map((entry) => {
            const totalCleanable = entry.projects.reduce((s, p) => s + p.cleanableSize, 0);
            return (
              <li
                key={entry.rootDir}
                className="history-item"
                onClick={() => onViewEntry(entry)}
                title={t.homeClickToView}
              >
                <div className="history-item-main">
                  <div className="history-item-path" title={entry.rootDir}>
                    {shortenPath(entry.rootDir, 64)}
                  </div>
                  <div className="history-item-meta muted">
                    {entry.projects.length} {t.overviewProjectCount} · {t.cleanable} {formatBytes(totalCleanable)} ·
                    {t.scannedAtPrefix} {formatRelative(entry.scannedAt)}
                  </div>
                </div>
                <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="link-btn" onClick={() => onViewEntry(entry)}>
                    {t.homeView}
                  </button>
                  <button className="link-btn" onClick={() => onRescanEntry(entry)}>
                    {t.homeRescan}
                  </button>
                  <button
                    className="icon-btn history-remove"
                    onClick={() => onRemoveEntry(entry.rootDir)}
                    title={t.homeRemove}
                    aria-label={t.homeRemove}
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
            <span className="home-path-label">{t.homeScanNew}</span>
            <span className="home-path-value" title={rootDir ?? ''}>
              {rootDir ? shortenPath(rootDir, 50) : t.homeLoading}
            </span>
            <button className="link-btn" onClick={onPickDir}>
              {t.homeChangeDir}
            </button>
          </div>
          <button className="primary" onClick={onScan} disabled={!rootDir}>
            {t.homeScan}
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
  t,
  onPickDir,
  onScan,
  onOpenSettings
}: Pick<Props, 'rootDir' | 'onPickDir' | 'onScan' | 't' | 'onOpenSettings'>) {
  return (
    <div className="home-screen">
      <div className="home-card">
        <div className="home-card-top">
          <div className="home-brand">⌬ DevZen</div>
          <button
            className="icon-btn settings-btn"
            onClick={onOpenSettings}
            title={t.settings}
            aria-label={t.settings}
          >
            ⚙
          </button>
        </div>
        <h1 className="home-title">{t.homeWelcome}</h1>
        <p className="home-tagline">{t.homeTagline}</p>

        <div className="home-path">
          <span className="home-path-label">{t.homePathLabel}</span>
          <span className="home-path-value" title={rootDir ?? ''}>
            {rootDir ? shortenPath(rootDir, 60) : t.homeLoading}
          </span>
          <button className="link-btn" onClick={onPickDir}>
            {t.homeChangeDir}
          </button>
        </div>

        <button className="primary home-cta" onClick={onScan} disabled={!rootDir}>
          {t.homeScan}
        </button>

        <div className="home-foot muted">
          {t.homeTip}
        </div>
      </div>
    </div>
  );
}
