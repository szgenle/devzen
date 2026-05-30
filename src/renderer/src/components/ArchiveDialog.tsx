import { useEffect, useState } from 'react';
import type { ProjectDirtyInfo, ProjectInfo } from '@shared/types';
import type { Messages } from '../utils/i18n';

interface Props {
  project: ProjectInfo;
  t: Messages;
  /** 关闭对话框（仅在非进行中状态下可调） */
  onClose: () => void;
  /** 归档成功；上层负责刷新归档列表与项目列表 */
  onArchived: (freedBytes: number) => void;
}

type Phase = 'checking' | 'ready' | 'archiving' | 'error';

/**
 * 归档项目对话框。
 *
 * 流程：
 *  1. 打开后立即调用 checkProjectDirty 检测脏状态（脏 = 未提交 / 未跟踪 / 未推送）
 *  2. 干净项目：单按钮"确认归档"
 *  3. 脏项目：主按钮置灰提示先 commit/push；提供"强制归档"次级链接作为逃生口
 *  4. 执行 archiveProject(path, force) 后回调 onArchived
 *
 * 失败信息直接打印在弹窗内，便于用户判断是不是因为脏状态被拦截了。
 */
export function ArchiveDialog({ project, t, onClose, onArchived }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [dirty, setDirty] = useState<ProjectDirtyInfo | null>(null);
  const [errMsg, setErrMsg] = useState<string>('');

  // 打开即检测
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await window.devzen.checkProjectDirty(project.path);
        if (cancelled) return;
        setDirty(info);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setErrMsg((e as Error).message);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.path]);

  const isDirty = !!(
    dirty &&
    (dirty.hasUncommitted || dirty.hasUntrackedNonIgnored || dirty.hasUnpushed)
  );

  const run = async (force: boolean) => {
    setPhase('archiving');
    setErrMsg('');
    try {
      const res = await window.devzen.archiveProject(project.path, force);
      if (res.success) {
        onArchived(res.freedBytes);
      } else {
        setErrMsg(res.error ?? 'unknown error');
        setPhase('error');
      }
    } catch (e) {
      setErrMsg((e as Error).message);
      setPhase('error');
    }
  };

  const disabled = phase === 'archiving' || phase === 'checking';

  return (
    <div className="modal-mask" onClick={disabled ? undefined : onClose}>
      <div className="modal archive-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t.archiveTitle.replace('{name}', project.name)}</h3>

        <div className="archive-body">
          <p className="muted" style={{ whiteSpace: 'pre-line' }}>{t.archiveDescClean}</p>

          {project.gitRemote && (
            <p className="archive-remote">
              <span className="muted">{t.archiveDescRemote}</span>{' '}
              <code>{project.gitRemote}</code>
            </p>
          )}

          {phase === 'checking' && <p className="muted">{t.archiveChecking}</p>}

          {phase !== 'checking' && isDirty && dirty && (
            <div className="warn-block">
              <strong>{t.archiveDirtyTitle}</strong>
              <pre className="archive-dirty-detail">{dirty.detail}</pre>
              <span className="muted">{t.archiveDirtyHint}</span>
            </div>
          )}

          {errMsg && <div className="archive-error">{errMsg}</div>}
        </div>

        <div className="modal-actions archive-actions">
          <button onClick={onClose} disabled={phase === 'archiving'}>
            {t.cancel}
          </button>
          {phase !== 'checking' && !isDirty && (
            <button className="danger" onClick={() => run(false)} disabled={disabled}>
              {phase === 'archiving' ? t.archiving : t.archiveConfirm}
            </button>
          )}
          {phase !== 'checking' && isDirty && (
            <button className="danger" onClick={() => run(true)} disabled={disabled}>
              {phase === 'archiving' ? t.archiving : t.archiveForceConfirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
