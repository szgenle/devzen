# DevZen

> 面向开发者的本地项目管理工具：扫描 Dev 目录、清理构建产物、安全卸载 GitHub 项目。

## ✨ 当前 MVP

- 选择任意 Dev 根目录（例如 `~/Dev`），递归扫描所有项目
- 通过 ecosystem marker file 识别项目类型（Node / Rust / Go / Python / Java / Xcode / SwiftPM）
- 自动汇总每个项目的可清理目录及其大小：`node_modules`、`target`、`.venv`、`build`、`DerivedData` 等
- 勾选 + 二次确认即可一键清理，安全删除限定在用户家目录、并对目录名做白名单兜底
- 清理后自动重扫，状态栏显示本次释放空间

## 🧱 技术栈

- Electron + electron-vite
- React 18 + TypeScript
- 主进程：Node.js fs/path 完成扫描与清理，零三方依赖（运行期仅 `electron-store` 占位，后续可移除）

## 🚀 开发

```bash
# 安装依赖（首次需要联网下载 Electron 二进制，可能较慢）
npm install

# 启动开发服务（自动打开 DevZen 窗口）
npm run dev

# 类型检查
npm run typecheck

# 打包 macOS
npm run dist:mac
```

## 📐 目录结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 应用入口、BrowserWindow
│   ├── ipc/           # IPC 路由
│   └── core/
│       ├── markers.ts # 各生态 marker / 可清理目录定义
│       ├── scanner.ts # 递归扫描 + 项目识别 + 大小统计
│       └── cleaner.ts # 物理删除 + 安全校验
├── preload/           # contextBridge 暴露 window.devzen
├── renderer/          # React 渲染层
│   └── src/
│       ├── App.tsx
│       ├── components/
│       └── utils/
└── shared/            # 主/渲染共享类型与 IPC 通道名
```

## 🛣 路线图（PROJECT.md 详）

- [x] **MVP**：Dev 目录扫描 + 构建产物清理
- [ ] GitHub 项目管理：识别 git remote，安全卸载（删本地保远程），随时重新 clone
- [ ] 项目元信息：标签、描述、磁盘占用趋势
- [ ] LLM 智能分析：自动生成项目描述、活跃度判定、清理建议

## 🔒 安全策略

- 只删除标准的、可重建的构建产物目录（白名单）
- 仅允许操作用户家目录内的路径
- 所有删除操作必须经渲染层弹窗二次确认
- 不跟随符号链接，避免穿透到家目录之外

## License

MIT © szgenle
