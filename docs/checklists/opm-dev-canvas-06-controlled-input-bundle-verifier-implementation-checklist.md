# Checklist: DEV-CANVAS-06 受控输入 Bundle 验证器实现

> 状态：`COMPLETE`。本 checklist 不构成 Manifest、Gate、release 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-controlled-input-bundle-verifier-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标、范围、契约、验收、验证和回滚分别映射规格第 1、3、4、5、6 节。

## Plan

- [x] 确认 controlled root、identity、raw ref 和 consumer 模式的冻结规则。
- [x] 实现无写入共享验证库。
- [x] 覆盖成功与拒绝边界。
- [x] 完成定向和仓库契约验证。

## Build

- [x] 非 symlink root/descriptor、Schema、basename、ID 和 JCS identity 全部闭合。
- [x] 三个顶层 raw ref 仅从 root 内常规文件读取并复算。
- [x] Visual 对象和 E2E `null` 均在输入阶段拒绝错误模式。
- [x] Visual version root 和 Authoring Report raw ref 闭合，E2E 不读取 approved 路径。
- [x] 验证器不写文件、不处理 production root，也不替代 Visual full exact join。

## Verify

- [x] 临时目录中的 Visual/E2E 两种成功输入通过且 ID 不同。
- [x] 非法 consumer、模式错配、identity/basename mismatch、raw 篡改和 symlink 均返回 `exitCode=2`。
- [x] 定向 verifier 与 Schema 测试通过。
- [x] `npm run contract:validate` 与 `git diff --check` 通过。

## Risks And Residuals

- [ ] builder 仍必须调用本库后才可声明退出码 `2` 和零 Manifest/临时输出；本库本身不写输出。
- [ ] Visual approved transitive join、production input、Manifest/Report、Candidate、Activation 和 GATE-06-03 仍未实现或未验证。

## Rollback

- [ ] 仅回退本任务新增验证库、测试、命令、规格和 checklist。
- [ ] 不修改受控 bundle、approved bytes、production evidence 或既有 Schema。
