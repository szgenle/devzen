import { formatBytes, shortenPath } from '../utils/format';

interface Props {
  rootDir: string | null;
  scanning: boolean;
  cleaning: boolean;
  onPickDir: () => void;
  onScan: () => void;
  onCleanClick: () => void;
  selectedCount: number;
  selectedSize: number;
}

export function Toolbar({
  rootDir,
  scanning,
  cleaning,
  onPickDir,
  onScan,
  onCleanClick,
  selectedCount,
  selectedSize
}: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="brand">⌬ DevZen</span>
        <button onClick={onPickDir} disabled={scanning || cleaning}>
          {rootDir ? '换个目录' : '选择目录'}
        </button>
        <span className="root-path" title={rootDir ?? ''}>
          {rootDir ? shortenPath(rootDir, 50) : '未选择'}
        </span>
        <button
          className="primary"
          onClick={onScan}
          disabled={!rootDir || scanning || cleaning}
        >
          {scanning ? '扫描中…' : '扫描'}
        </button>
      </div>
      <div className="toolbar-right">
        {selectedCount > 0 && (
          <span className="selection">
            已选 {selectedCount} 个目录 · {formatBytes(selectedSize)}
          </span>
        )}
        <button
          className="danger"
          onClick={onCleanClick}
          disabled={selectedCount === 0 || cleaning || scanning}
        >
          清理选中
        </button>
      </div>
    </header>
  );
}
