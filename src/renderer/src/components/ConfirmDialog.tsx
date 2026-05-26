import type { ReactNode } from 'react';

interface Props {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 中性的次要按钮文案（如「查看列表」）；仅在与 onSecondary 一同传入时渲染。 */
  secondaryText?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 次要按钮点击回调；例如「查看列表」切到清理详情页。 */
  onSecondary?: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  secondaryText,
  confirmDisabled,
  onConfirm,
  onCancel,
  onSecondary
}: Props) {
  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>{cancelText}</button>
          {secondaryText && onSecondary && (
            <button onClick={onSecondary} disabled={confirmDisabled}>
              {secondaryText}
            </button>
          )}
          <button className="danger" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
