# 剩余工作台验收问题修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile 和 Task Type 文件缺失；沿用仓库硬规则。

## 目标、非目标与边界
修复属性默认/交互折叠、缩放和改名用例定位、此前保存/布局/关系链路的前置阻断、冻结夹具字节校验，以及长 State 名称分行断言。保留上一轮未提交修改。非目标：真实 LLM 专用身份测试、release runner 生产证据、数据库迁移、其他业务模块。

允许：apps/web/src/modules/workbench 及相关 stores/workbench 中本次涉及的显示/编辑逻辑与对应测试；tests/e2e 的相关用例/助手；tests/fixtures/hybrid-save/save-content-v1-vectors.json、tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json、docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json 仅恢复 LF 字节；.gitattributes 中该 schema 的 LF 规则；必要的测试驱动/scripts 和 Maven 测试隔离修正；本 Spec/checklist、docs/reports、必要的测试说明、独立 test-results 产物。
禁止：公共 API/DTO、schema 语义、冻结摘要/预期值、依赖、数据库 schema/业务数据、无关重构；.harness 仅在硬规则第 7 条要求时记录 Failure。
契约：不改变语义命令、保存格式或身份守卫。正式工作台遵循已有明确默认收起规格；显式展开及同 Context 普通回读保留本地选择。无受控折叠输入的底层画布保持既有展示兼容。

## 验收
- AC1：首次读取/新建属性与操作默认收起；显式展开、收起无命令/Revision；刷新恢复默认，普通回读保留选择；关系与 Feature State 同步隐藏。
- AC2：活动画布缩放、节点/关系改名用例不因隐藏实例或旧标签提前失败，验证提交、取消、刷新/重开。
- AC3：自建隔离项目完成保存（手动、自动、响应丢失/迟到）、布局（拖动、多选/对齐/预览与撤销恢复）、关系（合法/非法端点、内联标签、保存重开）原断言；问题按首次失败定位，不以跳过代替通过。
- AC4：SaveContentDigest、RFC8785、E2EFaultPlanVerifier 的原冻结字节/错误码测试通过；不重写摘要。后端全量回归使用全新隔离测试存储。
- AC5：长状态名称完整可读、实际标签行数/边界符合容器；8 次容器增长、连接器唯一性与终态内框断言完成。定位标签，不混入空分类/装饰文字。
- AC6：相关单元、lint、类型/构建、定向浏览器回归及后端测试实际执行，记录限制。

## Plan / Checklist 边界
先恢复字节并复跑后端；修正正式工作台折叠策略与活动实例测试助手；修复分行断言的目标；运行自包含浏览器用例，按首次失败逐项修复保存/布局/关系阻断；最后模块回归和报告。代码修改与 Vite 测试串行，输出仅独立叶子目录，不清理已有证据。

## 验证与回滚
Node/Vitest、Playwright Chrome、JDK 21 Maven；全部新建隔离数据，不调用真实 LLM。回滚仅本任务差异；保留上一轮修改，不 repair 或删除旧测试库，不改期望摘要。

## 后端冻结资源边界补充（实现前核对）
索引中的活动 PostgreSQL schema LF bytes 为 61474 字节，SHA256 `56902afd0e59a64eabb9028782a495b2f0193285552f8cbd7edabbd9f93abfa0`。Git cf35d11 将旧 SQLite schema 替换为 PostgreSQL 版，同时写入的 `e8f468…` 常量既不等于该索引 LF bytes，也不等于 CRLF bytes；属于失配 pin，不是本次 schema 语义变更。允许仅修正 E2EFaultPlanVerifier.java 的这一 resource pin 为上述已核验值，并同步原 fault-launcher 规格的活动 schema 说明；禁止运行时从 checkout 推导期望或放宽 hash 校验。保存 vectors 引用的源 `packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json` 允许仅还原到索引 LF bytes，向量及其预期摘要不变。允许 LocalRuntimeApplicationTest.java 使用每次新临时目录，消除旧测试库污染；不改其他 Java 业务。

全量 verify 后继 Recovery 模块引用 `packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.proc.001.json`；该文件同样只允许恢复到索引 LF bytes（模板固定 8623 字节 / `6cf81b7f975adde8877eca9583b93304847a4e288a788df61c2b96fff26a4036`）。不修改 Recovery 模板/摘要或材料化逻辑。

Recovery 原测试在默认 SQLite 环境无条件期待 PostgreSQL `.snapshot.json`，字节校验修复后才到达该断言。允许仅修改 RecoveryFactoryMaterializerMainTest.java，按明确选择的存储类型核对 `.db` 或 `.snapshot.json` 的固定位置，并核对引用 SHA/长度与实际产物，禁止生产逻辑降级或跳过断言。
