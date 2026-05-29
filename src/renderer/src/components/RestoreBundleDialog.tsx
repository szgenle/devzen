import { useState } from 'react';
import type { BundleRecord } from '@shared/types';
import type { Messages } from '../utils/i18n';
import { shortenPath, formatBytes, formatRelative } from '../utils/format';

interface Props {
  bundle: BundleRecord;
  t: Messages;
  /** 恢复执行；调用方负责调 IPC、显示进度、关闭对话框 */
  onConfirm: (targetDir: string) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * 从冷备包恢复时的目标目录选择对话框：
 *  - 默认显示 originalPath，可一键采用
 *  - 也可以「选其他位置」走系统目录对话框（pickDir）
 *  - 不在这里做存在/为空校验，主进程恢复入口会拒绝并把错误传回
 */
export function RestoreBundleDialog({ bundle, t, onConfirm, onCancel, busy }: Props) {
  const [targetDir, setTargetDir] = useState<string>(bundle.originalPath);

  const useOriginal = () => setTargetDir(bundle.originalPath);

  const pickOther = async () => {
    const dir = await window.devzen.pickDir(t.restoreBundleDialogTitle);
    if (dir) setTargetDir(dir);
  };

  const isOriginal = targetDir === bundle.originalPath;

  return (
    <div className="modal-mask">
      <div className="modal restore-bundle-modal" role="dialog" aria-modal="true">
        <h3 className="modal-title">{t.restoreBundleDialogTitle}</h3>

        <div className="restore-bundle-row">
          <span className="restore-bundle-key">{t.restoreBundleSourceLabel}</span>
          <div className="restore-bundle-val">
            <div title={bundle.bundlePath}>{shortenPath(bundle.bundlePath, 56)}</div>
            <div className="muted small">
              {formatBytes(bundle.sizeBytes)} ·{' '}
              {formatRelative(bundle.bundledAt, t._lang as 'zh' | 'en')}
            </div>
          </div>
        </div>

        <div className="restore-bundle-row">
          <span className="restore-bundle-key">{t.restoreBundleOriginalLabel}</span>
          <div className="restore-bundle-val muted" title={bundle.originalPath}>
            {shortenPath(bundle.originalPath, 56)}
          </div>
        </div>

        <div className="restore-bundle-row">
          <span className="restore-bundle-key">{t.restoreBundleTargetLabel}</span>
          <div className="restore-bundle-val">
            <input
              className="restore-bundle-input"
              type="text"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              spellCheck={false}
            />
            <div className="restore-bundle-actions-row">
              <button
                className="link-btn"
                onClick={useOriginal}
                disabled={isOriginal}
                title={t.restoreBundleUseOriginal}
              >
                {t.restoreBundleUseOriginal}
              </button>
              <button className="link-btn" onClick={pickOther}>
                {t.restoreBundlePickOther}
              </button>
            </div>
          </div>
        </div>

        <div className="muted small restore-bundle-hint">{t.restoreBundleHint}</div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          <button
            className="primary"
            onClick={() => onConfirm(targetDir)}
            disabled={busy || !targetDir.trim()}
          >
            {busy ? t.restoreBundleVerifying : t.restoreBundleConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
