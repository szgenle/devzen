import { useEffect, useState } from 'react';
import type { ThemeMode, Lang } from '../utils/preferences';
import type { Messages } from '../utils/i18n';

interface Props {
  theme: ThemeMode;
  lang: Lang;
  t: Messages;
  onThemeChange: (mode: ThemeMode) => void;
  onLangChange: (lang: Lang) => void;
  onBack: () => void;
}

/**
 * 首选项页面。
 * 当前提供主题、语言、冷备包备份目录三项设置。
 *
 * 备份目录字段独立从主进程 settings.json 加载与持久化，与主题/语言（localStorage）解耦。
 */
export function SettingsScreen({ theme, lang, t, onThemeChange, onLangChange, onBack }: Props) {
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.devzen
      .getSettings()
      .then((s) => {
        if (!cancelled) setBackupDir(s.backupDir);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickBackupDir = async () => {
    const dir = await window.devzen.pickBackupDir();
    if (!dir) return;
    const next = await window.devzen.setBackupDir(dir);
    setBackupDir(next.backupDir);
  };

  const reveal = () => {
    if (backupDir) window.devzen.revealInFinder(backupDir);
  };

  return (
    <div className="settings-screen">
      <div className="settings-card">
        <div className="settings-head">
          <button className="link-btn back-btn" onClick={onBack}>
            ← {t.back}
          </button>
          <h1 className="settings-title">{t.settingsTitle}</h1>
        </div>

        {/* 主题 */}
        <section className="settings-group">
          <label className="settings-label">{t.settingsTheme}</label>
          <div className="settings-options">
            {([
              ['system', t.themeSystem],
              ['dark', t.themeDark],
              ['light', t.themeLight]
            ] as [ThemeMode, string][]).map(([value, label]) => (
              <button
                key={value}
                className={`settings-option ${theme === value ? 'active' : ''}`}
                onClick={() => onThemeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 语言 */}
        <section className="settings-group">
          <label className="settings-label">{t.settingsLang}</label>
          <div className="settings-options">
            {([
              ['zh', t.langZh],
              ['en', t.langEn]
            ] as [Lang, string][]).map(([value, label]) => (
              <button
                key={value}
                className={`settings-option ${lang === value ? 'active' : ''}`}
                onClick={() => onLangChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 冷备包备份目录 */}
        <section className="settings-group">
          <label className="settings-label">{t.bundleSettingsTitle}</label>
          <div className="settings-desc muted">{t.bundleSettingsDesc}</div>
          <div className="settings-backup-row">
            <div className="settings-backup-path" title={backupDir ?? ''}>
              {loading ? t.homeLoading : backupDir ?? t.bundleSettingsNotSet}
            </div>
            <div className="settings-backup-actions">
              {backupDir && (
                <button
                  className="link-btn"
                  onClick={reveal}
                  title={t.bundleSettingsReveal}
                >
                  {t.reveal}
                </button>
              )}
              <button className="settings-option" onClick={pickBackupDir}>
                {backupDir ? t.bundleSettingsChange : t.bundleSettingsPick}
              </button>
            </div>
          </div>
          <div className="warn-block warn-soft">{t.bundleSettingsWarn}</div>
        </section>
      </div>
    </div>
  );
}
