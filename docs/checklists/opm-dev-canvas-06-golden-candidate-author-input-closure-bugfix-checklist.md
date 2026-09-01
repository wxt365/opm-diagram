# GOLDEN-AUTHORING-03B 输入闭包修正 Checklist

状态：`READY_FOR_BUILD`

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-candidate-author-input-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标、范围、约束、验收与回滚：分别映射规格第1、3、2、4、5节。

## Checklist

- [x] 确认 Capture Plan 无 Java/Profile/Common work root、Browser 或 Font source physical input。
- [x] 确认 Adapter Request `0.2` 和 Golden Environment `0.2` 的字段不能由03B CLI既有六参数唯一推导。
- [x] 冻结三个显式参数、无 fallback、先验校验和零输出边界。
- [x] 冻结第四个显式 Lineage Input，避免从approved root或目录推断候选版本。
- [x] 新增 Font Input Schema 与正反 contract test。
- [x] 新增 Lineage Input Schema 与正反 contract test。
- [x] 实现 Author CLI 的 Request/Browser/Font preflight 与受控错误码。
- [x] 验证 candidate Environment 的字体复制/raw join。
- [x] 执行定向测试、Schema contract与 `git diff --check`。

## 非目标

- 不生成真实 candidate、Approval、approved version、Visual Manifest、Gate、Activation、Capability 或 ISO 证据。
- 不修改 Capture Plan、Adapter Request、Authoring Report、Golden Environment、SQLite 或公共 API。
