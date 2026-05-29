import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '@shared/types';

/**
 * 用户配置持久化（settings.json）。
 *
 * 当前仅承载备份目录一项，后续如需扩展（默认编辑器、隐私选项等）可继续追加字段。
 *
 * 文件位置：app.getPath('userData')/devzen/settings.json
 * 写入策略：原子 rename，避免半成品；读失败兜底为默认值。
 */

interface SettingsFile {
  version: 1;
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  backupDir: null
};

let cachePath: string | null = null;
function getStorePath(): string {
  if (cachePath) return cachePath;
  cachePath = path.join(app.getPath('userData'), 'devzen', 'settings.json');
  return cachePath;
}

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readFile(): Promise<AppSettings> {
  const file = getStorePath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as SettingsFile;
    if (parsed && parsed.settings && typeof parsed.settings === 'object') {
      return { ...DEFAULT_SETTINGS, ...parsed.settings };
    }
    return { ...DEFAULT_SETTINGS };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    if (e instanceof SyntaxError) return { ...DEFAULT_SETTINGS };
    throw e;
  }
}

async function writeFile(settings: AppSettings): Promise<void> {
  const file = getStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const data: SettingsFile = { version: 1, settings };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** 获取当前 settings（含默认值兜底） */
export function getSettings(): Promise<AppSettings> {
  return exclusive(() => readFile());
}

/** 设置备份目录，返回更新后的 settings */
export function setBackupDir(dir: string): Promise<AppSettings> {
  return exclusive(async () => {
    const curr = await readFile();
    const next: AppSettings = { ...curr, backupDir: dir };
    await writeFile(next);
    return next;
  });
}

/** 推荐的默认备份目录（不会自动创建，仅作 UI 默认值提示） */
export function getDefaultBackupDir(): string {
  return path.join(app.getPath('documents'), 'DevZenBackups');
}
