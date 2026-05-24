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
 * 当前提供主题与语言两项设置，后续可扩展。
 */
export function SettingsScreen({ theme, lang, t, onThemeChange, onLangChange, onBack }: Props) {
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
      </div>
    </div>
  );
}
