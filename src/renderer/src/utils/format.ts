/** 字节数 → 易读字符串 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** 时间戳 → "n 天前" / "刚刚" */
export function formatRelative(ts: number | null): string {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const day = 24 * 3600 * 1000;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 个月前`;
  return `${Math.floor(diff / (365 * day))} 年前`;
}

/** 截断长路径，保留首尾 */
export function shortenPath(p: string, max = 60): string {
  if (p.length <= max) return p;
  const head = p.slice(0, Math.floor(max / 2) - 2);
  const tail = p.slice(p.length - Math.floor(max / 2) + 1);
  return `${head}…${tail}`;
}
