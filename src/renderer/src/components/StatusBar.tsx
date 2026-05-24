import type { CleanResult } from '@shared/types';
import { formatBytes } from '../utils/format';

interface Props {
  projectCount: number;
  totalCleanable: number;
  selectedSize: number;
  lastResults: CleanResult[] | null;
}

export function StatusBar({ projectCount, totalCleanable, selectedSize, lastResults }: Props) {
  const lastFreed = lastResults
    ? lastResults.filter((r) => r.success).reduce((s, r) => s + r.freedBytes, 0)
    : 0;
  const lastFailed = lastResults ? lastResults.filter((r) => !r.success).length : 0;

  return (
    <footer className="status-bar">
      <span>
        项目 <strong>{projectCount}</strong>
      </span>
      <span className="sep">·</span>
      <span>
        可清理总量 <strong>{formatBytes(totalCleanable)}</strong>
      </span>
      <span className="sep">·</span>
      <span>
        已选 <strong>{formatBytes(selectedSize)}</strong>
      </span>
      {lastResults && (
        <>
          <span className="sep">·</span>
          <span className="last-result">
            上次释放 <strong>{formatBytes(lastFreed)}</strong>
            {lastFailed > 0 && <span className="error"> ({lastFailed} 个失败)</span>}
          </span>
        </>
      )}
    </footer>
  );
}
