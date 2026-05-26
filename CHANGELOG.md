# Changelog

本项目所有重要变更记录于此文件，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-05-27

聚焦**跨平台支持**与**长期使用体验**：兑现 v0.1.0 路线图中的 Windows 支持承诺，将扫描历史与窗口状态升级为主进程持久化，并在概览/清理两端补齐分组、定位等交互细节。

### 新增

- **Windows 平台支持**（兑现 v0.1.0 路线图）
  - 跨平台「打开编辑器/终端」：主进程根据 `process.platform` 选择 `open` / `start` / `xdg-open`，在 Windows / Linux 下也可调用 VS Code、Cursor、终端等
  - 新增 `package:win` / `dist:win` 打包脚本，支持构建 Windows 安装产物
- **扫描历史主进程化**：扫描结果由主进程 `history-store` 落盘到 `userData/devzen/history.json`，应用重启后历史不丢失，渲染层与清理视图实时同步
- **窗口状态持久化**：主进程 `window-state` 模块记录窗口大小与位置，下次启动自动恢复
- **概览页按标签分组**：可按个人 / 公司 / 开源 clone 等标签自动分组渲染，便于在大量项目中快速聚焦
- **清理列表「定位项目」按钮**：每行新增快速查看按钮，一键定位到对应项目以确认清理对象
- **Godot 项目支持**：扫描器识别 Godot 项目特征文件，清理器纳入对应构建产物白名单

### 变更

- 优化项目标签区域的布局与样式，标签密度与对齐更协调
- 替换/精简应用图标资源
- 不再将 `package-lock.json` 纳入版本管理（统一通过 `npm install` 生成）

### 修复

- 修复跨平台下「用开发工具打开项目」在非 macOS 环境的兼容性问题（路径转义、CLI 映射）

## [0.1.0] - 2026-05-24

首个公开版本。

### 新增

- **项目扫描**：默认扫描用户家目录，按 ecosystem marker 自动识别 Node / Rust / Go / Python / Java / Xcode / SwiftPM 项目类型，跳过系统目录
- **项目信息聚合**：项目名 / 描述 / 技术栈 / 来源（GitHub / 远程 / 仅本地）/ 可清理大小 / 上次修改时间 / Git 未提交修改状态
- **构建产物清理**：勾选 + 二次确认一键清理，限定家目录内白名单目录，不跟随符号链接
- **仅本地项目强提醒**：删除前明确告知"无远程备份"
- **重复项目检测**：识别同一仓库的多份副本，提供对比辅助决策
- **GitHub 项目安全卸载**：删除本地保留远程信息，可一键 clone 回来
- **项目分类与标签**：个人 / 公司 / 开源 clone
- **快速启动入口**：
  - 概览页项目名前的文件夹图标按钮，一键用编辑器打开项目
  - 详情面板「快速启动」区，下拉切换编辑器/终端
  - 智能默认编辑器推断（基于 `.qoder` / `.trae` / `.cursor` / `.windsurf` / `.idea` / `.vscode` / `*.xcworkspace` 等特征文件）
  - 三级 fallback：用户最近选择 → 项目特征推断 → `Visual Studio Code`
  - 错误捕获：检测到 `Unable to find application named` 时引导用户去详情面板切换
- **归档系统**：归档/恢复不污染项目目录，元信息集中存储于 `userData/devzen/archives.json`
- **国际化**：内置中英文双语
- **应用图标**：新增 macOS 应用图标（绿色文件夹 + 放大镜），`build/icon.png` 1024×1024

### 安全

- 所有删除操作仅限用户家目录，不跟随符号链接
- 仅删除白名单中的可重建构建产物（`node_modules` / `target` / `build` / `dist` / 等）
- 渲染层弹窗二次确认每一次破坏性操作

[Unreleased]: https://github.com/szgenle/devzen/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/szgenle/devzen/releases/tag/v0.2.0
[0.1.0]: https://github.com/szgenle/devzen/releases/tag/v0.1.0
