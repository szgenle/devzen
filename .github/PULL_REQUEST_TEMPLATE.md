<!--
感谢你的 PR！请尽量按下列模板填写，便于 review。
-->

## 这个 PR 做了什么？

简要描述本次改动的目标与范围。

## 为什么这么做？

背景、动机；如关联 issue 请用 `Closes #123` / `Refs #123` 格式。

## 怎么验证？

- [ ] `npm run typecheck` 通过
- [ ] 本地 `npm run dev` 验证过相关交互
- [ ] 如改动了 preload / main，已重启 dev 验证

复现步骤或截图：

## 影响面

- [ ] 仅渲染层
- [ ] 涉及主进程 / preload
- [ ] 涉及 IPC 通道（已同步更新 `src/shared/ipc-channels.ts` 与 `src/shared/types.ts`）
- [ ] 涉及 i18n（已同步补齐 zh / en 两份）
- [ ] 涉及破坏性文件操作（已确认安全校验未削弱）

## Checklist

- [ ] 我已阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] 代码风格与现有保持一致（中文注释、TypeScript 严格模式）
- [ ] 没有引入不必要的依赖
- [ ] 必要时已更新 `CHANGELOG.md`
