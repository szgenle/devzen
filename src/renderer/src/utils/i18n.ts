/**
 * 极简 i18n：覆盖应用内所有用户可见文案。
 * 新增语言只需添加一个 Record 即可。
 */
import type { Lang } from './preferences';

const zh: Record<string, string> = {
  // --- 通用 ---
  appName: 'DevZen',
  settings: '首选项',
  back: '返回',
  cancel: '取消',
  confirm: '确认',
  save: '保存',

  // --- 首页 ---
  homeWelcome: '清理你的 Dev 目录',
  homeTagline: '扫描项目目录，一键清理构建产物，释放磁盘空间。',
  homePathLabel: '扫描目录',
  homeScan: '开始扫描',
  homeTip: '仅清理可恢复的构建产物（node_modules, target, build 等），不会删除源代码。',
  homeHistoryTitle: '你的扫描历史',
  homeHistoryTagline: '点击条目可直接查看上次结果；清理是低频操作，重扫请按需触发。',
  homeView: '查看',
  homeRescan: '重新扫描',
  homeRemove: '从历史中移除',
  homeScanNew: '扫描新目录',
  homeChangeDir: '换个目录',
  homeLoading: '加载中…',

  // --- 扫描 ---
  scanTitle: '正在扫描…',
  scanDirs: '已扫描目录',
  scanFound: '发现项目',

  // --- 结果 ---
  tabOverview: '概览',
  tabCleanup: '清理',
  rescanBtn: '重新扫描',
  viewList: '列表',
  viewCard: '卡片',
  scannedAtPrefix: '扫描于',

  // --- 清理 ---
  cleanSelected: '清理选中',
  clearSelection: '取消选择',
  selectHint: '勾选要清理的目录后，这里会出现「清理选中」',
  projects: '项目',
  cleanable: '可清理',
  freed: '已释放',
  failed: '个失败',
  selectedDirs: '已选',
  dirs: '个目录',

  // --- 确认弹窗 ---
  confirmTitle: '确认清理',
  confirmMsg: '以下目录将被永久删除，确认继续？',
  confirmBtn: '确认清理',

  // --- 设置 ---
  settingsTitle: '首选项',
  settingsTheme: '主题',
  settingsLang: '语言',
  themeSystem: '跟随系统',
  themeDark: '深色',
  themeLight: '浅色',
  langZh: '中文',
  langEn: 'English',

  // --- 详情面板 ---
  detailCategory: '分类',
  detailPath: '路径',
  detailEcosystem: '生态',
  detailCleanables: '可清理',
  detailMeta: '元信息'
};

const en: Record<string, string> = {
  appName: 'DevZen',
  settings: 'Preferences',
  back: 'Back',
  cancel: 'Cancel',
  confirm: 'Confirm',
  save: 'Save',

  homeWelcome: 'Clean Up Your Dev Directory',
  homeTagline: 'Scan project directories and clean build artifacts to free disk space.',
  homePathLabel: 'Scan dir',
  homeScan: 'Start Scan',
  homeTip: 'Only recoverable build artifacts (node_modules, target, build, etc.) will be cleaned. Source code is never deleted.',
  homeHistoryTitle: 'Scan History',
  homeHistoryTagline: 'Click an entry to view previous results; rescan on demand.',
  homeView: 'View',
  homeRescan: 'Rescan',
  homeRemove: 'Remove from history',
  homeScanNew: 'Scan new directory',
  homeChangeDir: 'Change',
  homeLoading: 'Loading…',

  scanTitle: 'Scanning…',
  scanDirs: 'Dirs scanned',
  scanFound: 'Projects found',

  tabOverview: 'Overview',
  tabCleanup: 'Cleanup',
  rescanBtn: 'Rescan',
  viewList: 'List',
  viewCard: 'Card',
  scannedAtPrefix: 'Scanned',

  cleanSelected: 'Clean Selected',
  clearSelection: 'Deselect',
  selectHint: 'Select directories to clean, then "Clean Selected" appears here',
  projects: 'Projects',
  cleanable: 'Cleanable',
  freed: 'Freed',
  failed: 'failed',
  selectedDirs: 'Selected',
  dirs: 'dirs',

  confirmTitle: 'Confirm Cleanup',
  confirmMsg: 'The following directories will be permanently deleted. Continue?',
  confirmBtn: 'Clean Now',

  settingsTitle: 'Preferences',
  settingsTheme: 'Theme',
  settingsLang: 'Language',
  themeSystem: 'System',
  themeDark: 'Dark',
  themeLight: 'Light',
  langZh: '中文',
  langEn: 'English',

  detailCategory: 'Category',
  detailPath: 'Path',
  detailEcosystem: 'Ecosystem',
  detailCleanables: 'Cleanable',
  detailMeta: 'Metadata'
};

const messages: Record<Lang, Record<string, string>> = { zh, en };

export type Messages = Record<string, string>;
export type MessageKey = keyof typeof zh;

export function getMessages(lang: Lang): Messages {
  return messages[lang] ?? messages.zh;
}
