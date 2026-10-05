# 多层 OPD 当前图删除恢复

Work Mode：change；Risk Level：L3；Task Type：bugfix；Active Playbooks：none (primary)。

## 目标与非目标

恢复多 Context 模型中当前 OPD 的安全删除候选和提交。删除影响必须限制在选中 occurrence 所在 Context，且不得破坏细化边引用。保留已有删除模式、影响预览和 token 授权。

本次不实现跨图级联删除、Context/RefinementEdge 删除、细化关系重写或新的前端交互。

## 边界与契约

允许本规格、`docs/checklists/` 中对应 Checklist、`services/local-runtime/src/main/java/org/opm/localruntime/application/` 的删除授权和提交逻辑，以及 `services/local-runtime/src/test/` 的定向测试。禁止修改公共 API、Schema、数据库、配置、依赖、前端、用户数据、其他模型命令与 `.harness/`。现有工作树改动保留。

删除计划中任一 occurrence 属于其他 Context 时，目标删除和级联删除均禁用；删除计划涉及被细化 Element，或移除其父图 occurrence 时也禁用。其他模式按各自的影响计划独立判断。提交时重新按当前 Revision 判定，不接受伪造的候选或过期影响 token。阻断使用既有 `CONTEXT_NOT_ALLOWED` 原因码，不新增契约字段。

## 验收与验证

- DEL-01：多 Context 模型的当前图普通元素、关系可获得正确删除候选并完成删除，其他 Context 不变。
- DEL-02：本图依赖关系仍按 `DELETE_TARGET` 阻断、`CASCADE` 可用的既有规则处理。
- DEL-03：被细化元素、其父图 occurrence 与跨 Context 影响均被阻断；伪造提交不产生部分写入。
- DEL-04：定向 Java 测试和 `git diff --check` 通过。

Plan：在共享删除策略中按每个删除模式检查影响边界，候选与提交共用判定；调整现有多 Context 测试并补跨图引用回归；最后执行定向验证。

回滚：撤销本规格和对应增量实现、测试，不修改已保存的用户模型。
