# Checklist: DEV-CANVAS-06 Golden Capture Planner 实现

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-capture-planner-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标、范围、非目标、约束、验收、回滚：以规格第 1 至第 6 节为准。
- 修改边界：仅 Planner、定向测试、命令、Evidence Bundle source 和本实现切片文档；禁止改写现有 release artifact、Handoff、approved golden 或运行时 API。

## Build

- [x] 已核对 Capture Plan frozen 算法、Handoff/Intake/Bundle/Common Catalog 输入边界。
- [x] 已确认历史 Evidence Bundle 未归档 replay report且必须拒绝；新`clean-b940ac9bb734` Bundle已按冻结路径补齐，未使用旁路。
- [x] 更新下一次 release 的 Evidence Bundle source。
- [x] 实现无 PNG 的 exact-join Capture Planner。
- [x] 增加 READY、bundle 缺 replay、join/binding/dirty source 与禁止参数反例。

## Verify

- [x] 受控 READY 输入生成 `1242/9` Schema-valid Plan。
- [x] 相同受控输入重复生成 byte-identical Plan。
- [x] 生产输入使用受控`jar 21.0.7`生成`1242/9` Plan，两次执行byte-identical，SHA-256为`8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9`。
- [x] 所有阻断反例保持输出路径零文件。
- [x] 定向 Planner/Schema test 与 `git diff --check` 通过。

## Risks And Residuals

- [x] 历史旧 Evidence Bundle继续被新 Planner拒绝；新clean Handoff/Bundle与生产READY Plan已生成并冻结，130项Materialization尚未执行。
- [x] 本切片不 author/approve/publish golden，不生成 Visual Manifest/Report、Candidate 或 Activation。
- [x] `GATE-06-03` 仍为 `BLOCKED`，Capability 仍未启用，ISO 证据仍缺失。
