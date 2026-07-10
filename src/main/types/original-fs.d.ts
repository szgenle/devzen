// Electron 主进程专用：original-fs 是 Electron 提供的「未被 asar patch」的真实文件系统模块。
//
// 背景：Electron 会把 Node 的 `fs` 模块改写成 asar-aware —— 任何 `.asar` 路径都被当作
// 只读虚拟归档处理。因此对 `.asar` 文件执行 `fs.rm(..., { force: true })` 会「静默假成功」
// （返回成功但文件并未删除），导致清理含 DevZen.app 等 Electron 应用的目录时删不干净。
//
// original-fs 的 API 与 node:fs 完全一致，仅绕过 asar 虚拟层，故类型直接复用 node:fs。
declare module 'original-fs' {
  export * from 'node:fs';
}
