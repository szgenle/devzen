# 贡献指南

感谢你愿意为 DevZen 做出贡献！本文档说明了参与项目所需了解的基本流程。

## 🐛 报告 Bug

在新建 Issue 之前，请先：

1. 在 [Issues](https://github.com/szgenle/devzen/issues) 中搜索是否已有相同问题
2. 确认你的 macOS 版本和 Node.js 版本
3. 提供可复现步骤、期望行为、实际行为、截图（如适用）

## 💡 提交功能建议

新建 Issue 时请描述：

- 你想解决的问题（**为什么**比**怎么做**更重要）
- 当前你是怎么绕过的
- 你期望的交互形态

不要直接提交大改动而没先讨论；过大的 PR 通常需要先在 Issue 里达成共识。

## 🔧 本地开发

### 环境准备

- macOS 12+
- Node.js 20+
- npm 10+

```bash
git clone https://github.com/szgenle/devzen.git
cd devzen
npm install
npm run dev
```

### 提交前检查

请确保以下命令通过：

```bash
npm run typecheck     # 类型检查（main + renderer 两侧）
```

> 注意：electron-vite 的 dev 模式 **不会** 热重载 `src/preload/` 与 `src/main/` 的代码。如果你修改了 IPC 通道、preload 暴露的 API 或主进程逻辑，需要停掉 `npm run dev` 重启。

## 📝 代码规范

- **TypeScript 严格模式**：禁用 `any`，必要时使用 `unknown` + 类型守卫
- **注释语言**：源码内注释统一用**中文**，与现有风格保持一致
- **目录约定**：
  - `src/main/` — Electron 主进程（仅依赖 Node.js 内置模块 + electron）
  - `src/preload/` — contextBridge，**只暴露最小必要 API**
  - `src/renderer/` — React 渲染层（不能直接 require Node 模块）
  - `src/shared/` — 主/渲染共享类型与 IPC 通道枚举
- **国际化**：渲染层文案统一走 `src/renderer/src/utils/i18n.ts`，新增 key 时**必须同时补齐 zh / en 两份**
- **安全红线**：任何文件系统写操作必须经过 `ensureInsideHome` / 路径白名单校验，不得跟随符号链接

## 🌳 分支与提交

- 主分支为 `main`，所有 PR 合入此分支
- Commit message 推荐使用 [Conventional Commits](https://www.conventionalcommits.org/)：
  - `feat: 新功能`
  - `fix: 修 bug`
  - `refactor: 重构`
  - `docs: 文档`
  - `chore: 构建/依赖`
- 一个 PR 聚焦一件事，避免把无关重构和功能改动混在一起

## ✅ Pull Request 流程

1. Fork 仓库并基于最新 `main` 创建特性分支：`git checkout -b feat/your-feature`
2. 提交修改并推送到你的 fork
3. 在 GitHub 上发起 PR，描述：**做了什么**、**为什么这么做**、**怎么验证**
4. 等待 review 并响应 comment

## 📜 协议

提交贡献即代表你同意以 [MIT License](./LICENSE) 授权你的代码。
