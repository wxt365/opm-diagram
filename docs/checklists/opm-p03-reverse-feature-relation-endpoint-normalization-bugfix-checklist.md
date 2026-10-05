# Checklist: P03 特征关系反向手势端点归一化修复

## Spec Mapping

- 规格：`specs/opm-p03-reverse-feature-relation-endpoint-normalization-bugfix-task-spec.md`
- 验收：`REV-FEATURE-REL-01` 至 `REV-FEATURE-REL-05`
- 边界：仅修改 Runtime 端点归一化、对应测试和本任务文档；公共契约与持久化结构不变。

## Build

- [x] `REV-FEATURE-REL-01` 反向 Exhibition 候选及规范端点已实现。
- [x] `REV-FEATURE-REL-02` 反向 State-specified Characterization 候选及规范端点已实现。
- [x] `REV-FEATURE-REL-03` 非法端点组合拒绝行为保持不变。
- [x] `REV-FEATURE-REL-04` 浏览器反向拖动路径已覆盖。

## Verify

- [x] 已记录旧实现的定向失败证据。
- [x] Runtime 定向测试通过。
- [x] P03 Playwright 与受影响前端回归通过。
- [x] `git diff --check` 通过，且未修改禁止范围。

## Verify Record

- `2026-09-07`：JDK 21 下修复前定向用例以 `NoSuchElementException` 失败，失败点为反向 Exhibition 没有候选；修复后同一用例通过。
- `2026-09-07`：`LocalApiServiceTest` 共 `22/22` 通过；新增用例同时验证反向规范角色、提交回读和普通 Feature 不能充当 Characterization exhibitor。
- `2026-09-07`：Web Vitest `86/86`、lint、typecheck 通过。
- `2026-09-07`：`workbench-layout.spec.ts` 与 `workbench-relation-gesture.spec.ts` 共 `13/13` 通过；反向 Exhibition/State-specified Characterization 均完成预览、提交和重开。
- `2026-09-07`：本任务允许文件的 `git diff --check` 通过；未修改公共 API、Schema、SQLite、Profile、关系状态机或发布资产。
