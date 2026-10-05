# Checklist: P03 关系参数内联编辑与工具切换修正

## Spec Mapping

- 规格：`specs/opm-p03-inline-relation-parameter-and-tool-switch-bugfix-task-spec.md`
- 验收：`REL-INLINE-01` 至 `REL-INLINE-05`
- 边界：仅修改前端关系候选交互、样式、测试和直接冲突设计；Runtime 与公共契约不变。

## Build

- [x] `REL-INLINE-01` 不同关系工具切换静默取消未提交候选。
- [x] `REL-INLINE-02` 参数编辑移入画布浮层且不打开属性 Dock。
- [x] `REL-INLINE-03` 删除确认按钮，支持 Enter、Escape 和关闭图标。
- [x] `REL-INLINE-04` 必填校验和失败保留边界闭合。

## Verify

- [x] `REL-INLINE-05` Web 单元、lint、typecheck、build 通过。
- [x] `REL-INLINE-05` 相关 P03 Playwright 通过。
- [x] `REL-INLINE-05` `git diff --check` 通过且未越界。

## Verify Record

- `2026-09-07`：实现前复现为 Tagged Structural 候选切换 Exhibition 时顶部出现“请先确认或取消”，工作台纵向跳动，右侧属性任务区保留“创建关系”按钮。
- `2026-09-07`：Store 已改为未提交候选静默取消后激活新工具；direct commit 网络提交期间忽略切换，避免状态竞态。
- `2026-09-07`：必填参数改为画布内浮层；不打开属性 Dock、不改变 Grid 宽度、无可见或隐藏 submit 按钮，首字段自动聚焦，Enter 提交、Escape/关闭图标取消。
- `2026-09-07`：Web Vitest 15 个文件、87 项全部通过；lint、typecheck、build 通过。Vite 保留既有 `/opm-bootstrap.js` 非 module 提示，不影响构建成功。
- `2026-09-07`：Java 21 Runtime 与独立 Vite 服务下执行 `workbench-layout.spec.ts`、`workbench-relation-gesture.spec.ts`，14 项全部通过；新增实机场景验证 Tagged Structural 切换 Exhibition 无顶部反馈、零 Revision、属性 Dock 不出现且画布宽度不变。
- `2026-09-07`：当前 `5173` Chrome 刷新复核，默认工作台无顶部候选反馈、无右侧属性 Dock，画布恢复全宽。
- `2026-09-07`：结论仅为 P03 本地功能范围 `IMPLEMENTED/VERIFIED_LOCAL_FEATURE_SCOPE`，不构成 DEV-CANVAS-06 controlled E2E、Candidate、Activation、生产发布或 ISO 符合性证据。
