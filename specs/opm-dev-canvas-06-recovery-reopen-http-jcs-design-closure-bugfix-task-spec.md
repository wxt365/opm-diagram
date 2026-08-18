# Spec: DEV-CANVAS-06 Recovery Reopen 与 HTTP JCS 设计闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与根因

Recovery Manifest `0.1` 的 `expected_reopen` 仅约束为非空 object，允许任意字段；既有 Schema 正例以 `{stable:true}` 通过。Checklist 虽冻结 observed `reopen_snapshot` 字段，但没有冻结 expectation 的字段级比较规则、28 项 exact 映射、JCS digest 和受控 source ref，Manifest builder 与 semantic verifier会自行解释重开语义。

Recovery Execution `v1.2` 同时要求 Runtime 证明实际 HTTP body bytes 与解析后重新生成的 RFC 8785 JCS bytes 逐字节相等，但当前设计没有冻结 raw bytes 在 Spring MVC 解析前的捕获、严格 JSON 解析、replay、expected digest owner、command 零执行守卫和 artifact 证明接口。仅接收 `Map<String,Object>` 的 Controller 无法恢复属性顺序、空白、BOM或重复键。

根因是把结果约束写成了流程性文字，没有给 Manifest expectation 和 HTTP ingress proof 分配单一机器 owner。

## 2. 目标

1. 将 Recovery Execution 升为 `v1.3`，冻结 reopen expectation 与 HTTP raw-body JCS 的唯一执行边界；
2. 保留 Manifest `0.1` 为历史版本，新增活动 Manifest `0.2`，不得原地改写已冻结 Schema identity；
3. 新增 Reopen Expectation Catalog Schema `0.1` 和不可变 Catalog `0.1.0`，冻结三个 expectation profile、28 项 case/profile exact join、逐 profile JCS digest、catalog payload/raw SHA；
4. Manifest `0.2` 必须 raw-ref exact Catalog，并为每个 case 携带与Catalog深度相等的封闭 `expected_reopen` 与 `expected_reopen_sha256`；
5. 冻结 test-only eager raw-body guard：在 Controller 前读取、严格校验、JCS比较、raw SHA比较并用 replayable request 继续调用；
6. 新增HTTP Request Artifact union Schema `0.1`，冻结 expected request digest owner、零 repository/零 command 执行、稳定错误、artifact字段和 test composition/production隔离；
7. 同步 Recovery runner开发入口和全局冻结状态，在修正验证完成前不得宣称 `RECOVERY-IMPL-01=DESIGN_READY` 或全局无冲突。

## 3. 非目标

- 不实现 Manifest builder、Recovery runner、semantic verifier、raw-body guard、request wrapper、fault hook、launcher或artifact collector；
- 不修改 `services/**`、公共HTTP route/wire、SQLite DDL/migration、两份Recovery template `0.1.0` bytes、Profile/Handoff/Intake或production gate；
- 不生成真实 Manifest/Report、28/56 evidence、Candidate、Activation、Capability enablement或ISO 19450:2024符合性证据；
- 不在本任务解决 Projection `double` 与共享safe-integer JCS owner的独立摘要冲突，该问题继续单独阻断 Recovery snapshot实现。

## 4. 修改边界

允许修改：

- 本规格和对应 checklist；
- `docs/design/opm-dev-canvas-06-recovery-execution-design.md`；
- 新增 Manifest `0.2`、Reopen Expectation Catalog `0.1` Schema、Catalog `0.1.0`与HTTP Request Artifact union Schema `0.1`；
- `scripts/validate-canvas06-recovery-schemas.test.mjs`；
- Recovery runner规格/checklist、DEV-CANVAS-06总checklist、测试策略、冻结基线、开发执行包、`docs/README.md`及需求/验收矩阵中的活动版本、依赖和全局准入指针。

禁止修改：`.harness/**`、`services/**`、现有五份Recovery `0.1` Schema、两份template bytes、其他测试/运行实现、API、SQLite、Vue、Profile资产、Handoff/Intake、release evidence、依赖和其他Gate。

本任务允许新增机器设计输入和更新其定向Schema测试，不允许新增生产代码、运行命令、依赖或配置。

## 5. 修正策略

1. `expected_reopen`不伪造尚未执行的完整 snapshot literal；它冻结对17个 observed snapshot字段的逐字段比较规则。普通零变更case逐字段比较`BEFORE_SNAPSHOT`，018/021比较`AFTER_SNAPSHOT`，022除marker外比较`BEFORE_SNAPSHOT`且marker必须为artifact index中唯一的`RECOVERY_REQUIRED_MARKER`。
2. 三个 expectation profile 是唯一规则owner。28项case只引用profile ID与profile digest；Manifest builder必须展开profile原对象，禁止自行生成、删减或覆盖规则。
3. `expected_reopen_sha256=sha256(UTF8(JCS(expected_reopen)))`；Catalog payload SHA排除自身字段后计算；Catalog raw SHA对不可变文件原始bytes计算。
4. Manifest `0.2`新增Catalog ref/payload SHA，并把`expected_reopen`改为外部Catalog Schema的封闭引用；`0.1`不再是活动builder/verifier目标。
5. HTTP ingress唯一方案为仅在受控Recovery child composition装配的eager filter。Filter从已验证launch context取得case/attempt/request digest，不接受请求头、环境变量或客户端自报SHA作为信任owner。
6. Filter在调用Spring MVC前完成：body长度上限、严格UTF-8、无BOM、strict duplicate detection JSON解析、共享Java JCS canonicalization、raw bytes与canonical bytes逐byte比较、raw/canonical SHA与template request digest三方比较。任一失败不调用filter chain、Controller、Service或repository。
7. 通过后使用只读raw byte副本构造replayable request；解析后的对象再次由共享JCS owner复算，必须与ingress proof一致。产品默认Spring context不得装配该filter，release JAR/ZIP不得含test launcher class。

## 6. 验收标准

1. Manifest `0.2`、Catalog Schema和HTTP Request Artifact union Schema均为Draft 2020-12，所有object封闭；Manifest `0.1` raw bytes不变；
2. Catalog恰有三个profile和28个按case ID顺序的mapping，018/021=`AFTER`、022=`RECOVERY_REQUIRED`、其余=`BEFORE`；
3. profile/case/catalog digest均可由共享Node JCS模块独立复算，raw SHA、路径、版本和Manifest exact join唯一；
4. 任意字段、缺字段、错误profile、错误digest、错误顺序、重复/缺失case和Manifest/Catalog不一致均被拒绝；
5. HTTP设计明确pre-Controller捕获、expected digest owner、strict parser、replay、零执行、artifact和production隔离，没有第二实现选项；
6. canonical raw body通过；重排、空白、BOM、重复键、错误SHA、解析对象变化、body超限和filter未装配均在command前阻断；
7. runner规格/checklist和全局入口不再引用Manifest `0.1`为活动目标，也不在Projection摘要冲突未关闭时恢复`DESIGN_READY`；
8. Recovery Schema定向测试、Catalog digest/ref检查、JSON解析、引用检查和`git diff --check`通过。

## 7. 验证与回滚

验证执行`npm run release:canvas06:recovery-schema:test`、`npm run release:canvas06:recovery:template:test`、Catalog JCS/raw SHA定向检查、JSON/Markdown引用检查和`git diff --check`。本轮不修改产品代码，Maven、前端和真实28/56不适用。

回滚只删除Manifest `0.2`、Catalog Schema/Catalog和本规格/checklist，并回退本任务对允许文档与定向测试的增量。不得改写历史Manifest `0.1`、template、用户数据、Handoff/Intake或工作树其他改动。

## 8. 状态边界

本任务完成只表示两个P1的设计契约闭合。Projection浮点摘要冲突关闭前，Recovery整体仍为`DESIGN_BLOCKED/IMPLEMENTATION_NOT_STARTED`；不得开始Manifest/runner生产实现或宣称Recovery READY、Gate关闭、生产发布或ISO符合性。
