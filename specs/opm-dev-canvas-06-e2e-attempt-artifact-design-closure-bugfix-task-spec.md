# Spec: DEV-CANVAS-06 E2E Attempt Artifact 设计闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与根因

E2E Runner 实现规格要求每个 attempt 生成 `fault-plan.json`、`fixture-materialization.json`、`attempt-observation.json`、`runtime-process.json`、`browser-environment.json`、`network-observation.json`、`console-errors.json`、`transaction-observation.json`、`reopen-observation.json`、`api-exchanges/index.json` 和 `artifact-index.json`，并要求每种 JSON artifact 都满足 `additionalProperties=false`。本修正前，仓库只有 E2E Manifest/Report `0.1` Schema，没有上述 11 类 artifact 的机器 Schema；规格第 11 章只有字段摘要，未冻结嵌套对象、必填/可空字段、枚举、文件名到 schema identity 的映射和跨 artifact join。

根因是 Report 聚合契约与 attempt 原始证据契约被合并描述：Report Schema 已封闭最终聚合形状，但 Runner、Java Materializer、test launcher、browser collector 和 verifier 仍可能各自发明中间机器格式。

## 2. 目标

1. 新增 E2E Attempt Artifact `0.1` 执行设计，作为 11 类 attempt JSON 的唯一语义事实源；
2. 新增一个 Draft 2020-12 union Schema，用 11 个互斥 `schema_id` 封闭全部根对象和嵌套对象；
3. 冻结文件名、producer、consumer、identity、字段、可空性、顺序、JCS/SHA 和 Report 映射；
4. 冻结 fault kind/target/case 映射、Family/Common materialization、事务/reopen/网络/console/API 证据和 Artifact Index 完整性算法；
5. 冻结 pre-acceptance、accepted run、不可报告失败、BLOCKED Report 和 verifier 只读边界；
6. 同步 E2E Runner 规格/checklist、DEV-CANVAS-06 总规格/checklist、测试策略、冻结基线、执行包和文档索引。

## 3. 非目标

- 不实现或修改 E2E Runner、Reporter、semantic verifier、Playwright driver、Java Materializer、fault port、Web server 或 Runtime；
- 不修改 E2E Manifest/Report/Common Fixture/Visual Schema、OpenAPI、SQLite DDL/migration、Profile、Rule、Grammar、Symbol、Handoff、Intake、Vue 或 production gate；
- 不生成 controlled/production `194/388`、E2E Report、Candidate、Activation、Capability enablement、生产发布或 ISO 19450:2024 符合性证据。

## 4. 修改边界

允许修改：

- 本规格和对应 checklist；
- `docs/design/opm-dev-canvas-06-e2e-attempt-artifact-design.md`；
- `docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact.schema.json`；
- `scripts/validate-canvas06-visual-e2e-schemas.test.mjs` 的定向 artifact Schema 正反例；
- E2E Runner 规格/checklist、DEV-CANVAS-06 总规格/checklist、测试策略、冻结基线、开发执行包和 `docs/README.md` 的当前设计/准入指针。
- 历史规格/checklist 中仅用于指向当前唯一冻结基线的状态指针；不得改写其历史快照正文。

禁止修改：`.harness/**`、`services/**`、其他 `scripts/**`、现有 Schema、fixture bytes、`package.json`、Maven、API、SQLite、Vue、release evidence 和 production gate。

本任务不新增依赖或命令，复用 `npm run release:canvas06:visual-e2e-schema:test`。

## 5. 修正策略

1. 使用一个 union Schema 复用 digest/path/fileRef/binding/transaction 等公共定义；11 个 artifact root 通过互斥 `schema_id` 选择，全部对象递归 `additionalProperties=false`。
2. 文件名到 `$defs`、producer 和 consumer 的唯一映射由新设计承接；Runner/verifier 必须按文件名选择目标 root，不允许只验证 union 后忽略路径语义。
3. 现有 E2E Report `0.1` 不升版；Report attempt/case/capability 只从已验证 artifact 投影，新增 Schema 不成为第二个 Report。
4. JSON body 原始副本继续按 OpenAPI/API 实际 bytes 保存并由 `api-exchanges/index.json` 引用；它们不是 Runner 自定义 wrapper，不要求套用本 union Schema。
5. 所有状态和摘要由稳定枚举、计数与 JCS digest 决定；时间、PID、端口和本机路径只能进入环境/过程证据，不得进入 attempt semantic comparison digest。

## 6. 验收标准

1. 新 Schema 可解析、Draft 2020-12、11 个 root identity 互斥，所有 object 节点均 `additionalProperties=false`；
2. 11 个正例全部通过；缺必填、额外字段、错误 identity、错误条件字段、错误枚举、错误顺序/计数等反例被拒绝；
3. 每个文件的唯一 producer/consumer、Report 字段映射、digest preimage、排序、可空性和失败边界已冻结；
4. 三个受控 fault case 与所有非 fault case 的 `fault_kind/target/trigger_count` 映射唯一；
5. Family/Common materialization、active binding、Project/Model/Context/Revision、SQLite 检查和 sidecar 规则唯一；
6. Artifact Index 能闭合 10 个必需 JSON、API raw body、stdout/stderr/failure 文件，禁止自身入 refs、extra、重复和跨 attempt 引用；
7. E2E Runner 与总 Gate 文档不再宣称缺少 artifact Schema 时可直接实现该切片；
8. 定向 Schema 测试、JSON 解析、相对链接、活动指针和 `git diff --check` 通过。

## 7. 验证与回滚

验证运行 `npm run release:canvas06:visual-e2e-schema:test`，并执行 `jq empty`、Schema object 封闭检查、文件引用/版本检查和 `git diff --check`。本轮不修改产品实现，Maven、前端 build 和真实 E2E 不适用。

回滚只删除本任务新增规格、checklist、设计和 artifact Schema，并回退允许文档及定向测试的本任务增量。不得删除或改写现有 E2E Manifest/Report、fixture、用户数据、Handoff/Intake、Runner 已有实现或其他未提交改动。

## 8. 状态边界

本任务完成只表示 E2E attempt artifact 机器设计输入闭合，使 E2E Runner 剩余实现可按冻结契约继续。Runner/Materializer/fault/driver/collector/verifier、controlled/production `194/388`、E2E READY Report、`GATE-06-03`、Candidate、Activation、Capability enablement、生产发布和 ISO 符合性仍需独立实现与证据。
