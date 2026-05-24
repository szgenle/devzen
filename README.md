# DevZen

> 让使用 AI 编程的人，对自己的项目一目了然。

先看见，再行动。DevZen 不是另一个“清理工具”，而是你本地项目的清单：哪些项目、来自哪里、占了多少空间、哪些可以安全删除。

## ✨ 当前 MVP

- **默认扫描主目录**（例如 `~`），并智能跳过系统目录（Library / Applications / Downloads …）
- 通过 ecosystem marker file 识别项目类型（Node / Rust / Go / Python / Java / Xcode / SwiftPM）
- **项目信息一目了然**：名称 / 一句话描述（读 package.json description 或 README） / 技术栈 / **来源**（GitHub / 远程 / 仅本地） / 可清理大小 / 上次修改时间 / **Git 是否有未提交修改**
- 勾选 + 二次确认即可一键清理构建产物，仅限定在用户家目录、目录名白名单、不跟随符号链接
- **对“仅本地”项目强提醒**：删除构建产物前会明确告诉你“这些项目没有远程备份”
- 清理后自动重扫，状态栏显示本次释放空间

## 👥 目标用户

非计算机科班出身、但通过 AI 编程开始写代码和接触 GitHub 的人：他们不一定知道 `node_modules` 能删、不一定记得自己 clone 过哪些项目、也可能用 AI 生成了项目但还没推到 GitHub。DevZen 由一名有 20 年经验的开发者发起，"项目多且乱" 这个痛点他自己也同样需要解决。

## 🧱 技术栈

- Electron + electron-vite
- React 18 + TypeScript
- 主进程仅依赖 Node.js 内置模块进行扫描与清理

## 🚀 开发

```bash
# 安装依赖（首次需联网下载 Electron 二进制，可能较慢）
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
│       ├── markers.ts # 生态 marker / 可清理目录 / 系统目录黑名单
│       ├── scanner.ts # 扫描 + 识别 + 描述提取 + git 状态检测
│       └── cleaner.ts # 物理删除 + 安全校验
├── preload/           # contextBridge 暴露 window.devzen
├── renderer/          # React 渲染层
│   └── src/
│       ├── App.tsx
│       ├── components/
│       └── utils/
└── shared/            # 主/渲染共享类型与 IPC 通道名
```

## 🛣 路线图

- [x] **MVP**：项目发现 + 构建产物清理 + 来源区分
- [ ] GitHub 项目安全卸载：删本地保远程，随时一键 clone 回来
- [ ] LLM 智能分析：自动生成项目描述、活跃度判定、清理建议
- [ ] 项目分类与标签：个人 / 公司 / 开源 clone

## 🔒 安全策略

- 只删除标准的、可重建的构建产物目录（白名单）
- 仅允许操作用户家目录内的路径
- 所有删除操作必须经渲染层弹窗二次确认
- **仅本地项目额外强提醒**，避免不懂技术的用户误以为可恢复
- 不跟随符号链接，避免穿透到家目录之外

## License

MIT © szgenle
