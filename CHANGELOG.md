# Changelog

本项目所有重要变更记录于此文件，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **清理过程支持取消**：清理进度弹窗新增「取消」按钮，点击后立即中断后续目录的清理（当前正在删除的目录会先完成，避免半删状态），已完成的删除结果保留
- **macOS 权限失败主动引导**：清理遇到 `EPERM` / `EACCES` 权限错误时，弹窗顶部显示引导横幅，macOS 上提供「去开启权限」按钮一键跳转系统「完全磁盘访问权限」设置面板
- **macOS entitlements 配置**：新增 `build/entitlements.mac.plist`，签名后将允许应用访问用户家目录下的文件（未签名开发版仍需手动在系统设置中授权）

### 修复

- 修复 macOS 打包版清理 `node_modules` 等含只读文件的目录时静默失败的问题：权限重试逻辑从仅 Windows 生效改为基于错误码（`EPERM` / `EACCES` / `ENOTEMPTY`）跨平台触发

## [0.3.2] - 2026-07-05

聚焦**清理体验升级**与**多平台项目识别增强**：新增清理进度实时反馈弹窗，优化清理完成后的界面停留与数据同步逻辑，并支持多平台项目中一级子目录生态的自动嗅探。

### 新增

- **清理进度实时反馈**：新增 `CleanProgressDialog` 弹窗组件，逐目录展示清理进度与结果状态，支持汇总统计
  - `cleanDirectories` 新增 `onProgress` 回调，IPC 主进程转发清理进度事件给渲染进程
  - 预加载脚本添加 `onCleanProgress` 事件订阅接口
  - 国际化新增清理进度弹窗相关中英文文案
- **多平台多子目录生态识别**：扫描器在根目录含 `.git` 但无生态 marker 时，自动向一级子目录嗅探生态（如 `android/`、`godot/` 子目录），扩展清理目录的识别范围

### 修复

- 清理完成后不再自动退出详情子视图，保持用户停留在当前界面查看清理结果

### 变更

- 清理视图数据同步逻辑优化：根据 `cleanupView` / `cleanupSnapshot` 优先选择数据源，清理完成后同步刷新快照、移除已完成项
- 项目名交互优化：将项目名前的文件夹图标按钮替换为整体可点击的项目名文本，悬浮时显示主题色下划线，简化 DOM 结构

## [0.3.1] - 2026-05-30

Windows 多盘场景下"扫得了却操作不了"的彻底修复版。围绕**清理 / 归档 / 冷备 / 恢复 / 打开**整条链路，统一了路径安全准入策略，去除了对用户家目录（`os.homedir()`）的硬编码假设。

### 修复

- **Windows 多驱动器场景全面兑现**：以 Android 开发者常见的 `D:\workspace\...`、`E:\code\...` 等非 C 盘项目为代表的合法路径，此前因 cleaner / archiver / bundler 各自硬卡 home 目录，被一律拒绝执行；现已统一改为「家目录 ∪ 历史扫描根」的并集准入，跨盘符场景全部放行
  - `cleaner`：清理动作改为"项目根 + 白名单目录名"双重准入，跨盘项目可正常释放空间
  - `archiver` / `bundler`：归档、打包冷备、从冷备恢复三条主流程同步统一准入
  - `ipc.openWithEditor` / `openWithTerminal`：跨盘项目可正常一键打开编辑器与终端
- **Windows 清理鲁棒性升级**：补齐 `node_modules` / `.gradle` 等深层目录在 Windows 上的删除短板
  - 自动应用 `\\?\` 长路径前缀，绕过 MAX_PATH=260 限制
  - 首次失败时递归清除只读属性（Gradle / npm 缓存常见）后重试一次
  - `fs.rm` 启用 `maxRetries` / `retryDelay`，缓解被 IDE / 杀软短暂占用导致的 EBUSY
  - `freedBytes` 改为「删除前后实测差值」，避免显示已清理但磁盘没动的错觉
- `scanner` 改用 `os.homedir()` 替代 `process.env.HOME`，让"扫描入口为家目录时自动跳过系统目录"在 Windows 上也能正确生效（Windows 走的是 `USERPROFILE`，原本一直未触发）

### 重构

- 新增 `src/main/core/path-safety.ts` 集中维护路径准入逻辑，cleaner / archiver / bundler / ipc 复用同一套实现，杜绝多模块各写一套、漏改一处即埋雷的情况

## [0.3.0] - 2026-05-29

聚焦**冷备包与归档体系成熟化**：将 v0.1.0 引入的归档系统升级为可打包冷备 + 删除原目录 + 远端可恢复的完整闭环；归档界面补齐分组与双视图；同步打通 CI 自动构建发布流水线，并修掉若干 Windows 平台硬伤。

### 新增

- **冷备包系统（核心新能力）**
  - 新增主进程 `bundler` / `bundle-store`，可将归档项目打包为冷备包（含元信息），存放路径可在设置中自定义
  - 归档流程升级为「打包 → 删除原目录」的安全闭环，原项目目录被冷备包接管，不再占用工作目录
  - 新增 `BundleProgressDialog` / `RestoreBundleDialog`，提供打包进度反馈与从冷备包恢复项目的对话框
  - 设置页支持配置冷备包目录
- **归档界面增强**
  - 列表 / 卡片双视图切换，卡片网格自适应宽度
  - 归档项目按标签自动分组渲染（个人 / 公司 / 开源 clone 等）
  - 概览页自动排除已归档项目，避免重复展示
- **未提交修改筛选**：过滤栏新增「只显示有未提交修改」开关
- **单项目 git dirty 状态轻量刷新**：详情面板可单独刷新某一项目的 git 状态，无需重扫整库
- **使用说明入口**：首页新增「使用说明」按钮，调用主进程在系统浏览器中打开文档
- **CI 自动打包发布**：新增 GitHub Actions 工作流，tag 推送后自动构建并发布产物

### 变更

- 优化清理按钮的交互流程
- 优化 `.warn-block` 样式与本地项目警告列表的滚动表现
- 调整归档卡片网格宽度与中间区域最大容器宽度，视觉更协调

### 修复

- **Windows 平台**：归档 / 清理操作因 `HOME` 环境变量缺失而被安全检查误拒
- **Windows / Linux**：移除多余的顶部菜单栏，与桌面平台习惯一致
- 扩展「允许打开的项目根目录」校验范围，避免合法路径被拦截

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

[Unreleased]: https://github.com/szgenle/devzen/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/szgenle/devzen/releases/tag/v0.3.2
[0.3.1]: https://github.com/szgenle/devzen/releases/tag/v0.3.1
[0.3.0]: https://github.com/szgenle/devzen/releases/tag/v0.3.0
[0.2.0]: https://github.com/szgenle/devzen/releases/tag/v0.2.0
[0.1.0]: https://github.com/szgenle/devzen/releases/tag/v0.1.0
