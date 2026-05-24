import type { RestoreResult } from '@shared/types';
import type { Messages } from '../utils/i18n';

interface Props {
  result: RestoreResult;
  t: Messages;
  onClose: () => void;
  onReveal: (path: string) => void;
}

/**
 * 恢复结果对话框：成功时展示 followUpHints，失败时展示错误。
 * 单按钮关闭即可，无破坏性操作。
 */
export function RestoreResultDialog({ result, t, onClose, onReveal }: Props) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{result.success ? t.restoreSuccess : t.restoreFailed.replace('{err}', '')}</h3>
        <div className="restore-body">
          {!result.success && <p className="archive-error">{result.error}</p>}
          {result.success && (
            <>
              <p className="archive-remote">
                <code>{result.path}</code>
              </p>
              {result.followUpHints.length > 0 && (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>{t.restoreHintsTitle}</p>
                  <ul className="restore-hints">
                    {result.followUpHints.map((h) => (
                      <li key={h}>
                        <code>{h}</code>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="muted">{t.restoreHintsRevealHint}</p>
            </>
          )}
        </div>
        <div className="modal-actions">
          {result.success && (
            <button onClick={() => onReveal(result.path)}>{t.reveal}</button>
          )}
          <button className="primary" onClick={onClose}>{t.restoreCancel}</button>
        </div>
      </div>
    </div>
  );
}
