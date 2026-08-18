# DEV-CANVAS-06 Family Fixture Identity 来源闭包修正 Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-family-fixture-identity-source-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 问题/Root Cause：规格第1、2节；对应Plan 1和Build 1。
- 目标：规格第3节；对应Build 1~6。
- 非目标/修改边界：规格第4、5节；对应Boundary全部。
- Fix Strategy：规格第6节；对应Build 1~6。
- 验收/验证：规格第7、8节；对应Verify全部。
- 回滚/状态边界：规格第8、9节；对应Summary全部。

## Plan

1. P0：冻结 Family Project identity 的独立不可变来源和当前2项活动输入；
2. P0：冻结 Catalog、Manifest raw ref、178 -> 2集合与fixture深度join；
3. P0：冻结 Fault Plan 为 attempt ordinal唯一机器来源；
4. 同步活动设计/实现输入并验证跨文档闭包。

## Boundary

- [x] 只修改规格第5节允许的设计、Schema、Catalog和状态/索引文档。
- [x] 不修改`.harness/**`、产品实现、现有Schema、fixture、Handoff/Evidence Bundle、API/SQLite/Vue或Gate。
- [x] 不实现 Materializer/Runner，不生成controlled/production evidence。
- [x] 回滚不覆盖工作树其他未提交修改。

## Build

- [x] 新增 Family Fixture Identity Catalog `0.1` Schema和活动`0.1.0`输入。
- [x] 冻结当前2项Project/Model/Context/base Revision identity和不可变升级规则。
- [x] 冻结Manifest `fixture_refs[]`唯一Catalog raw file ref、排序和178 -> 2集合算法。
- [x] 冻结Materializer字段映射、禁止派生/默认及零SQLite失败边界。
- [x] 冻结Fault Plan先写先验和`attempt_ordinal`唯一来源。
- [x] 同步Manifest Builder、Runner、Attempt Artifact、执行契约修正入口、测试策略、执行包、总checklist、冻结基线和README。

## Verify

- [x] Catalog/Schema JSON parse通过；全部object封闭。
- [x] 当前Catalog正例通过Schema，缺字段/extra/错误SHA/重复identity反例被拒绝。
- [x] 两个base fixture raw SHA和6个Revision字段与Catalog深度一致；fixture可选parent字段缺失按冻结规则归一为Catalog显式`null`。
- [x] 178个Family `fixture_ref`去重为2并与Catalog SHA集合相等。
- [x] 本修正未编辑E2E Manifest `0.1` Schema；Catalog继续使用其既有通用封闭`fileRef`形状。
- [x] 活动文档中Project/ordinal来源、失败码、Artifact `v1.3`指针和状态无冲突。
- [x] 受影响Markdown相对链接无断链。
- [x] `git diff --check`通过。

## Summary

- [x] 记录Root Cause、Fix Strategy、修改文件、验证结果、风险与遗留项。
- [x] 区分事实与设计决定，无未声明假设。
- [x] 只关闭设计输入，不把Catalog存在当作Bundle/Manifest/Runner实现完成。
- [x] Handoff/Evidence Bundle未重建前保持实现阻断。
- [x] 不声明Gate、Candidate、Activation、Capability、生产发布或ISO符合性。

## Actual Verification Evidence

1. Draft 2020-12 Schema与semantic一次性验证共`15/15`通过：正例、缺`project_id`、entry extra字段、禁止Project命名空间、递归object封闭、payload SHA、source Golden Manifest SHA、178 -> 2、重复Project、错fixture SHA、缺entry、额外entry、Model drift和parent归一值drift均得到预期结果。
2. 当前base分布为`68 x base-golden.proc.001.json + 110 x base-golden.struct.003.json = 178`，去重恰为2。
3. raw SHA闭包：
   - `base-golden.proc.001.json=6cf81b7f975adde8877eca9583b93304847a4e288a788df61c2b96fff26a4036`
   - `base-golden.struct.003.json=2a42ea1db241f0d0147df592f1cf159436c3a70cdde2637078e6a9a1dc684e3d`
   - `opm-opl-golden-manifest.json=8aaca22c69402e08ff58a4a3e19eb38b260511dc7649c1deae8ac4fffce280a7`
   - `catalog_payload_sha256=2d0c5054d58390f63deb975f8b8ea301520864bdbbabd4c84d657fda73484bb5`
4. 两个base fixture均满足Model/root Context/Revision/sequence深度join；其Revision `0.2` raw JSON均省略可选`parent_revision_id`，已冻结为Catalog/Artifact显式`null`，不修改fixture bytes。
5. 14份受影响Markdown共58个相对链接存在，围栏平衡；Schema/Catalog均为可解析JSON、无BOM、LF且恰有一个结尾换行；`git diff --check`通过。

## Closure

- Root Cause：Revision fixture不能证明Project；可选parent字段的raw缺失此前也未定义封闭归一；ordinal虽存在于Fault Plan，但未被冻结为下游唯一机器来源。
- Fix Strategy：新增逐base fixture不可变Identity Catalog，Catalog raw ref由Manifest锁定，Project只读Catalog，Revision字段做exact/归一join；Fault Plan先原子写入验证，其他producer只从中读取ordinal。
- 修改文件：本规格/checklist、Catalog Schema/活动Catalog、E2E Manifest/Runner规格与checklist、Attempt Artifact设计、执行契约修正入口、DEV-CANVAS-06总规格/checklist、测试策略、开发执行包、冻结基线和文档索引。
- 风险与遗留：新clean Handoff/Evidence Bundle尚未携带Catalog，Manifest builder/verifier尚未适配，Family Materializer/Runner尚未实现；状态继续为`CONTRACT_UPDATE_REQUIRED/BLOCKED_BY_DEPENDENCY`。
- 非结论：本闭包不构成真实`194/388`、READY Report、Gate、Candidate、Activation、Capability、production或ISO 19450:2024符合性证据。
