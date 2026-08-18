# Spec: DEV-CANVAS-06 执行契约设计修正

文档状态：`FROZEN`

更新时间：`2026-08-07`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

### 1.1 问题

当前三个已冻结开发包仍存在执行者可自行决定的机器语义：

1. `GOLDEN-AUTHORING-02B`要求`MS-REV-001/0.2`，但Visual Common设计仍写`text_artifact`不出现，与Revision `0.2`必填且封闭的`text_artifact`冲突；空工件的唯一形状、摘要和SQLite/Verifier计数没有冻结；
2. Recovery设计描述了父子进程强停协议，但没有独立Launch Request Schema，challenge、`child-ready/reachpoint/parent-observed/termination`的封闭字段、原子可见性、秘密生命周期和首错顺序仍不完整；
3. E2E Report `0.1`没有承载实际Java executable的机器ref，`runner_source_sha256`也没有精确allowlist/exclusion contract，Report producer和verifier可能对运行工具链及source set使用不同输入。

### 1.2 Root Cause

上游设计先冻结了业务语义、执行数量和最终Gate结果，后续逐步补齐了中间artifact，但没有在同一变更中回查Revision必填字段、跨进程启动证明和Report自身的可重放工具链身份。既有文档中的自然语言边界不足以替代封闭Schema和精确文件集合。

### 1.3 为什么此前未发现

此前验证分别聚焦02B JCS/Color、Recovery Template/Factory/Projection和E2E Attempt Artifact，没有按“输入Schema -> producer -> raw ref -> Report -> verifier”重新组合三条链，因此局部契约均可通过而组合后仍留有开放选择。

## 2. 目标

按以下唯一顺序完成并冻结：

1. 为02B冻结唯一空`text_artifact`、`artifact_digest` preimage/算法、显式`text_traces=[]`及SQLite/Verifier计数；
2. 新增Recovery Launch Request与Launch Proof机器Schema，冻结challenge文件和四阶段proof的原子写入、身份join、秘密清理与首错映射；
3. 保持E2E Manifest `0.1`不变，将活动E2E Report升级为`0.2`，冻结Java executable byte mirror/ref及runner source set精确allowlist/exclusion contract；
4. 同步Recovery、E2E、测试策略、开发执行包和全局冻结基线，不提升任何实现、Report、Gate、Capability、生产或ISO状态。

## 3. 修改边界

允许修改：

- 本规格及对应Spec Mapping checklist；
- 新增一份统一设计修正文档；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md`；
- `docs/design/opm-dev-canvas-06-recovery-execution-design.md`；
- `docs/design/opm-dev-canvas-06-e2e-attempt-artifact-design.md`；
- `specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`；
- `specs/opm-dev-canvas-06-recovery-runner-implementation-task-spec.md`；
- `specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md`；
- 新增Recovery Launch Request/Proof、E2E Report `0.2`、E2E Runner Source Set机器Schema；
- 更新现有Recovery、Visual/E2E Schema定向验证；
- `docs/design/opm-test-strategy.md`、`docs/design/opm-development-execution-pack.md`、`docs/design/opm-design-freeze-baseline.md`及必要正式索引。

禁止修改：

- `.harness/**`；
- `services/**`、`apps/**`、实际runner/materializer/launcher/driver实现；
- SQLite DDL、migration、公共API、Revision `0.2` Schema；
- 既有fixture、template、Catalog、Manifest、Report或release bytes；
- Profile、Rule、Grammar、Symbol、Handoff、Evidence Bundle；
- production gate、Candidate、Activation、Capability和ISO证据状态；
- 新增依赖或大范围重构。

## 4. Fix Strategy

1. 02B不改Revision `0.2` Schema，改为在Visual Common fixture中合成唯一Schema-valid空Text Artifact，并以版本化JCS preimage计算摘要；
2. Recovery启动协议使用独立Schema和同目录临时文件到最终文件的单写原子提交，不从日志、PID或自由文本补造proof；
3. E2E Manifest继续为`0.1`，历史E2E Report `0.1`保持只读；活动Report `0.2`新增Java executable evidence和source set ref，避免原地改变已冻结Schema；
4. runner source set使用固定路径allowlist和显式排除集，禁止glob、目录递归、Git tracked set或import扫描在运行时决定身份；
5. 通过Schema正反例、跨文档版本/字段检查和`git diff --check`验证，不实现产品执行逻辑。

## 5. 验收标准

1. 02B空`text_artifact`的每个字段、ID派生、Grammar join、摘要preimage/编码及`text_traces=[]`均唯一；SQLite的`text_artifact_count/text_trace_count`和transaction delta语义不再依赖实现者解释；
2. Recovery Launch Request和四类Proof递归封闭，challenge固定32 bytes、只在attempt staging中存在且不进入Report；五个文件的producer、顺序、原子写入、fsync/no-replace、超时、重复和首错映射完整；
3. E2E Report `0.2`具有Java executable mirror/ref和runner source set ref；同一Java ref被Report、Runtime Process artifact和verifier exact join；
4. runner source set文件清单路径、顺序、aggregate公式和排除集完整，无动态发现语义；
5. 旧Revision `0.2`、Recovery既有Schema、E2E Manifest `0.1`和历史E2E Report `0.1`保持可读；
6. 定向Schema测试、Markdown链接/表格/围栏、版本/状态一致性和`git diff --check`通过；
7. 全局设计责任仍为`32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked/unresolved/cross_document_conflict=0`且开发门为`READY_FOR_DEVELOPMENT`。

## 6. 验证方式

1. 扩展`validate-canvas06-recovery-schemas.test.mjs`验证Launch Request/Proof正反例；
2. 扩展`validate-canvas06-visual-e2e-schemas.test.mjs`同时验证历史Report `0.1`与活动Report `0.2`、Java/ref和source set正反例；
3. 使用JSON解析、Markdown相对链接、表格/围栏和固定术语检查验证文档；
4. 执行`git diff --check`。

本轮不运行Recovery `28/56`、E2E `194/388`、浏览器、生产Report或发布Gate。

## 7. 回滚

删除本包新增的设计、Schema和checklist，恢复六份同步设计/实现规格及三份全局入口的本包增量。不得删除或改写用户既有实现、fixture、template、Manifest、Report、Handoff、release root或数据库。
