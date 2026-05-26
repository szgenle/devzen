import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, screen } from 'electron';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 820
};

let storePath: string | null = null;
function getStorePath(): string {
  if (storePath) return storePath;
  storePath = path.join(app.getPath('userData'), 'devzen', 'window-state.json');
  return storePath;
}

/** 读取保存的窗口状态，如果不存在或无效则返回默认值 */
export async function loadWindowState(): Promise<WindowState> {
  try {
    const file = getStorePath();
    const raw = await fs.readFile(file, 'utf8');
    const state = JSON.parse(raw) as WindowState;

    // 校验保存的位置是否仍在可见屏幕范围内
    if (state.x !== undefined && state.y !== undefined) {
      const visible = isPositionVisible(state.x, state.y, state.width, state.height);
      if (!visible) {
        // 位置不可见（可能外接显示器被断开），回退到默认居中
        return { width: state.width, height: state.height, isMaximized: state.isMaximized };
      }
    }

    return state;
  } catch {
    return DEFAULT_STATE;
  }
}

/** 保存窗口状态到文件 */
export async function saveWindowState(state: WindowState): Promise<void> {
  const file = getStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** 判断窗口位置是否在任何一个可见屏幕中 */
function isPositionVisible(x: number, y: number, width: number, height: number): boolean {
  const displays = screen.getAllDisplays();
  // 只要窗口中心点落在某个屏幕范围内，就认为可见
  const cx = x + width / 2;
  const cy = y + height / 2;
  return displays.some((display) => {
    const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
    return cx >= dx && cx < dx + dw && cy >= dy && cy < dy + dh;
  });
}
