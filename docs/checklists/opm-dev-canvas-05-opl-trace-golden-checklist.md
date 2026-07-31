# Task Checklist: OPM DEV-CANVAS-05 OPL、Trace 与 Golden

## Spec Mapping

- 规格：`specs/opm-dev-canvas-05-opl-trace-golden-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`
- 目标：把 Control/Structural concrete OPL、确定性排序、Token/Trace 和 golden manifest 实现为版本化机器资产与原子文本提交链路。
- 范围：Grammar/Template/Rule、20 个 Control 组合、Structural 合法变体、Token/Trace、golden replay、故障注入。
- 非目标：P03 UI、视觉、E2E、性能、Capability 生产启用和新增语义。
- 约束：一个 Control Fact/一个合成句；Bidirectional 同 Fact 两句；Reciprocal 同 Fact 一句；fan 同 Fact/同 junction/有序 endpoints。
- 验收：规格第 6~7 节。
- 验证：资产/Schema、单元、模块集成、golden replay、事务故障注入、diff check。
- 回滚：回到上一组 ACTIVE asset digests，历史 Revision 仍按原 digest 解析。

## 输入门槛

- [x] 8 类 Control 已展开为 20 个允许基础 Fact concrete template
- [x] 10 类 Structural 的句式、句数、fan/list/completeness 和 State qualification 已冻结
- [x] `14.2.4.1.4`、`A.3.1` 与产品确定性句序边界已冻结
- [x] UTF-8 byte Token/Trace 与 golden manifest 已冻结
- [ ] `DEV-CANVAS-01~04` 的依赖证据和资产 digests 已在任务启动时重新核验

## Build

- [ ] 实现/版本化 concrete Grammar、Template、Rule 和 manifest loader
- [ ] 实现 Control 20 个合成变体及禁止组合阻断
- [ ] 实现 Structural 全部合法 variant、双向/互惠和 fan/list/completeness
- [ ] 实现 Sentence 全 byte Token 与闭合 Trace
- [ ] 实现 deterministic SentencePlan、同 Revision replay 和 artifact SHA-256
- [ ] 将 Text/Trace/Validation/Revision/Operation 接入原子事务
- [ ] 保持生产 Capability gate 关闭

## Verify

- [ ] 资产 Schema、digest、coverage 和 case ID 唯一性检查通过
- [ ] Control `20/20` PASS 与全部冻结 BLOCKED case 通过
- [ ] Structural 所有 Profile coverage key、`1/2/3` fan、双向/互惠用例通过
- [ ] UTF-8 range、全 byte 覆盖和 Trace source refs 检查通过
- [ ] 同 Revision 连续重放至少两次字节和 SHA-256 一致
- [ ] 缺资产、digest mismatch、Trace 不全和事务故障注入无 partial commit
- [ ] 旧 Revision/旧 asset digest 兼容回读通过
- [ ] 限定文件 `git diff --check` 通过

## 交付边界

- [ ] 报告明确已通过的 case/variant 数量和未覆盖项
- [ ] 报告明确本包没有执行视觉、浏览器 E2E、性能或 ISO 符合性验收
- [ ] 向 `DEV-CANVAS-06` 交付冻结的 release build、asset digests、golden 摘要和 Capability gate 清单

## 2026-07-30 Structural Golden 实现证据（最新）

本节覆盖并替代本 checklist 早期审计记录中关于 Structural Golden 仅有 `23/24` template、`69/178` coverage 的进行中数量，不改变未完成 Gate 的状态。

1. `CAP-ISO-STRUCT-001~010` 已形成 `94 PASS + 16 BLOCKED` 静态 candidate fixture；合并既有 Procedural/Control 集合后，manifest 为 `178` case，replay 结果为 `130 PASS_MATCHED + 48 BLOCKED_MATCHED + 0 FAILED`。
2. `npm run golden:coverage` 输出 `EXACT`：`expected=178`、`matched=178`、`missing=0`、`unexpected=0`、`mismatched=0`。`GATE-05-03 Exact Coverage` 的关闭条件已满足。
3. Generator 已实现唯一 `OPL_PRODUCTION / opl.structural.exhibition.v1` 入口，并校验 Profile/Capability 身份、端点分区、完全性、Feature owner 与 ordinal；普通 Structural source 保持 Characterization 分支。Process mixed Characterization 的句序为 Operation 后接 Attribute。
4. Structural 冻结反例返回 `ENDPOINT_KIND_MISMATCH`、`MODIFIER_COMBINATION_INVALID` 或 `STATE_OWNER_MISMATCH`；每个 BLOCKED replay attempt 均为零 transaction 增量且 Draft Head 不移动。
5. 本轮验证：`OplTextGenerationServiceTest` `112/112`、`OplGoldenReplayRunnerTest`、`OplGoldenReplayCliTest`、`npm run golden:contract:test` `21/21`、`npm run contract:validate`、`npm run golden:check`、`npm run golden:coverage` 与 `git diff --check` 均通过。
6. 未关闭：`GATE-05-04 Token/Trace Closure` 的全部 mutation/深度 SQLite 回读，`GATE-05-05` 的 `19` 个 Atomic BLOCKED，`GATE-05-06 Compatibility/Handoff`，以及生产 Capability gate。浏览器 E2E、视觉、性能与 ISO 符合性验收仍未执行。

## 2026-07-29 实现审计记录

本记录只描述审计时的未提交工作树，不把进行中的实现认定为已交付能力。

1. `DEV-CANVAS-05/06` 的规格和 checklist 已进入 Git，原“规格不存在”阻断已经消除；ISO 19450:2024 不存在 Clause 15，不能将其作为 Grammar 来源。
2. 新增不可变 `0.2.0` Profile 包，其中 Grammar 包含 `60` 个 concrete template（Procedural `16`、Control `20`、Structural `24`）；`0.1.0` 历史 Grammar digest 未变。两个 Profile manifest 的 byte length 与 SHA-256 已复核，Grammar loader 的正常与负向加载路径及 Profile manifest 校验均通过当前定向测试。
3. 当前 `GenericPlan.sortKey()` 已纳入 `sentence_slot_rank` 与 `template_id`；`FORWARD/REVERSE` 的 `0/1` 顺序从 concrete Template 的 `sentence_slot` 派生，Bidirectional 顺序测试通过。但 Generator 仍按 Capability 在 Java 中组装句子，尚未执行 Grammar `pattern`，且 Grammar 中的 `sentence_order.bidirectional_slots` 尚未作为独立机器字段加载。
4. JDK 21 当前工作树的 `services/local-runtime` 全量测试已通过 `135/135`，其中 `OplTextGenerationServiceTest` 为 `80/80`、`SqliteRevisionCommitRepositoryTest` 为 `4/4`；参数化测试覆盖 20 个冻结 Control 组合，manifest 驱动测试已枚举两个 PASS fixture 并经过 Reader、Grammar loader、Generator 和连续两次 replay，SQLite 测试已覆盖七个写阶段回滚和三类生成前阻断。此前 `12:44` 的临时 `testCompile` 失败已由补齐测试 helper 消除。
5. Control 的 Grammar template、Generator 映射和 canonical OPL 文本断言均已达到 `20/20`；Planner 阻断 Result、State Result、Effect 输出、非输入段、Capability 不匹配、缺失/重复 Modifier 及 Event+Condition 的 `10` 个稳定 case ID 也已通过。这些仍是单元级 evidence，不替代版本化 golden PASS/BLOCKED fixture，或失败后 Revision/Head 不移动的事务证明。
6. Structural 合法 canonical 文本用例已推进到 `23/24` 个 concrete template；`CAP-ISO-STRUCT-006` 的 Characterization Attribute/Operation/mixed 与完整性组合已覆盖，唯一缺口是无显式产生式身份入口的 `opl.structural.exhibition.v1`。
7. `OplToken` 已具备稳定 ID、`sentence_id`、ordinal、UTF-8 byte 半开区间和 source refs，Revision Schema 与 SQLite JSON 已同步；Sentence 强制 token 连续覆盖、同 Sentence 归属并精确重组文本。`validateTrace()` 已验证 Sentence 一一对应、Token refs 包含、Fact/Occurrence/Rule 来源、Grammar digest 和 range 边界，但所有 Procedural、Control、Structural variant 的细粒度语义映射与完整 binding 依赖闭包仍未证明。
8. 已新增 Golden Schema、校验脚本、manifest 和两个 PASS fixture；Schema 复用 Revision v0.2 的 Fact/Token/Trace 定义，Validator 已验证五项资产身份、Profile package/dependency、fixture binding 和局部闭包，Java 测试也逐项比较 Sentence/Token/Trace。`npm run golden:check` 对 `2` 个 case 通过，13 个 Golden Contract mutation 均返回冻结错误码；`golden:coverage` 仍缺 `32` 个主 Capability，BLOCKED fixture、独立 replay 和原子事务证据属于后续 Gate。
9. 审计结论：`GATE-05-01` 已关闭，Golden 已从“骨架和两个文本 replay”推进为“两个 PASS case 的版本化 Golden Contract”；完整 BLOCKED 集合、独立 runner、事务和 coverage 尚未关闭，DEV-CANVAS-06 和生产 enablement 仍不得启动。

### Golden、Replay 与原子性验收矩阵

| 门槛 | 当前证据 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| 机器 golden manifest | 已有版本化 Schema、校验脚本、manifest 和 `2` 个 PASS fixture；结构检查通过，但 coverage 检查缺 `32` 个主 Capability，BLOCKED case 为 `0` | BLOCKED | 补齐 PASS/BLOCKED fixture，以精确 coverage key 校验全部 Control 组合和 Structural variant，并由 manifest 驱动 replay |
| Control `20/20` | `OplTextGenerationServiceTest` 的 20 个参数化 case 已断言 canonical OPL、concrete template、原 `fact_id` 和 Control Modifier Trace；另有 `C-OPL-CTRL-BLK-001~010` 覆盖全部冻结 Planner 阻断类别 | PARTIAL | 将 PASS/BLOCKED case 版本化为 golden fixture，并补齐失败后无 Text Artifact/Head 移动的事务证明 |
| Structural 全变体 | Grammar `24/24`、Generator `23/24`、合法 canonical 文本 `23/24`；唯一不可达项为 `opl.structural.exhibition.v1` | BLOCKED | 冻结并实现 Exhibition 显式产生式身份入口，再补全部 variant 的 Golden/Trace |
| Token/Trace 闭包 | Token 已按 UTF-8 byte 连续覆盖句子，含 source refs 并写入 Revision JSON；State Consumption、Control Modifier 与非 ASCII byte 边界已有单元测试 | PARTIAL | 覆盖所有 Procedural、Control、Structural variant 的实体/状态/list/direction slot 映射，验证完整 Trace source refs 闭包 |
| 确定性 replay | Java 测试按 manifest 枚举两个 PASS fixture，由 Reader + Grammar loader + Generator 连续生成两次；逐项核对 UTF-8 文本、template、sentence slot 和 manifest artifact digest | PARTIAL | 在 manifest 补齐规范化 artifact bytes、Token、Trace 期望后逐项比较其 SHA-256 与内容 |
| 原子提交 | SQLite 正向提交、七个写阶段的故障注入回滚，以及缺 Template、Grammar binding digest mismatch、根上下文 Trace 缺失三类提交前阻断均已通过；每种失败均断言 Draft Head、Revision、Parent、Trace、Finding、Operation、Receipt 无新增或移动 | PARTIAL | 补实际 Rule/Symbol 资产缺失与 binding digest mismatch 的装配入口测试，并将上述阻断输入版本化为 BLOCKED golden fixture |
| 生产 enablement | 未发现 enablement manifest；现有规格要求本包结束后仍保持 Capability gate 关闭 | BLOCKED | DEV-CANVAS-05 全部 Verify 证据交付后，再由 DEV-CANVAS-06 形成 exact-digest enablement 清单 |

本轮使用 JDK 21 在 `14:44` 当前工作树执行 `./mvnw -f services/local-runtime/pom.xml test`：`135/135` 通过，其中 `OplTextGenerationServiceTest` 为 `80/80`、`SqliteRevisionCommitRepositoryTest` 为 `4/4`。证据包含 Control `20/20` PASS、`C-OPL-CTRL-BLK-001~010` Planner 阻断、Structural `23/24` concrete template、两个 manifest PASS case 的双重 replay、Token `sentence_id` 归属、增强的 Trace 闭包校验、七个 SQLite 写阶段回滚，以及缺 Template、Grammar digest mismatch、Trace 不完整的写入前阻断。该结果不改变 Golden coverage、完整 Trace/binding 闭包和生产 enablement 的 BLOCKED 项。

### Golden Schema、Validator、Fixture 与 Replay 审计

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| Manifest case 集合 | 仅有 `G-OPL-PROC-006.CONSUMPTION_STATE.PASS` 和 `G-OPL-STRUCT-003.BIDIRECTIONAL_OBJECT_TAGGED.PASS`；PASS `2`、BLOCKED `0` | BLOCKED | 覆盖 `PROC-001~016`、Control `20` 允许组合、全部冻结反例和 Structural 全 coverage key |
| Schema 的 PASS 期望 | Sentence 的 Golden 特有字段封闭；Fact、Token、SourceRef 和 Trace 复用 Revision v0.2 定义，PASS/BLOCKED 字段互斥、空 Token/Trace 被拒绝 | CLOSED (`GATE-05-01`) | 后续 Gate 只可复用该契约，不得复制 Revision 定义 |
| 资产身份与版本 | Validator 从 Profile manifest 的 required entry 解析四项资产，校验 package/entry byte length/digest、内部 ID/version、dependency/direct ref 和路径边界 | CLOSED (`GATE-05-01`) | Replay runner 复用该 loader 闭包 |
| Fixture binding | 两个 fixture 使用 Profile package digest、五项真实 ref 和 role/id/version/digest 行编码，binding 为 `93805d6e...` | CLOSED (`GATE-05-01`) | Replay 与 Compatibility 必须保持同一算法 |
| Binding 算法 | `LocalApiService.profileBinding()` 当前对五个 digest 做无分隔字符串拼接后计算 SHA-256；Golden manifest 又把 `profile.json` 文件 SHA 当作 Profile ref，二者都不满足“覆盖完整依赖引用”的冻结口径 | BLOCKED | 统一采用下方 role/id/version/digest 行编码算法；Profile ref 使用 package digest，Manifest、Revision、Reader、Validator 和 replay 结果一致 |
| Fixture 可执行性 | Java replay 已按 manifest 枚举两个 PASS，并逐项比较 binding、Sentence、Token、Trace；逻辑仍全部位于 JUnit，Grammar 路径仍硬编码，且没有 BLOCKED/SQLite 回读 | PARTIAL | 下沉为主代码 runner，由 CLI/JUnit 共用并扩展代表性 BLOCKED 和事务回读 |
| Artifact SHA | Java replay 从 manifest 读取 `expected_artifact_sha256`，与连续两次生成结果的 artifact digest 比较；脚本仍不生成 artifact | PARTIAL | Validator/replay runner 生成规范化 artifact bytes，并与 manifest SHA、Sentence、Token、Trace 逐项比较 |
| Coverage gate | `golden:coverage` 只检查 `16 + 8 + 10` 个主 ID；当前仅覆盖 `PROC-006`、`STRUCT-003`，缺 `32` 个主 ID，也不检查 Control 20 组合、Structural variant 或 PASS/BLOCKED coverage key | BLOCKED | 从冻结 coverage catalog 读取精确 key，验证组合、variant、fan、完整性、State 位置和正反例集合无缺口 |
| BLOCKED 与原子性 | Manifest 没有 BLOCKED case；Schema 只要求 `expected_error_code`，未承载 Revision/Text Artifact/Head 不移动的期望 | BLOCKED | 为每个冻结阻断输入保存稳定 error code 和无提交断言，并由事务 replay runner 验证 |
| Base/candidate 输入 | 每个现有 case 都包含完整 base Revision 与 candidate；Validator 校验 model、sequence、revision ID、parent 和 exact binding 守卫 | CLOSED (`GATE-05-01`) | `GATE-05-02` 将以该输入执行隔离事务回放 |
| 命名与追踪 | Procedural fixture 文件名为 `g-opl-proc-001-consumption-state.json`，但 case/capability 为 `PROC-006` | PARTIAL | 文件名、case ID、Capability 和 manifest 引用采用同一编号或显式记录别名映射 |

### DEV-CANVAS-05 剩余闭环 Gate

### 2026-07-30 Local API ACTIVE 路径证据

`LocalApiService` 已使用 `ProfilePackageAssembler` 装配当前 Revision 的五项资产，并在编辑提交与 `text()` 查询中调用正式 `TextGenerationAssets` 入口。新建 Revision 的绑定为 Profile/Grammar `0.2.0`，Rule/Symbol/Normalization `0.1.0`，其 canonical binding digest 为 `93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d`。`FileProfilePackageLoader` 对不存在的相对资产根目录向父目录解析，保证从 `services/local-runtime` 运行时仍能解析仓库的 `packages/profiles`；显式绝对目录和最终不存在路径的失败语义不变。

本轮以 JDK 21 执行 `LocalApiServiceTest,LocalApiControllerTest`，共 `18/18` 通过，覆盖模型创建、ACTIVE 编辑提交、正式文本投影和 MVC 主路径；最新 Procedural 扩展后的 Golden replay 为 `cases=35 pass=17 blocked=18 failed=0`，其中 Procedural 为 `16 PASS + 17 BLOCKED`，每个 PASS 都含静态 Candidate、Fact、Projection、Sentence、Token、Trace 与 artifact SHA。`npm run golden:contract:test` 为 `21/21`，`npm run contract:validate` 通过。上述证据关闭最小代表集的 `GATE-05-02` 和 Procedural coverage 子集，但不关闭 `GATE-05-03` 至 `GATE-05-06`，因为 Control/Structural exact coverage、全变体 Token/Trace 闭包、Atomic BLOCKED 集合与兼容性交接仍未完成。

`OplGoldenReplayRunner` 的 PASS 静态断言、Artifact SHA 与 SQLite 回读现均复用 `ProfilePackageAssembler` 组装的正式 `TextGenerationAssets`。`G-OPL-PROC-006.CONSUMPTION_STATE.PASS` 的 Rule 为 `rule.iso.proc.state-consumption.endpoints.v1`，`G-OPL-STRUCT-003.BIDIRECTIONAL_OBJECT_TAGGED.PASS` 的正反两句均为 `rule.iso.struct.tagged.bidirectional.v1`；每个 Grammar SourceRef 指向对应 `templates[template_id=...].pattern`。两组正式 artifact SHA-256 分别为 `f8fc3b0f2b2565bcda4f70d21d970422f7dfd74f38fbdfc8be387be7d6171f4a` 与 `ea4ec96e6ce2a7fac2dc0f61f213b7f4ae4e5da541816a21b4af724fd0d0db91`。

以下 Gate 是依赖链，不得并行绕过上游契约批量生成 fixture。

1. [x] `GATE-05-01 Golden Contract`：设计输入为 `FROZEN`，实现验收为 `CLOSED`。两个 fixture 使用真实 binding，且空 Token/Trace、条件字段冲突、错误资产身份、错误依赖、错误 digest、越界路径和 base/candidate 守卫的 `13` 个 mutation 均按稳定错误码被拒绝。
2. [x] `GATE-05-02 Manifest Replay`：设计输入为 `FROZEN`，实现验收为 `CLOSED`。`npm run golden:replay` 可独立执行；PASS 逐项比较并以正式 `TextGenerationAssets` 连续回放两次，BLOCKED case 均无 Revision/Text Artifact/Head 移动，JUnit 只调用主代码 runner。完整 coverage 与 Token/Trace 证据见 `GATE-05-03/04`。
3. [x] `GATE-05-03 Exact Coverage`：版本化 catalog 与 manifest 的 `178` 个 requirement 精确匹配，`npm run golden:coverage` 返回 `EXACT`，没有 missing、unexpected 或 mismatched case。
4. [x] `GATE-05-04 Token/Trace Closure`：所有 concrete variant 的 Token/Trace Golden、`TTRACE-MUT-001~022` 参数化分支、Revision Schema 校验、SQLite 深度回读与 Trace index 精确元组均已通过；ACTIVE 生成路径不出现 `LEGACY/PROCESS/OBJECT`。
5. [x] `GATE-05-05 Structural/Atomic Closure`：`Structural 24/24` 已通过；`19` 个 Atomic BLOCKED case 以独立 Profile 副本、独立 SQLite 和两次 attempt 从正式 `CandidateRevisionCommitter` 回放，均命中冻结的顶层/detail 错误。SQLite 重开后 Revision、Parent、Trace、Finding、Operation、Receipt 均为零增量，Head ID/sequence 不变；预提交失败路径的 repository `commit()` 调用次数为 `0`。
6. [ ] `GATE-05-06 Compatibility/Handoff`：本 checklist 下方已冻结不可变 Revision `0.1`、独立 `0.2`、13 个兼容 case、旧/新 exact binding、Handoff Schema、34 项 eligibility 和 DEV-CANVAS-06 准入；设计输入状态为 `FROZEN`，实现验收状态仍为 `BLOCKED`。关闭证据为 Compatibility `13/13`、前五 Gate 报告全 matched、clean release artifacts/handoff SHA 完整且 production gate 仍为 `DISABLED`；未关闭前不得勾选 DEV-CANVAS-06 输入门槛。

### 2026-07-29 Golden Contract 增量证据

`GATE-05-01` 已从空 Token/Trace 的骨架推进为可执行的 PARTIAL：Golden Schema 对 PASS Sentence、Token、Trace、SourceRef、UTF-8 range、Profile/Rule/Grammar/Symbol/Normalization 引用与 binding digest 采用封闭字段和非空约束；两个既有 PASS fixture 已写入静态 Token/Trace 期望及真实 `0.2.0/0.1.0` 资产版本和 binding digest。`golden:check` 现会校验 Profile dependency、资产内部 id/version/SHA-256、fixture binding、Fact、Symbol、Token 连续 UTF-8 覆盖和 Trace 引用闭合；Java manifest replay 逐项断言这些静态期望并连续生成两次。

本项当时仍不能关闭：只有 `2` 个 PASS case，未含 BLOCKED fixture，也未覆盖全量 capability/variant。后续实现已完成 `GATE-05-01` 的契约验收；`golden:coverage` 的缺口归属于 `GATE-05-03`，BLOCKED 事务回放归属于 `GATE-05-02/05`。视觉/浏览器 E2E、性能、ISO 符合性与 Capability 生产启用均未执行。

### GATE-05-01 Golden Contract 冻结执行契约

本节是 `GATE-05-01` 的唯一实施口径。Schema、Validator 和两个代表性 fixture 必须满足以下契约；全量 coverage 与事务 replay 由后续 Gate 负责。

#### 1. Case 条件字段

| Case 类型 | 必填 | 禁止 | 数量/顺序约束 |
| --- | --- | --- | --- |
| 公共 | `case_id`、`capability_id`、`variant_key`、`expectation`、`base_revision_fixture`、`input_revision_fixture`、五项 asset ref、`binding_digest` | 未声明字段；所有对象 `additionalProperties: false` | `case_id` 唯一；ID 中 family、ordinal、variant、expectation 必须与字段一致 |
| `PASS` | `expected_normalized_fact`、`expected_projection`、`expected_sentences`、`expected_artifact_sha256` | `expected_error_code`、`expected_transaction` | Sentence 至少 `1` 条，按 ordinal 升序；每句 Token 至少 `1` 个且恰有一个 Trace |
| `BLOCKED` | `expected_error_code`、`expected_transaction` | `expected_normalized_fact`、`expected_projection`、`expected_sentences`、`expected_artifact_sha256` | `expected_transaction` 的所有增量为 `0`，`draft_head_changed=false` |

`expected_transaction` 固定字段为 `revision_delta`、`revision_parent_delta`、`text_artifact_delta`、`text_trace_delta`、`finding_delta`、`operation_delta`、`receipt_delta` 和 `draft_head_changed`；前七项只能取整数 `0`，最后一项只能取 `false`。BLOCKED case 不允许用缺失字段表示“未检查”。

`base_revision_fixture` 是事务回放前已提交并作为 Draft Head 的 Revision，必须通过完整 `opm-revision.schema.json`；`input_revision_fixture` 是待生成/提交的 candidate，只允许通过新增的 `opm-opl-golden-candidate-revision.schema.json`。Candidate Schema 复用 Revision Schema 的 Profile Binding 和全部语义 `$defs`，但禁止 `text_artifact/text_traces/validation_summary/revision_digest`，防止把预期输出偷渡进输入。两者必须满足相同 `model_id`、candidate `revision_sequence = base + 1`、candidate `revision_id != base.revision_id`、candidate `parent_revision_id = base.revision_id` 和本 case 的 exact binding；禁止由 runner 猜测、修补或反向生成 base Revision。该字段和 Candidate Schema 是 `GATE-05-02` 事务审计发现的必要输入，纳入 `GATE-05-01` 最终机器契约。

#### 2. PASS 输出对象边界

1. `expected_normalized_fact` 必须是完整 Fact，复用 `opm-revision.schema.json#/$defs/fact`，不得只保存 `fact_id + endpoint_roles` 摘要；Endpoint、Modifier、Label 和 completeness 顺序均进入比较。
2. `expected_projection` 是不含画布几何的规范化 Symbol Descriptor，固定包含 `symbol_id`、`line`、`source_marker`、`target_marker`、`junction_marker`、`annotation`、`completeness_annotation`、`label_slots`、`route_family`。缺失的可选 descriptor 值显式写 `null`；Catalog 中显式字符串 `none/inherit-base` 保持原值，不转成 `null`。
3. `expected_sentences[]` 固定包含 `sentence_id`、`ordinal`、`sentence_slot`、`template_id`、`utf8_text`、`generation_rule_ids`、`input_fact_ids`、`tokens` 和 `trace`。数组顺序就是 artifact 顺序，不允许 Validator 排序后掩盖生成顺序错误。
4. Token、SourceRef 和 Trace 分别复用 Revision Schema 的 `sentenceToken/sourceRef/textTrace`；Golden 追加 `tokens.minItems=1`、Token ordinal 从 `0` 连续、UTF-8 range 无 gap/overlap、Token 文本重建 `utf8_text`、`trace.sentence_ids` 长度为 `1` 且等于当前 `sentence_id`。
5. `trace.token_ranges` 和全部 `source_refs` 保持生成顺序并逐项比较；Golden Validator 只检查结构和局部闭包，完整语义来源闭包由 `GATE-05-04` 的 replay 验证，不在 Schema 中伪造推理。

Golden Schema 必须由 Validator 注册 `opm-revision-v0.2.schema.json`，通过其 `$id` 解析上述 `$ref`；处理 `0.1` base Revision 时另按 `$id` 注册既有 `opm-revision.schema.json`，禁止复制一份会与 Revision 演进漂移的 Fact/Token/Trace 定义。

#### 3. Asset ref 与内部身份

每个 case 必须包含 `profile_ref`、`rule_set_ref`、`grammar_ref`、`symbol_catalog_ref`、`normalization_adapter_ref` 和 `binding_digest`。五项 ref 均为封闭的 `id/version/sha256` 对象；沿用 Revision 的 `normalization_adapter/binding_digest` 术语，不新增同义字段。

| Ref | 内部 ID | 内部 version | `sha256` 口径 |
| --- | --- | --- | --- |
| Profile | `identity.profile_id` | `identity.package_version` | `manifest.package_digest.digest`；不是 `profile.json` 文件 SHA |
| Rule Set | `rule_set_id` | `rule_set_version` | manifest entry 指向文件的原始 bytes SHA-256 |
| Grammar | `asset_id` | `asset_version` | manifest entry 指向文件的原始 bytes SHA-256 |
| Symbol Catalog | `asset_id` | `asset_version` | manifest entry 指向文件的原始 bytes SHA-256 |
| Normalization | `asset_id` | `asset_version` | manifest entry 指向文件的原始 bytes SHA-256 |

Validator 不再把资产路径写死在脚本中：Profile 固定由 manifest 所在 Profile 根目录的 `profile.json` 进入，其余四项只能从 Profile manifest 的 required entry 解析；解析后的规范路径必须仍位于 Profile 根目录内。Profile `dependencies`、直接 ref、manifest entry 的 role/path/byte length/digest 和资产内部身份必须全部一致。

当前 `0.2.0` 包的正确 binding 输入冻结为：Profile `0.2.0/5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c`、Rule `0.1.0/4293cb22cf2e2e92fe212ed3c31119992509c8a675daa554c64a2ccf10457d64`、Grammar `0.2.0/c88e672bd9db7f0405a7ef3fc464043f15cae844931192e3412c94ce05339e7d`、Symbol `0.1.0/511dbaec2adb6f49ed6a4d28844e69d1310eb7a67f213e4a30b0ddfc21ef6098`、Normalization `0.1.0/6401336ad4b63127047ccd5d50cc418554f0c8490547a6024939b4da5774194c`。

#### 4. Binding digest 算法

Golden `binding_digest` 与 Revision `profile_binding.binding_digest.digest` 使用同一算法：按固定 role 顺序 `PROFILE`、`RULE_SET`、`GRAMMAR_ASSET`、`SYMBOL_ASSET`、`NORMALIZATION_DATA`，每行编码为 `<ROLE>\t<ID>\t<VERSION>\t<SHA256>\n`，整体以 UTF-8/LF 编码后计算 SHA-256 小写十六进制。禁止依赖 JSON 属性顺序、平台换行或简单拼接无分隔 digest。

当前五项 binding 的 canonical preimage 长度为 `566` bytes，结果必须为 `93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d`。Manifest、两个 input Revision fixture、Reader、Validator 和 replay 必须使用同一值。

#### 5. Validator 顺序与稳定错误

Validator 按以下顺序短路，保证 mutation 只有一个首要错误：

1. Golden Schema：`GOLDEN_SCHEMA_INVALID`；
2. case ID、variant、expectation 和互斥字段：`GOLDEN_CASE_CONFLICT`；
3. fixture/asset 规范路径边界：`GOLDEN_ASSET_PATH_INVALID`；
4. Profile package manifest、byte length 和文件 digest：`GOLDEN_ASSET_DIGEST_MISMATCH`；
5. 资产内部 ID/version：`GOLDEN_ASSET_IDENTITY_MISMATCH`；
6. Profile dependency/ref/manifest 三方一致性：`GOLDEN_PROFILE_DEPENDENCY_MISMATCH`；
7. fixture Revision Schema 与 case binding 一致性：`GOLDEN_FIXTURE_SCHEMA_INVALID`；
8. canonical binding digest：`GOLDEN_BINDING_DIGEST_MISMATCH`。

`GATE-05-01` 最小 mutation 集固定为：PASS 空 Token、PASS 空/缺 Trace、PASS 携带 error、BLOCKED 携带生成输出、缺 Normalization ref、Rule version 错误、Symbol internal ID 错误、Profile file SHA 冒充 package digest、Normalization digest 错误、Profile dependency 与 ref 不一致、binding digest 错误、fixture `../` 越界、base/candidate 的 model/sequence/parent 任一不匹配。每个 mutation 必须断言上述稳定错误码；只断言“命令失败”不算关闭证据。

#### 6. Gate 退出证据

- [x] Schema 字段、条件字段、内部身份路径、digest 口径和校验顺序已在设计中冻结。
- [x] Golden Schema 引用 Revision Schema，并拒绝空 Token/Trace、PASS/BLOCKED 字段冲突及 base/candidate 守卫不成立。
- [x] Manifest 和两个 fixture 使用五项真实 ref 及 `93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d`。
- [x] Validator 不使用四项资产硬编码路径，并完成 Profile dependency/ref/manifest/内部身份闭包。
- [x] 上述 `13` 个 mutation 全部按稳定错误码通过。
- [x] `npm run golden:check` 通过；`golden:coverage` 的缺口只归属于 `GATE-05-03`，不得反向阻塞本 Gate 的契约验收。

### GATE-05-02 Manifest Replay 冻结执行契约

本节冻结独立 replay 的唯一执行口径。`GATE-05-01` 必须先通过，runner 才能处理 case；`GATE-05-03` 的完整 coverage 缺口不阻止本 Gate 使用最小代表集验证 runner 本身。

#### 1. 当前实现差距

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| 独立命令 | `package.json` 只有 `golden:check/golden:coverage`，没有 `golden:replay` | BLOCKED | 根目录提供固定 `npm run golden:replay` 入口 |
| Replay 所有权 | replay 逻辑只在 `OplTextGenerationServiceTest.replaysEveryPassCaseDeclaredByVersionedGoldenManifest()` 中；只枚举 PASS | BLOCKED | 主代码 runner 是唯一执行者；CLI 与 JUnit 都只调用 runner |
| 资产解析 | JUnit 只核对 Grammar ref，并硬编码 `grammar/representative-opl-grammar.json` | BLOCKED | 只从 Profile manifest/ref 解析五项资产，复用 `GATE-05-01` loader 闭包 |
| 输出比较 | 当前只比较文本、template、sentence slot 和 Java object equality；未比较完整 Fact、Projection、Token、Trace 或 SQLite 回读 | BLOCKED | 按下方固定阶段逐项比较并输出机器结果 |
| Artifact digest | `OplTextGenerationService` 当前对 Sentence 文本以 LF 拼接后计算 SHA-256，Token、生成 Rule、Grammar ref 和 paragraph 身份均未进入 bytes | BLOCKED | 使用下方 canonical artifact bytes；`artifact_digest` 与 `expected_artifact_sha256` 同口径 |
| Revision Text Artifact | `SqliteRevisionCommitRepository.document()` 当前未写 `modality`，把 `artifact_digest` 写成裸字符串，并写入 Revision Schema 未声明的 `grammar_binding`；尚无 committed document Schema 回读验证 | BLOCKED | Writer 与 Revision Schema 使用同一版本化形状，digest 使用 `{algorithm,digest}`，Grammar ref 有且只有一个正式承载位置 |
| BLOCKED/原子性 | Manifest 没有 BLOCKED case，现有 JUnit 不创建隔离 SQLite，也不检查 Head 和表增量 | BLOCKED | 至少一个代表性 BLOCKED case 双重回放，稳定错误和零增量均通过 |
| 机器报告 | 当前仅有 Surefire 结果，没有逐 case replay report | BLOCKED | 生成并校验版本化 report JSON |

#### 2. 固定入口与代码职责

根目录命令冻结为：

```text
npm run golden:replay
```

`package.json` 的 `golden:replay` 必须先执行 `npm run golden:check`，再使用仓库已有 `spring-boot-maven-plugin` 运行 `org.opm.localruntime.golden.OplGoldenReplayCli`；默认 manifest 固定为 `packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json`，默认报告固定为 `services/local-runtime/target/golden-replay/opm-opl-golden-replay-report.json`。不得引入新的运行时依赖，也不得让 npm/Node 重新实现 Java 的 OPL、Trace 或事务规则。

主代码职责固定如下：

| 组件 | 唯一职责 | 禁止职责 |
| --- | --- | --- |
| `OplGoldenReplayCli` | 解析 `--manifest/--report`，调用 runner，打印摘要并映射退出码 | 不解析 case 语义、不比较 Golden |
| `OplGoldenReplayRunner` | 枚举 manifest、装配资产/Revision/Projection/Generator/事务、执行两次回放并产生结果 | 不硬编码 fixture、文本、Capability 或 digest |
| `OplGoldenArtifactCanonicalWriter` | 生成下方唯一 canonical artifact bytes 和 SHA-256 | 不生成 OPL、不排序业务数组来掩盖顺序错误 |
| `OplGoldenReplayReportWriter` | 按 Report Schema 写机器报告 | 不改变 case 判定 |

`FileProfilePackageLoader`、`SemanticRevisionReader`、`OplGrammarAssetLoader`、`OplTextGenerationService` 和 `SqliteRevisionCommitRepository` 继续作为正式路径复用。Rule/Symbol/Normalization 若缺 loader，必须补在 asset 层并由生产与 replay 共用，禁止在 runner 内用临时 JSON 查询替代正式装配。

JUnit 只允许调用 `OplGoldenReplayRunner` 并断言 `failed_count=0`；现有测试中的 manifest 路径解析、Sentence 字段循环和 artifact digest 比较必须删除或下沉到 runner，避免测试代码成为第二事实源。

#### 3. Case 输入、隔离与执行次数

1. Case 只能按 manifest 数组顺序枚举；禁止扫描 fixture 目录、按文件名猜 case 或跳过未知 expectation。
2. 每个 case 先按 `GATE-05-01` 校验 base/candidate、五项 ref、binding 和规范路径，再进入 replay。
3. 每个 case 固定执行 `attempt=1/2` 两次；每次重新读取文件、重新装载资产，并使用全新的 SQLite 数据库，禁止共享 Java 对象、缓存或数据库状态。
4. 临时数据库和 canonical artifact 只写入 `services/local-runtime/target/golden-replay/work/<case_id>/<attempt>/`；不得修改 Profile、fixture、manifest 或仓库数据库。
5. 每次先以 `base_revision_fixture` 原始 committed document 初始化 `revision_document/model_head`，再以 `input_revision_fixture` 作为 candidate；runner 不得生成、修补或覆写两份 Revision。
6. 事务元数据由 runner 确定性派生：`command_id` 使用 `command.golden.<case_id-sha256前32位>`，`request_digest` 使用 candidate fixture 原始 bytes SHA-256，`commit_reason=GOLDEN_REPLAY`，`occurred_at=2000-01-01T00:00:00Z`。这些字段不进入 artifact digest。
7. 两次 attempt 的 observed expectation、错误码、Sentence/Token/Trace、canonical artifact bytes 和事务判定必须一致；任一差异返回 `REPLAY_NONDETERMINISTIC`。

#### 4. Canonical artifact bytes

`expected_artifact_sha256` 不再表示“Sentence 文本拼接 SHA”。它固定为 `OPL-GOLDEN-ARTIFACT-001/0.1` 的完整 Text Artifact canonical bytes SHA-256；Trace 不并入 Artifact digest，但必须独立逐项比较并计算 report 中的 `trace_sha256`。

Canonical Artifact 固定字段顺序如下：

```text
schema_id, schema_version, artifact_id, revision_id, modality,
context_id, grammar_ref, paragraphs
```

`grammar_ref` 固定为 `id/version/sha256`；`paragraphs[]` 固定为 `paragraph_id/context_id/ordinal/sentences`；`sentences[]` 固定为 `sentence_id/ordinal/sentence_slot/template_id/utf8_text/generation_rule_ids/input_fact_ids/tokens`；Token 和 SourceRef 字段顺序沿用 `GATE-05-01`。缺失的 SourceRef 可选字段直接省略，不写 `null`。

序列化规则固定为 UTF-8、无 BOM、NFC、无缩进、无尾随换行；JSON object 使用上述固定字段顺序，数组严格保持 Generator 顺序，数字只允许十进制整数。`artifact_digest` 不写入 preimage，防止自引用；计算结果同时写入运行时 `OplTextArtifact.artifactDigest`、committed Revision `text_artifact.artifact_digest.digest`、manifest `expected_artifact_sha256` 和 report，committed Revision 同时写 `artifact_digest.algorithm=sha256`。禁止在比较前重排 Sentence、Token、SourceRef 或 Trace。

Revision Schema 的 Text Artifact 必须与 canonical artifact 对齐：保留 `modality=OPL`，Grammar ref 采用 `grammar_ref: {id,version,digest}`，不得同时保留另一套 `grammar_binding`。这是兼容 Schema 演进，不修改 SQLite DDL；旧 Revision 的读取兼容性仍由 `GATE-05-06` 验证。

#### 5. PASS 比较和提交顺序

PASS case 每次 attempt 必须按以下顺序短路并记录首个失败码：

1. 从 candidate 按 `expected_normalized_fact.fact_id` 取得完整 Fact，逐字段/逐数组比较：`REPLAY_FACT_MISMATCH`；
2. 由 Symbol Catalog 和 Fact/Control composition 解析规范化 Projection：`REPLAY_PROJECTION_MISMATCH`；
3. 生成 OPL，并按 manifest 顺序比较 Paragraph/Sentence 数量、ID、ordinal、slot、template、文本、Rule 和 input Fact：`REPLAY_SENTENCE_MISMATCH`；
4. 比较每个 Token 的全部字段、UTF-8 range 和 SourceRef 顺序：`REPLAY_TOKEN_MISMATCH`；
5. 比较每个 Sentence 恰有一个 Trace、全部 Trace 字段、range 和 SourceRef 顺序：`REPLAY_TRACE_MISMATCH`；
6. 生成 canonical artifact bytes 并比较 `expected_artifact_sha256`：`REPLAY_ARTIFACT_DIGEST_MISMATCH`；
7. 通过正式事务提交 candidate，重新读取 committed Revision，证明 `text_artifact/text_traces` 与内存结果等价：`REPLAY_COMMIT_STATE_MISMATCH`；
8. 比较 attempt 1/2 的 artifact bytes、Trace canonical bytes 和上述判定：`REPLAY_NONDETERMINISTIC`。

PASS 提交后固定断言：Revision `+1`、Parent `+1`、包含 Text Artifact 的 Revision `+1`、Operation `+1`、Receipt `+1`、Draft Head 指向 candidate；Trace index 行数等于生成 Trace 的 `fact_ids × sentence_ids` 展开数量，Finding 行数等于 Validation 结果。只比较内存对象而不回读 SQLite，不算 replay 通过。

#### 6. BLOCKED 与原子性

`GATE-05-02` 的最小代表性 BLOCKED case 固定为 `G-OPL-CTRL-001.RESULT.BLOCKED`，基础 Fact 为 `CAP-ISO-PROC-002`，Control 为 `CAP-ISO-CTRL-001`，期望错误为 `MODIFIER_COMBINATION_INVALID`。该 case 只证明 runner 的 BLOCKED/事务机制；其余完整禁止组合由 `GATE-05-03` 补齐。

每次 BLOCKED attempt 都必须执行与 PASS 相同的正式验证、文本和提交装配入口，捕获稳定业务错误；不得在 runner 中按 `expectation=BLOCKED` 直接跳过执行。失败后重新打开 SQLite，逐项比较 manifest 的 `expected_transaction`：Revision、Parent、Text Artifact、Trace、Finding、Operation、Receipt 增量均为 `0`，Draft Head ID 和 sequence 均未变化。错误码不符、异常阶段绕过正式入口或任一增量非零，统一记为 `REPLAY_BLOCKED_STATE_MISMATCH`。

#### 7. Replay Report 与退出码

新增 `opm-opl-golden-replay-report.schema.json`，`schema_id=OPL-GOLDEN-REPLAY-REPORT-001`、`schema_version=0.1`。报告至少包含：manifest ID/version/原始 bytes SHA、runner version、Profile binding、`case_count/pass_count/blocked_count/failed_count`，以及每个 case 的 expectation、observed status、两次 attempt、artifact SHA、trace SHA、各比较阶段、稳定 error code 和事务增量。

Case observed status 只允许 `PASS_MATCHED/BLOCKED_MATCHED/FAILED`。进程退出码冻结为：`0` 全部 matched；`2` Manifest/Schema/asset 输入无效；`3` 至少一个 replay mismatch；`4` runner I/O 或未分类内部错误。预期的 BLOCKED 且零增量属于 matched，不能返回非零退出码。

#### 8. Gate 退出证据

- [x] command、主代码职责、base/candidate、canonical bytes、双重隔离、比较顺序、原子性和 report 已在设计中冻结。
- [x] `GATE-05-01` 的 Schema、真实 binding 和 mutation 全部通过。
- [x] `npm run golden:replay` 可从根目录独立执行，且不要求人工先运行 JUnit。
- [x] 两个现有 PASS case 的完整 Fact/Projection/Sentence/Token/Trace、canonical SHA 和 SQLite 回读均 matched。
- [x] `G-OPL-CTRL-001.RESULT.BLOCKED` 两次返回 `MODIFIER_COMBINATION_INVALID` 且事务零增量。
- [x] `G-OPL-PROC-015.DURATION_MISSING.BLOCKED` 两次返回 `INVALID_ARGUMENT` 且事务零增量。
- [x] JUnit 只调用 runner，仓库不存在第二套 manifest replay 比较逻辑。
- [x] Replay Report 通过自身 Schema；当前 69 case 重放为 `pass_count=37`、`blocked_count=32`、`failed_count=0`。该计数包含已关闭的 Procedural 与 Control 子集，不代表 Structural coverage 已关闭。
- [ ] `golden:coverage` 的 32 个主 ID 缺口继续归入 `GATE-05-03`，不得把最小 runner 验收误报为完整 coverage。

### GATE-05-03 Exact Coverage 冻结执行契约

本节冻结完整 Golden 集合的唯一 coverage 口径。Coverage 只证明 manifest 是否精确覆盖冻结集合，不替代 `GATE-05-02` 的实际 replay、`GATE-05-04` 的 Token/Trace 语义闭包或 `GATE-05-05` 的结构与事务验证。

#### 1. 当前实现差距

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| Coverage 来源 | `requiredMainIds()` 在 Node 脚本内硬编码 `16 + 8 + 10` 个主 ID | BLOCKED | 只从版本化 coverage catalog 读取 requirement，脚本不维护第二份集合 |
| Coverage 粒度 | 当前 key 含 family/capability/base/variant/expectation，但 `--coverage` 只检查主 ID presence | BLOCKED | 对 catalog 与 manifest 的完整 key 集做精确相等比较 |
| Control | 静态 manifest 已为 `20/20` PASS、`15/15` BLOCKED；两次 replay 均 matched，且每句 Rule/Trace 保留 `[base Procedural, Control]` 顺序 | CLOSED | Control 的 `35` 个 coverage requirement 已全部进入静态 manifest 并重放 |
| Structural | 当前仅有一个 `STRUCT-003` Object Bidirectional case | BLOCKED | 94 个 PASS 变体和 16 类冻结反例全部进入 manifest |
| Procedural | manifest 为 `16/16` PASS、`17/17` BLOCKED；两次 replay 均 matched | CLOSED | Procedural 的 `33` 个 coverage requirement 已全部进入静态 manifest 并重放 |
| 报告 | 当前命令只抛出缺失主 ID 文本，没有 catalog digest、unexpected/mismatch 或机器报告 | BLOCKED | 生成并校验固定 Coverage Report JSON |

按本节冻结集合，完整 catalog 固定为 `178` 个 requirement：PASS `130`、BLOCKED `48`。当前 `69` 个 manifest case 均能映射到冻结 key，精确报告为 matched `69`、missing `109`、unexpected/mismatched `0`；缺口仅为 Structural `93` PASS 与 `16` BLOCKED，不得再以旧主 ID presence 差距作为本 Gate 的完成口径。

Procedural BLOCKED candidate fixture 由 `scripts/author-opl-procedural-blocked-fixtures.mjs` 在资产编写阶段从固定 base Revision 和 catalog 显式 mutation 生成。Procedural PASS candidate 则由 `scripts/author-opl-procedural-pass-fixtures.mjs` 从同一 base Revision 和 `opm-opl-procedural-pass-definitions.json` 生成。Control PASS candidate 由 `scripts/author-opl-control-pass-fixtures.mjs` 从对应 Procedural candidate 保留原 `fact_id` 后只加入冻结 Control pair；`OplProceduralPassGoldenAuthorCli --control` 必须以 `opm-opl-control-pass-definitions.json` 断言运行时 canonical text/template/slot 与 `[base Procedural rule_ref, Control rule_ref]`，再写入静态 Sentence/Token/Trace/artifact Snapshot。Control BLOCKED candidate 由 `scripts/author-opl-control-blocked-fixtures.mjs` 逐项生成，覆盖 15 个独立首要错误。`golden:proc:*:check` 与 `golden:ctrl:*:check` 只比较已落盘资产；replay runner 不调用任一编写期工具，也不生成、修补或覆写 candidate。

#### 2. Catalog 所有权与摘要链

新增以下机器资产：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-coverage-catalog.json
docs/contracts/schemas/opm-opl-coverage-catalog.schema.json
docs/contracts/schemas/opm-opl-golden-coverage-report.schema.json
```

Catalog 固定 `catalog_id=coverage.opl.iso19450.2024.draft`、`catalog_version=0.1.0`、Schema `OPL-GOLDEN-COVERAGE-CATALOG-001/0.1`。Golden manifest 顶层新增必填 `coverage_catalog_ref: {id,version,path,sha256}`；`path` 固定为 `golden/opm-opl-coverage-catalog.json`，`sha256` 是该文件原始 bytes 的 SHA-256。

Coverage catalog 是测试/enablement 证据资产，不是 Revision 的语义依赖，不加入 Profile manifest 的四项 required entry，也不进入五 role `binding_digest`；因此不会改变已冻结的 Profile package digest `5287d3ce...f899c` 或 binding `93805d6e...65d1d`。Golden manifest 和 Coverage Report 必须记录 catalog digest，禁止仅凭固定路径信任文件。

#### 3. Requirement 与 coverage key

Catalog `requirements[]` 的公共字段固定为：

```text
coverage_key, case_id, family, capability_id, base_fact_capability_id?,
variant_key, expectation, required_template_ids?, expected_sentence_slots?,
expected_error_code?, dimensions, transition?
```

1. `coverage_key` 固定编码为 `<FAMILY>:<CAPABILITY_ID>:<BASE_OR_->:<VARIANT_KEY>:<EXPECTATION>`；例如 `CTRL:CAP-ISO-CTRL-003:CAP-ISO-PROC-008:EFFECT_INPUT_OUTPUT:PASS`。
2. `case_id` 必须等于 `G-OPL-<FAMILY>-<ordinal>.<VARIANT_KEY>.<EXPECTATION>`；ordinal 与 `capability_id` 一致。
3. 一个 manifest case 恰好匹配一个 requirement；不得用一个宽泛 case 声称覆盖多个 key，也不得按同一 case 的多条 Sentence 重复计数。
4. PASS 必填 `required_template_ids/expected_sentence_slots`，禁止 `expected_error_code`；BLOCKED 必填稳定 `expected_error_code`，禁止模板和句槽期望。
5. `dimensions` 是封闭对象，只允许 `endpoint_domain/direction/tag_mode/state_position/fan_size/completeness/feature_kind/mixed_group_shape`；枚举分别固定为 `OBJECT|PROCESS`、`UNIDIRECTIONAL|BIDIRECTIONAL|RECIPROCAL`、`TAGGED|NULL_TAG`、`SOURCE|DESTINATION|BOTH`、整数 `1|2|3`、`COMPLETE|INCOMPLETE|NOT_APPLICABLE`、`ATTRIBUTE|OPERATOR|MIXED`、`A1_O1|A1_O2|A2_O1`。不适用字段省略，不写自由字符串。
6. `transition` 仅用于 fan 更新，固定包含 `kind=ADD|DELETE|REORDER|COMPLETENESS_SWITCH`、`base_fan_size`、`candidate_fan_size`、`preserve_fact_id=true`；candidate fan size 同时作为该 requirement 的 `fan_size`。
7. Catalog order 是 Coverage Report 的输出顺序；manifest 可以按独立 replay 顺序排列，validator 不得排序后掩盖重复 case 或字段冲突。

#### 4. Procedural 精确集合

| Capability | PASS variant | BLOCKED variant | 稳定错误 |
| --- | --- | --- | --- |
| `PROC-001` | `CONSUMPTION_OBJECT` | `ENDPOINTS_REVERSED` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-002` | `RESULT_OBJECT` | `ENDPOINTS_REVERSED` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-003` | `EFFECT_OBJECT` | `ENDPOINTS_REVERSED` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-004` | `AGENT_OBJECT` | `ENDPOINTS_REVERSED` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-005` | `INSTRUMENT_OBJECT` | `ENDPOINTS_REVERSED` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-006` | `CONSUMPTION_STATE` | `STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-007` | `RESULT_STATE` | `STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-008` | `EFFECT_INPUT_OUTPUT_STATE` | `INPUT_STATE_OWNER_MISMATCH`、`OUTPUT_STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-009` | `EFFECT_INPUT_STATE` | `INPUT_STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-010` | `EFFECT_OUTPUT_STATE` | `OUTPUT_STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-011` | `AGENT_STATE` | `STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-012` | `INSTRUMENT_STATE` | `STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `PROC-013` | `INVOCATION_PROCESS` | `TARGET_KIND_INVALID` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-014` | `SELF_INVOCATION_SAME_PROCESS` | `SELF_IDENTITY_MISMATCH` | `ENDPOINT_KIND_MISMATCH` |
| `PROC-015` | `OVERTIME_DURATION` | `DURATION_MISSING` | `INVALID_ARGUMENT` |
| `PROC-016` | `UNDERTIME_DURATION` | `DURATION_MISSING` | `INVALID_ARGUMENT` |

Procedural 固定为 PASS `16`、BLOCKED `17`、合计 `33`。`PROC-008` 的 input/output State owner 是两个独立约束，不能由一个双重错误 fixture 合并；每个 mutation 只制造一个首要错误。

#### 5. Control 精确集合

20 个 PASS variant 按第 7.3.2 节逐项冻结：

| Control | PASS variant / base Fact | 数量 |
| --- | --- | ---: |
| `CTRL-001` | `CONSUMPTION/PROC-001`、`EFFECT/PROC-003` | 2 |
| `CTRL-002` | `AGENT/PROC-004`、`INSTRUMENT/PROC-005` | 2 |
| `CTRL-003` | `CONSUMPTION_STATE/PROC-006`、`EFFECT_INPUT_OUTPUT/PROC-008`、`EFFECT_INPUT/PROC-009`、`EFFECT_OUTPUT/PROC-010` | 4 |
| `CTRL-004` | `AGENT_STATE/PROC-011`、`INSTRUMENT_STATE/PROC-012` | 2 |
| `CTRL-005` | `CONSUMPTION/PROC-001`、`EFFECT/PROC-003` | 2 |
| `CTRL-006` | `AGENT/PROC-004`、`INSTRUMENT/PROC-005` | 2 |
| `CTRL-007` | `CONSUMPTION_STATE/PROC-006`、`EFFECT_INPUT_OUTPUT/PROC-008`、`EFFECT_INPUT/PROC-009`、`EFFECT_OUTPUT/PROC-010` | 4 |
| `CTRL-008` | `AGENT_STATE/PROC-011`、`INSTRUMENT_STATE/PROC-012` | 2 |

Control BLOCKED 固定为以下 15 个 variant，全部期望 `MODIFIER_COMBINATION_INVALID`：

```text
RESULT, STATE_RESULT, EFFECT_OUTPUT_SEGMENT, NON_INPUT_SEGMENT,
BASE_CAPABILITY_MISMATCH, MISSING_CONTROL_CAPABILITY, MISSING_CONTROL_SEGMENT,
DUPLICATE_CONTROL_CAPABILITY, DUPLICATE_CONTROL_SEGMENT, EVENT_CONDITION_COMBINATION,
UNKNOWN_CONTROL_CAPABILITY, MODIFIER_CAPABILITY_REF_MISMATCH,
MODIFIER_VALUE_REF_MISMATCH, OPTION_PAYLOAD_MISMATCH, INDEPENDENT_CONTROL_FACT
```

`RESULT` 复用 `G-OPL-CTRL-001.RESULT.BLOCKED`；其余反例各有独立 candidate，禁止把多个非法 pair 字段合并进一个 case。Control 固定为 PASS `20`、BLOCKED `15`、合计 `35`。

#### 6. Structural 精确 PASS 集合

| Structural | PASS variant 生成规则 | 数量 |
| --- | --- | ---: |
| `STRUCT-001` | `UNIDIRECTIONAL_<OBJECT|PROCESS>_TAGGED` | 2 |
| `STRUCT-002` | `UNIDIRECTIONAL_<OBJECT|PROCESS>_NULL_TAG` | 2 |
| `STRUCT-003` | `BIDIRECTIONAL_<OBJECT|PROCESS>_TAGGED`；每 case 固定 `FORWARD/REVERSE` 两句 | 2 |
| `STRUCT-004` | `RECIPROCAL_<OBJECT|PROCESS>_<TAGGED|NULL_TAG>`；每 case 固定一条 `RECIPROCAL` 句 | 4 |
| `STRUCT-005` | `AGGREGATION_<OBJECT|PROCESS>_FAN_<1|2|3>_<COMPLETE|INCOMPLETE>` | 12 |
| `STRUCT-006` | 纯分组：`CHARACTERIZATION_<OBJECT|PROCESS>_<ATTRIBUTE|OPERATOR>_FAN_<1|2|3>_<COMPLETE|INCOMPLETE>` | 24 |
| `STRUCT-006` | 混合分组：`CHARACTERIZATION_<OBJECT|PROCESS>_MIXED_<A1_O1|A1_O2|A2_O1>_<COMPLETE|INCOMPLETE>` | 12 |
| `STRUCT-006` | 显式产生式身份：`EXHIBITION_OBJECT_ATTRIBUTE_IMPORT`、`EXHIBITION_PROCESS_OPERATOR_IMPORT` | 2 |
| `STRUCT-007` | `GENERALIZATION_<OBJECT|PROCESS>_FAN_<1|2|3>_<COMPLETE|INCOMPLETE>` | 12 |
| `STRUCT-008` | `CLASSIFICATION_<OBJECT|PROCESS>_FAN_<1|2|3>`；completeness 固定 `NOT_APPLICABLE` | 6 |
| `STRUCT-009` | `CHARACTERIZATION_OBJECT_VALUE_STATE` | 1 |
| `STRUCT-010` | `UNIDIRECTIONAL_<SOURCE|DESTINATION|BOTH>_STATE_<TAGGED|NULL_TAG>` | 6 |
| `STRUCT-010` | `BIDIRECTIONAL_<SOURCE|DESTINATION|BOTH>_STATE_TAGGED` | 3 |
| `STRUCT-010` | `RECIPROCAL_<SOURCE|DESTINATION|BOTH>_STATE_<TAGGED|NULL_TAG>` | 6 |

Structural PASS 固定为 `94`。`A1_O1/A1_O2/A2_O1` 分别表示 Attribute/Operator 分组成员数，确保两个分组的单项和列表 Composer 都被覆盖；Exhibition 两项只验证显式 parser/import 产生式身份，不能从拖线方向或 Characterization Fact 猜测。

`STRUCT-005` 的 12 个 case 中固定四个 transition：Object/FAN_2/COMPLETE=`ADD 1->2`，Object/FAN_3/COMPLETE=`REORDER 3->3`，Object/FAN_2/INCOMPLETE=`DELETE 3->2`，Object/FAN_1/INCOMPLETE=`COMPLETENESS_SWITCH 1->1`。四项均须证明 base/candidate 的 `fact_id` 相同；其余 case 为无 transition 的独立模型。

#### 7. Structural 精确 BLOCKED 集合

| Case main ID | BLOCKED variant | 稳定错误 |
| --- | --- | --- |
| `STRUCT-001` | `CROSS_KIND_TAGGED` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-001` | `FORWARD_TAG_MISSING` | `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-003` | `REVERSE_TAG_MISSING` | `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-005` | `FAN_EMPTY` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-005` | `FAN_ORDINAL_DUPLICATE` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-006` | `FAN_ORDINAL_GAP` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-007` | `MULTIPLE_REFINEABLE` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-004` | `CROSS_KIND_RECIPROCAL` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-005` | `FAN_CROSS_KIND` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-006` | `FEATURE_KIND_INVALID` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-008` | `COMPLETENESS_INVALID` | `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-009` | `SOURCE_STATE_INVALID` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-009` | `SOURCE_FEATURE_STATE_INVALID` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-009` | `STATE_OWNER_MISMATCH` | `STATE_OWNER_MISMATCH` |
| `STRUCT-010` | `PROCESS_ENDPOINT_INVALID` | `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-010` | `BIDIRECTIONAL_NULL_TAG` | `MODIFIER_COMBINATION_INVALID` |

Structural BLOCKED 固定为 `16`。这些 case 对应互不相同的冻结规则类别；不要求把同一机械错误与所有 Structural Capability 做笛卡尔积，但任何新增 Profile 允许维度或新增禁止规则都必须升级 catalog version 并显式改变 summary。`MULTIPLE_JUNCTION` 不进入 Golden：junction 是由单一 Fact 派生的 Projection cell，不存在于 candidate Revision，必须由 `DEV-CANVAS-04/06` 的 Projection 完整性用例阻断；OPL runner 不得为覆盖它而读取 X6 cell。

#### 8. Validator、报告与退出码

`npm run golden:coverage` 必须先执行 `golden:check`，再按以下顺序短路：

1. Catalog Schema、规范路径和 digest：`GOLDEN_COVERAGE_CATALOG_INVALID`；
2. Catalog key/case 重复、字段与 key 不一致、summary 非 `178/130/48`：`GOLDEN_COVERAGE_CATALOG_CONFLICT`；
3. Manifest case 无 catalog requirement：`GOLDEN_COVERAGE_UNEXPECTED`；
4. Catalog requirement 无 manifest case：`GOLDEN_COVERAGE_MISSING`；
5. capability/base/variant/expectation/template/slot/error 与 requirement 不一致：`GOLDEN_COVERAGE_MISMATCH`。

比较必须输出 `services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json`。Report 固定记录 manifest/catalog ID、version、原始 bytes SHA，按 family 和 expectation 的 expected/matched/missing/unexpected/mismatched 数量，以及对应 coverage key 列表；列表按 catalog order，未知 case 追加在末尾并按 manifest order。状态只允许 `EXACT/BLOCKED/INVALID`。

退出码固定为：`0` exact；`2` Schema/catalog/digest 输入无效；`3` missing/unexpected/mismatch；`4` I/O 或未分类内部错误。当前不完整 manifest 返回 `3` 是预期 Gate 阻断，不得被测试包装为成功。

#### 9. Gate 退出证据

- [x] Catalog 所有权、摘要链、coverage key、精确矩阵、稳定错误、报告和退出码已在设计中冻结。
- [x] Coverage Catalog/Schema 和 Golden manifest 的 `coverage_catalog_ref` 已实现并通过 digest mutation。
- [x] Catalog summary 精确为 `total=178/pass=130/blocked=48`，不存在重复 key 或重复 case。
- [ ] `npm run golden:coverage` 返回 `0`，Report 为 `EXACT` 且 missing/unexpected/mismatched 均为 `0`。当前 manifest 为 `69/178` requirement，命令按冻结口径返回 `3`，报告为 `BLOCKED` 且 `missing=109`。
- [x] 20 个 Control PASS、15 个 Control BLOCKED、16 个 Procedural PASS 和 17 个 Procedural BLOCKED已全部存在并完成双重 replay；仍缺 94 个 Structural PASS 与 16 个 Structural BLOCKED。
- [ ] 四个 fan transition 均证明 stable `fact_id`，`STRUCT-003` 每 case 两句、`STRUCT-004` 每 case 一句、`STRUCT-010` 的 15 个允许组合均未被主 Capability presence 替代。
- [ ] 完整 manifest 仍由 `GATE-05-02` runner 实际 replay；coverage exact 不单独关闭 Token/Trace、原子性、兼容性或生产 enablement。

### GATE-05-04 Token/Trace Closure 冻结执行契约

本节是 `GATE-05-04` 的唯一实施口径。它冻结 ACTIVE 生成路径与 Golden replay 的 Token/Trace 契约，不表示当前 Java、Revision Schema、Golden Schema、fixture 或 SQLite 回读已经满足契约。历史 Revision 的宽松读取不属于本 Gate，由 `GATE-05-06` 单独验证。

#### 1. 当前实现差距与 Gate 边界

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| 表示所有权 | Revision/runtime 内嵌 `source_refs[]`，Golden Schema 另用 `ref_id/source_ref_ids` | BLOCKED | Golden 直接 `$ref` Revision 的 `sentenceToken/sourceRef/textTrace`，删除第二种表示 |
| ACTIVE 枚举 | Token 仍允许 `PROCESS/OBJECT`，SourceRef 仍允许 `LEGACY`，两个 record 仍有 LEGACY 兼容构造器 | BLOCKED | 新生成路径在构造、Schema 语义校验和 replay 三层拒绝这些值；旧读取留给 `GATE-05-06` |
| 词法 | 当前依赖名称子串搜索和固定 phrase list；多词名称、State mention 已聚合，但 tagged label 可能退化为 `KEYWORD`，`and` 不区分语法上下文 | BLOCKED | Renderer 输出带来源的 segment，按下方优先级和上下文产生精确 kind 序列 |
| Rule | 旧 Grammar 兼容入口仍写 Template ID；由 `TextGenerationAssets` 驱动的正式提交入口已从 Profile Capability 的 `rule_ref` 写入 Sentence/Trace 与 `RULE` SourceRef | PARTIAL | 覆盖所有 concrete variant，并证明 Control 为 base Rule 后 control Rule |
| Binding | `TextTrace.binding_digest` 已由生成、Schema、Golden replay 与 SQLite 文档贯通并等于 Revision binding；正式资产入口的 Grammar `field_path` 已改为 concrete template pattern 路径，兼容入口仍保留旧摘要路径 | PARTIAL | ACTIVE 统一拒绝旧摘要路径，并完成 Rule/Symbol/Normalization 的闭包校验 |
| 语义闭包 | 当前只检查 Fact、Occurrence、Rule presence、Grammar digest 和 range 不越界 | BLOCKED | 对 Fact/Capability/Endpoint/Element/Feature/State/Modifier/Occurrence/Template/Grammar/Rule 做精确集合校验 |
| Trace 摘要 | Artifact digest 已明确排除 Trace；replay 已按 `OPL-GOLDEN-TRACE-001/0.1` 生成带 schema、revision 和有序 Trace 的 canonical Bundle，并比较 Golden expected 与两次 attempt 摘要 | PARTIAL | committed Revision 回读复算 Bundle，并与报告摘要精确相等 |
| 持久化 | Golden replay 已重开 SQLite，逐字段比较 `text_artifact/text_traces`，复算 Artifact/Trace canonical SHA，并按 `(source_revision_id,model_id,trace_id,fact_id,sentence_id,context_id)` 比较 `text_trace_index` 完整集合 | PARTIAL | 对 committed 原始 JSON 执行正式 `opm-revision-v0.2.schema.json` 验证 |

#### 2. 唯一机器表示

1. `opm-revision.schema.json#/$defs/sentenceToken`、`sourceRef`、`textTrace` 是运行时、Revision、Golden 和 replay 的唯一机器结构；Golden 只能通过 `$ref` 复用，禁止复制字段、重命名为 `ref_id/source_ref_ids` 或建立转换后的比较口径。
2. SourceRef 的逻辑身份固定为以下五元组；`field_path/endpoint_ordinal` 可省略，ACTIVE 路径的 `sentence_slot` 必填：

```text
source_kind + stable_id + field_path? + endpoint_ordinal? + sentence_slot
```

3. 可选字段无值时必须省略，禁止写 `null`、空字符串或用 digest 填充。五元组完全相同才视为重复；同一 stable ID 的不同字段路径不是重复。Token 或 Trace 出现重复 SourceRef 必须返回 `TEXT_TRACE_INCOMPLETE`，不得静默 `distinct()` 后继续提交。
4. Token 与 Trace 的 `source_refs[]` 均为有序内嵌值对象。Golden 逐项比较数组；Validator 不得先转 Set、按字典序重排或只比较 stable ID presence。
5. `TextTrace` 新增必填 `binding_digest`，Schema 类型复用 Revision 的 `#/$defs/digest`。其 `algorithm` 固定 `sha256`，整个对象必须与当前 Revision 的 `profile_binding.binding_digest` 深度相等；不得为 Profile、Symbol 或 Normalization 伪造新的 SourceKind。
6. ACTIVE Token kind 只允许 `ENTITY/STATE/RELATION_VERB/CONTROL_KEYWORD/LIST_SEPARATOR/PUNCTUATION/WHITESPACE/KEYWORD`；ACTIVE SourceKind 只允许 `FACT/CAPABILITY/ENDPOINT/ELEMENT/FEATURE/STATE/MODIFIER/OCCURRENCE/TEMPLATE/GRAMMAR/RULE`。`PROCESS/OBJECT/LEGACY` 只允许由显式 legacy reader 产生，禁止进入新 Text Artifact、Golden PASS 或 committed Revision。
7. 上述必填字段和枚举收紧属于破坏性 Schema 变化。既有 `docs/contracts/schemas/opm-revision.schema.json` 继续承载不可变的 `$id=https://opm.local/schemas/opm-revision/0.1`；新增 `docs/contracts/schemas/opm-revision-v0.2.schema.json`，固定 `$id=https://opm.local/schemas/opm-revision/0.2`。ACTIVE writer 必须输出 `schema_id=MS-REV-001/schema_version=0.2`；Reader 先按 `schema_version` 分派到 `0.1/0.2`，Golden candidate 与新 committed Revision 只使用 `0.2`。base Revision 可为 `0.1` 或 `0.2`，但跨版本 parent/binding 守卫仍必须成立，旧版本实际回放归 `GATE-05-06`。
8. `0.2` 中存在 `text_artifact` 时必须同时存在非空 `text_traces`，每个 Sentence 的 `tokens.minItems=1`，Sentence 与 Trace 一一对应；没有 Text Artifact 的 candidate 输入继续由 Candidate Schema 明确禁止这两个输出字段。
9. `ENDPOINT` SourceRef 及由某 Endpoint 派生的 `ELEMENT/FEATURE/STATE` SourceRef 必填 `endpoint_ordinal`，值必须等于该 Endpoint 的 ordinal；同一 target 经两个 Endpoint 使用时保留两个不同五元组。Fact、Capability、Modifier、Occurrence 和资产 SourceRef 禁止携带无语义依据的 ordinal。

#### 3. Renderer segment 与词法优先级

Tokenizer 不再从最终句子猜名称、标签或语法角色。Concrete Template renderer 必须在输出文本时同步产生覆盖同一 UTF-8 bytes 的 annotated segment；Tokenizer 只把 segment 规范化为 Token。优先级从高到低固定如下：

1. Template placeholder segment：State-qualified mention、Element/Feature 名称、动态 label、duration、list item；它优先于任何同文本 Grammar keyword。
2. 最长 Grammar literal phrase：同起点时先匹配最长 phrase，禁止把 `is an instance of` 拆成 `is`，或把 `as well as` 拆成 `as`、`well`、`as`。
3. 最大连续空白：生成一个 `WHITESPACE` Token；当前 canonical OPL 只允许 ASCII space 和 LF paragraph delimiter，Sentence 内不得出现 TAB/CR。
4. 单个 Grammar 标点：逗号和句点各生成一个 `PUNCTUATION` Token。
5. 其余 concrete Template literal：按 renderer segment 生成 `KEYWORD`，不得靠自由文本词典猜成关系或 Control。

Placeholder 和 literal 的 kind 冻结如下：

| Segment | Token kind | 细则 |
| --- | --- | --- |
| Element/Feature 名称 | `ENTITY` | 多词名称保持一个 Token；名称内部的空格或标点不再拆分 |
| State 或 State-qualified mention | `STATE` | `available Raw Material` 这类 State + owner mention 保持一个 Token；只输出 State 名称时仍映射 owner |
| 动态 `forward/reverse/reciprocal` label | `RELATION_VERB` | 整段 label 保持一个 Token，不得退化为 `KEYWORD` |
| 基础 Procedural/Structural 谓词 | `RELATION_VERB` | 由 concrete Template literal 身份确定，不由英文单词猜测 |
| `initiates/occurs if/in which case/otherwise/else/is skipped` | `CONTROL_KEYWORD` | 仅限 Control Template 中对应 literal segment |
| list/reciprocal/mixed-group/completeness 上下文的 `and/as well as` | `LIST_SEPARATOR` | 必须由 placeholder/list composer 上下文标记 |
| Control `initiates and handles` 中连接两个谓词的 `and` | `KEYWORD` | 不是实体列表，不计为 `LIST_SEPARATOR` |
| comma/period | `PUNCTUATION` | comma 若承担 list/group 分隔，仍保持 PUNCTUATION kind，但追加相邻 Endpoint 来源 |
| 其他 Grammar literal | `KEYWORD` | 包括 `which/exists/there is/from/to/of/itself/at least one other` 等 |

每句 Token ordinal 必须从 `0` 连续；`sentence_id` 必须等于所属 Sentence；UTF-8 半开区间从 byte `0` 连续覆盖到 Sentence 总 byte 长度。每个起止点必须是合法 UTF-8 code point 边界，Token `text` 的 UTF-8 bytes 必须与对应句子切片完全相同，按 ordinal 拼接必须精确重建 Sentence。

#### 4. SourceRef 路径与有序构造

`field_path` 是相对于 `stable_id` 所标识对象的稳定逻辑路径，不是数组下标 JSON Pointer。Selector 统一使用 `[key=value]`，Grammar placeholder 使用 `#placeholder`。ACTIVE 路径只允许以下形式：

| Source kind | `stable_id` | 允许的 `field_path` |
| --- | --- | --- |
| `FACT` | `fact_id` | 省略、`capability_ref.capability_id`、`labels[slot_id=<slot>].text`、`collection_completeness`、`source.source_kind`、`source.source_entity_id` |
| `CAPABILITY` | base/control Capability ID | `capability_ref.capability_id` 或 `modifiers[modifier_id=control.capability].value` |
| `ENDPOINT` | `endpoint_id` | `target_id`、`state_qualification_id`、`ordinal` |
| `ELEMENT` | `element_id` | `name.local_name` |
| `FEATURE` | `feature_id` | `name.local_name`、`owner_element_id`、`feature_kind` |
| `STATE` | `state_id` | `name.local_name`、`owner_target_kind`、`owner_element_id` |
| `MODIFIER` | `modifier_id` | `value` |
| `OCCURRENCE` | `occurrence_id` | 省略 |
| `TEMPLATE` | concrete `template_id` | `pattern` 或 `pattern#<placeholder>` |
| `GRAMMAR` | Grammar `asset_id` | `templates[template_id=<template_id>].pattern` 或其 `#<placeholder>` |
| `RULE` | Profile `rule_ref` | 省略 |

Grammar digest 不得编码进 `field_path`；摘要只由 Revision Profile Binding 和 `TextTrace.binding_digest` 承载。未列出的自由路径、空路径和 `digest=<sha>` 一律按 `TEXT_TRACE_INCOMPLETE` 阻断。

每个 Sentence 先建立 source catalog，再由 Token 取其有序子集，Trace 保存 catalog 全集。catalog 顺序固定为：

1. 原 `FACT`；显式 parser/import production 紧接 `source.source_kind`、`source.source_entity_id` 两个同 Fact 来源；
2. 基础 Capability，Control 合成时再接 Control Capability；
3. 按当前句槽的语义遍历顺序，逐 Endpoint 输出 `ENDPOINT -> STATE(若有) -> owner FEATURE(若有) -> owning ELEMENT`，否则输出 `ENDPOINT -> target FEATURE(若有) -> owning ELEMENT` 或 `ENDPOINT -> target ELEMENT`；
4. 当前句使用的 label，再接 completeness；
5. Modifier 固定按 `control.capability`、`control.segment`；
6. 当前 Context 的 Occurrence 按 `occurrence_id` UTF-8 byte 升序；
7. concrete Template；
8. Grammar；
9. Rule，严格沿用 `generation_rule_ids` 顺序。

句槽语义遍历固定为：`SINGLE` 按 concrete Template placeholder 顺序，`FORWARD` 为 Endpoint `0 -> 1`，`REVERSE` 为 `1 -> 0`，`RECIPROCAL` 为 `0 -> 1`；fan 先 root/refineable Endpoint，再按 member ordinal。除上述显式顺序外，同组稳定 ID 使用 UTF-8 byte 升序。`sentence_slot` 只允许 `SINGLE/FORWARD/REVERSE/RECIPROCAL`，并写入每个 ACTIVE SourceRef。

#### 5. Token kind 的必需来源

每个 Token 至少引用当前 concrete Template 和 Grammar pattern；语义 Token 必须在此基础上满足下表。表中“Endpoint”均使用当前句槽语义顺序，Occurrence 必须能在当前 `context_id` 中解析到对应 target 或 Fact。

| Token kind | 必需 SourceRef |
| --- | --- |
| `ENTITY` | 对应 Endpoint、Element/Feature `name.local_name`、该 target 的全部当前 Context Occurrence、Template、Grammar |
| `STATE` | 对应 Endpoint、State `name.local_name/owner_target_kind/owner_element_id`、owner Feature（若有）及最终 owning Element、可解析的对应 Occurrence、Template、Grammar |
| `RELATION_VERB` | 原 Fact、基础 Procedural/Structural Capability、该谓词涉及的 Endpoint、Fact Occurrence、基础/Structural Rule、Template、Grammar；动态 label 另含精确 label field |
| `CONTROL_KEYWORD` | 原 Fact、Control Capability、`control.capability/control.segment` 两个 Modifier、Fact Occurrence、Control Rule、Template、Grammar；禁止 Control Fact |
| `LIST_SEPARATOR` | 原 Fact、Structural Capability/Rule、对应 list placeholder 的 Template/Grammar；普通 list/group separator 含左右相邻 Endpoint，completeness tail 的 `and` 只含最后一个已知 Endpoint 和 `collection_completeness` |
| `PUNCTUATION` | Template、Grammar；list/group comma 另含左右相邻 Endpoint，completeness comma 另含最后一个 member Endpoint 和 `collection_completeness` |
| `WHITESPACE` | Template、Grammar；不得附带与相邻词无关的 Endpoint 或 Modifier |
| `KEYWORD` | Template、Grammar；duration 映射 `MODIFIER/duration/value`（与 Revision `required_fields` 和 fixture 的既有表示一致），completeness/self-invocation 等承载语义的 literal 另含对应 Fact 字段、Endpoint 和 Rule |

`input_element_ids` 固定为句中全部 Endpoint target 的最终 owning Element 有序去重结果，按当前句槽 Endpoint 遍历的首次出现顺序输出：Element 取自身，Feature 取 `owner_element_id`，State owner 为 Element 时取其 `owner_element_id`，State owner 为 Feature 时先解析该 Feature，再取 Feature 的 `owner_element_id`。`occurrence_ids` 固定包含当前 Context 内 Fact 和每个最终 owning Element 的可定位 Occurrence；Endpoint target 或中间 owner 存在 Feature/State Occurrence 时一并纳入，不要求为没有显式 Occurrence 的 Feature/State 伪造 ID。每个 Fact 和最终 owning Element 必须至少有一个当前 Context Occurrence；存在多个时按 `occurrence_id` UTF-8 byte 升序。Validator 必须核对其 `context_id/target_kind/target_id/ownership`，不得只验证 ID 存在。

#### 6. Control、direction、label 与 fan/list/completeness

1. Control 继续使用一个基础 Procedural Fact 和两个 Modifier；全部 Control Token/Trace 共享原 `fact_id`，禁止生成独立 Control Fact 或 Control Endpoint。
2. Control Sentence 的 `generation_rule_ids/trace.rule_ids` 固定为 `[base Procedural rule_ref, Control Capability rule_ref]`。基础谓词只引用 base Rule；Control keyword 引用 Control Rule；Trace 同时闭合两者。
3. Procedural Sentence 的 Rule 固定为基础 Capability `rule_ref`；Structural Sentence 固定为 Structural Capability `rule_ref`。Template ID 只能作为 `TEMPLATE.stable_id`，出现在任一 Rule 位置都返回 `TEXT_TRACE_INCOMPLETE`。
4. Bidirectional 的 FORWARD 句只能引用 `labels[slot_id=forward_tag].text` 和 Endpoint `0 -> 1`，REVERSE 句只能引用 `labels[slot_id=reverse_tag].text` 和 Endpoint `1 -> 0`；两句共享 Fact、binding 和 Structural Rule。任一句引用另一 label、错误 slot 或错误 Endpoint 顺序均阻断。
5. Reciprocal 固定一条 `RECIPROCAL` 句，Endpoint 顺序 `0 -> 1`；`CAP-ISO-STRUCT-004` tagged 变体引用 `labels[slot_id=reciprocal].text`，`CAP-ISO-STRUCT-010` tagged 变体引用 `labels[slot_id=reciprocal_tag].text`，null-tagged 变体不得伪造 label SourceRef。两个 operand 之间的 `and` 是 `LIST_SEPARATOR`。
6. fan/list item 各自引用自身 member Endpoint ordinal；comma/`and` 引用左右相邻 member Endpoint。mixed Characterization 的 `as well as` 引用前一组最后 Endpoint 和后一组第一 Endpoint，并指向相应 template placeholder。
7. incomplete tail 的 comma、`and` 和 `at least one other <kind>` 均引用 `collection_completeness`；另引用最后一个已知 member Endpoint，但不得为“未知其他成员”伪造 Endpoint。complete 句不得携带 completeness tail SourceRef。
8. list/fan 的 SourceRef 顺序必须保持 root/refineable 在前、member ordinal 连续；增删、重排和 completeness switch 后按 candidate 的冻结 endpoint order 重新生成，不能沿用 base TokenRange 或 SourceRef 顺序。

#### 7. Sentence Trace、Rule 与 binding 闭包

每个 Sentence 恰好一个 `TextTrace`，并满足以下精确等式，不接受“至少包含”或任意 superset：

1. `sentence_ids == [sentence.sentence_id]`，`fact_ids == sentence.input_fact_ids`，`rule_ids == sentence.generation_rule_ids`；三个数组均保持 SentencePlan 顺序。
2. `fact_ids` 中每个 Fact 存在且与 Sentence template/capability 匹配；当前冻结 variant 每句只允许一个 Fact，后续如支持多 Fact 合句必须升级契约版本。
3. `input_element_ids/occurrence_ids` 等于第 5 节算法的有序去重结果，`source_refs` 等于第 4 节 source catalog；缺失和额外项均返回 `TEXT_TRACE_INCOMPLETE`。
4. 每个 Template 存在于绑定 Grammar，Template 的 capability/base capability/slot 与 Sentence 一致；Grammar `asset_id/version/digest` 与 Revision `text_grammar` 精确匹配。
5. 每个 Rule 由当前 Profile Capability 的 `rule_ref` 解析，存在于绑定 Rule Set；Control 的 base/control Rule 顺序不可互换。
6. `binding_digest` 与 Revision 深度相等，并由 `GATE-05-01` 的五 role 算法重算通过。该摘要传递闭合 Profile、Rule Set、Grammar、Symbol、Normalization；Trace 不重复制造这五项的伪 SourceRef。
7. 所有 SourceRef 的 stable ID、路径、ordinal、slot 都能解析回 candidate Revision 或绑定资产，并与承载该 Ref 的 Token 语义一致。

#### 8. TokenRange 与 canonical Trace Bundle

`token_ranges[]` 只为可定位语义来源 `FACT/ENDPOINT/ELEMENT/FEATURE/STATE/MODIFIER/OCCURRENCE` 建立，资产与 Capability/Rule 不单独建 range。算法固定如下：

1. 对每个可定位 SourceRef，找出携带该 Ref 的 Token；相邻 Token 的 byte range 连续时合并为一个 maximal range，否则保留多个 range。
2. 每个 range 起止必须同时是 UTF-8 字符边界和 Token 边界，且至少完整覆盖一个 Token；不得从 Token 中间开始或结束。
3. `input_id` 等于对应 SourceRef 的 `stable_id`。同一 `input_id/start/end` 不得重复；range 必须能在 Trace `source_refs` 和被覆盖 Token 中双向解析。
4. 输出顺序按 `start_utf8_byte`、`end_utf8_byte`、source catalog 顺序；禁止先按 `input_id` 排序而改变文本定位顺序。
5. 每个可定位 Token SourceRef 至少被一个 range 覆盖；每个 range 覆盖的全部 Token 都必须携带同一 SourceRef。额外、悬空或只在 Trace 不在 Token 的 range 均返回 `TEXT_TRACE_INCOMPLETE`。

Trace canonical preimage 冻结为 `OPL-GOLDEN-TRACE-001/0.1`：

```text
schema_id, schema_version, revision_id, traces

trace:
trace_id, context_id, fact_ids, input_element_ids, occurrence_ids,
sentence_ids, rule_ids, binding_digest, token_ranges, source_refs
```

Bundle JSON 使用上述固定 object 字段顺序；Trace 按 artifact Sentence 顺序，数组保持 Generator 顺序；SourceRef 字段顺序固定为 `source_kind/stable_id/field_path/endpoint_ordinal/sentence_slot`，缺失可选字段省略。编码与 Artifact 相同：UTF-8、无 BOM、NFC、无缩进、无尾随换行、LF。对 bytes 计算小写 SHA-256，写入 Replay Report 的 `trace_sha256`；manifest 的 expected traces 也按同一算法现场计算 expected SHA。expected、attempt 1、attempt 2 三者必须相等，Trace 不写入 Artifact digest。

#### 9. Validator 顺序与稳定错误

ACTIVE `validateTrace()` 必须按以下顺序短路；第 `1` 项结构不符合 Revision/Golden Schema 时由入口返回 `GOLDEN_SCHEMA_INVALID`，第 `2~11` 项统一返回既有业务错误 `TEXT_TRACE_INCOMPLETE`，replay 的内容比较仍使用 `REPLAY_TOKEN_MISMATCH/REPLAY_TRACE_MISMATCH`：

1. Revision/Golden Schema、必填字段、枚举和 `additionalProperties`；
2. Sentence/Trace 一一对应、Sentence ID、Token ID/ordinal；
3. Token UTF-8 字符边界、连续全 byte 覆盖、text 重建；
4. ACTIVE kind/source 禁令、SourceRef 五元组形状、重复和 canonical 顺序；
5. Fact、Capability、Template、Grammar、Rule 与 `binding_digest`；
6. Endpoint、Element、Feature、State、owner 与 Occurrence；
7. Control Modifier pair、base/control Rule 顺序；
8. direction slot、label field 与 Endpoint 语义顺序；
9. fan/list adjacency、feature group 和 completeness；
10. Trace 数组与 source catalog 精确等式；
11. TokenRange 双向闭包和 canonical Trace Bundle 重算。

Validator 必须报告首个失败阶段；不得用 Set presence 掩盖重复/顺序，不得在校验前修补 path、补 source、替换 Rule 或重排数组。

#### 10. 最小 mutation 集

Mutation 从已通过的 Procedural State、Control、Bidirectional、fan incomplete 和 Feature State PASS fixture 各复制内存对象，每次只改变一个字段；它们是验证器契约用例，不计入 `GATE-05-03` 的 `178` 个业务 coverage requirement。

| Mutation ID | 唯一变更 | 预期失败阶段/错误 |
| --- | --- | --- |
| `TTRACE-MUT-001` | Token ordinal 断裂 | 2 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-002` | Token `sentence_id` 指向另一句 | 2 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-003` | byte gap | 3 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-004` | byte overlap | 3 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-005` | range 越过 Sentence 末尾 | 3 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-006` | range 落在多 byte 字符内部 | 3 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-007` | ACTIVE Token kind 改为 `PROCESS` 或 `OBJECT` | 4 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-008` | 加入 `LEGACY` SourceRef | 4 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-009` | 重复一个完全相同 SourceRef | 4 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-010` | Grammar path 写入 `digest=<sha>` | 4 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-011` | 删除 Fact 或 Capability SourceRef | 5 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-012` | Template ID 冒充 Rule ID 或交换 Control Rule 顺序 | 5 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-013` | `binding_digest` 缺失/与 Revision 不同 | 1 `GOLDEN_SCHEMA_INVALID` / 5 `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-014` | 删除 Endpoint SourceRef 或写错 `endpoint_ordinal` | 6 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-015` | 删除 Element/Feature SourceRef | 6 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-016` | 删除 State、owner 或任一必需 Occurrence SourceRef | 6 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-017` | 删除一个 Control Modifier SourceRef | 7 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-018` | FORWARD/REVERSE slot、label path 或 Endpoint order 错误 | 8 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-019` | list separator 缺左/右相邻 Endpoint | 9 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-020` | incomplete tail 缺/错 `collection_completeness` | 9 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-021` | Trace 多一个无依据 SourceRef | 10 / `TEXT_TRACE_INCOMPLETE` |
| `TTRACE-MUT-022` | TokenRange 切开 Token、指向无来源 input 或重复 | 11 / `TEXT_TRACE_INCOMPLETE` |

表中使用“或”的 Mutation 必须把每个选择展开为独立参数，每个参数仍只改变一个字段；测试报告必须逐参数输出，不得用单一 PASS 计数掩盖漏测分支。

#### 11. SQLite committed Revision 验收

不修改 SQLite DDL。每个 Golden PASS attempt 在事务提交后重新打开数据库，并按以下顺序验收：

1. 从 `revision_document` 读取 candidate 原始 JSON，使用正式注册的 `opm-revision.schema.json` 校验；不得用 Java record 可反序列化替代 Schema 通过。
2. 深度比较内存与回读的 `text_artifact/text_traces`：全部字段、数组顺序、可选字段省略、DigestRef、Token、SourceRef、TokenRange 必须相等。
3. 重新生成 canonical Artifact bytes 和 Trace Bundle bytes，分别等于提交前 bytes；`artifact_digest` 和 report `trace_sha256` 必须一致。
4. `text_trace_index` 的期望集合按每个 Trace 的 `fact_ids x sentence_ids` 展开，逐项比较 `(source_revision_id,model_id,trace_id,fact_id,sentence_id,context_id)`；不仅比较行数。当前每 Trace 恰有一个 Sentence，但不得据此省略笛卡尔展开算法。
5. 任一 Schema、深度等价、digest 或 index 元组失败返回 `REPLAY_COMMIT_STATE_MISMATCH`；事务本身已提交的测试数据库直接废弃，不能在 replay 中修补后宣告通过。

#### 12. Gate 退出证据

- [x] 唯一表示、ACTIVE 枚举、词法优先级、SourceRef 路径/顺序、kind 来源、Control/Structural 特例、Rule/binding、TokenRange、Trace canonical、validator、mutation 和 SQLite 回读已在设计中冻结。
- [x] 保留 `MS-REV-001/0.1` 原契约并发布 `0.2`；`0.2` 为 `textTrace` 增加必填 `binding_digest` 并收紧 ACTIVE 写入，Golden Schema 完全复用 `0.2` `$defs`，不再出现 `ref_id/source_ref_ids`。
- [x] renderer segment 和全部 concrete variant 的 Token kind/UTF-8 range/SourceRef Golden 逐项通过，ACTIVE 输出中 `LEGACY/PROCESS/OBJECT` 数量为 `0`。
- [x] Procedural/Structural Rule 为真实 Profile `rule_ref`，Control Rule 顺序为 base 后 control；Template ID 冒充 Rule 的 mutation 被拒绝。
- [x] 上述 `22` 个 mutation 及参数化分支均按固定阶段和错误通过。
- [x] expected/attempt 1/attempt 2 的 Trace canonical bytes 与 `trace_sha256` 相同，且 Trace 不改变 Artifact digest 口径。
- [x] committed Revision Schema、内存/SQLite 深度回读、Artifact/Trace bytes 和 `text_trace_index` 精确元组全部通过。
- [x] 完整 `178` case 已由 `GATE-05-03` coverage 和 `GATE-05-02` replay 共同验收；本 Gate 不关闭 `GATE-05-05`、`GATE-05-06`、DEV-CANVAS-06、Compatibility/Handoff 或生产 enablement。

#### 12.1 本轮 ACTIVE Trace 收口证据

事实：`OplTextGenerationServiceTest` 已验证 ACTIVE 写入时 Trace catalog 与 Token 来源精确相等、`PROCESS/OBJECT` kind 被拒绝、TokenRange 不得切开 Token，并新增 TokenRange 的 `input_id` 来源闭合：`input_id` 必须存在于 Trace catalog，且被覆盖的完整 Token 都必须携带同一来源。负向场景包含 legacy kind、catalog 缺来源、TokenRange 切 Token、TokenRange 指向无来源 input、TokenRange 重复、缺少任一可定位 Token SourceRef 的 range、Template ID 冒充 Rule、Endpoint ordinal 与实际 Endpoint 不一致、Control Trace 缺 `control.segment` Modifier，以及删除 State `owner_element_id` 来源、删除最终 owning Element occurrence、将当前 Context occurrence 改为 `REFERENCED`；duration Token 绑定 `MODIFIER/duration/value`，self-invocation `itself` 绑定 Fact、Endpoint 和 Rule。`TTRACE-MUT-001~022` 的全部固定分支已由参数化或独立单元测试覆盖，服务测试为 `160/160` 通过。

事实：Bidirectional ACTIVE Trace 已按 template `sentence_slot` 写入来源：FORWARD 仅保留 `forward_tag` 与 Endpoint `0 -> 1`，REVERSE 仅保留 `reverse_tag` 与 Endpoint `1 -> 0`。将 FORWARD 的 label path 单独改为 `reverse_tag` 会返回 `TEXT_TRACE_INCOMPLETE`。

事实：Structural `LIST_SEPARATOR` 与 list/group comma 已按相邻语义端点写入 Token 来源：普通分隔符仅保留左右 member Endpoint；incomplete tail 的 `and` 仅保留最后已知 member Endpoint 与 `collection_completeness`；mixed Characterization 的 `as well as` 仅保留前一组最后 Endpoint 与后一组第一 Endpoint。分别删除 list 左 Endpoint 或 completeness 来源均返回 `TEXT_TRACE_INCOMPLETE`。

事实：Token ordinal、`sentence_id`、byte gap/overlap 和越过 Sentence 末尾由 `OplSentence` 不变式在 `validateTrace()` 之前拒绝，当前尚未形成其规定的 `TEXT_TRACE_INCOMPLETE` validator-stage 证据。

事实：replay 使用 `OPL-GOLDEN-TRACE-001/0.1` canonical Bundle，字段顺序为 `schema_id/schema_version/revision_id/traces`；每个 PASS case 先以 Golden `expected_sentences[].trace` 重建 expected Bundle，再比较 expected、attempt 1、attempt 2 的 `trace_sha256`。Trace writer 不接收 Artifact 输入，Artifact canonical digest 口径不包含 Trace。

事实：`npm run golden:replay` 在 Java replay report 校验后，强制运行 `validate-opl-golden-committed-revisions.mjs`，对每个 PASS replay attempt 的 `revision_document` 原始 JSON 执行正式 `opm-revision-v0.2.schema.json` 校验，再比较存储的 Artifact、Sentence、Token、Trace、Digest 与生成结果，并以 Trace 的 `fact_ids × sentence_ids` 展开六元组后同 `text_trace_index` 完整集合比较。`2 × 2` 展开单测已覆盖不得只按当前单 Fact/单 Sentence 的行数判断；本轮 replay 校验 `260` 个 PASS committed attempts。

结论：本 Gate 的 Token/Trace 闭包已满足退出条件。Stage 6 覆盖 State/Feature/Element owner 与当前 Context 的 OWNED occurrence，Stage 8 覆盖 Bidirectional direction/label/Endpoint 顺序，Stage 9 覆盖 complete/incomplete list tail、comma 与 mixed group separator；所有 Token 和 Trace SourceRef 仍按 Golden 原始顺序逐项比较。

### GATE-05-05 Structural/Atomic Closure 冻结执行契约

本节是 `GATE-05-05` 的唯一实施口径。它冻结 Exhibition 的最后一个可达分支、Profile 资产正式装配入口、稳定错误优先级和零增量证据，不表示当前 Java、Profile package、Golden Schema/fixture 或 Local API 已满足契约。

本节设计冻结子任务使用 `feature + design-module-docs (primary) + testing`；允许同步设计/checklist，不授权修改前端、Endpoint Schema、公共 operationId、SQLite DDL 或生产 Capability gate。

#### 1. 当前事实与边界

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| Exhibition 入口 | Grammar 有 `opl.structural.exhibition.v1`，Generator 对 `CAP-ISO-STRUCT-006` 只进入 Characterization | BLOCKED | 精确 SourceProvenance tuple 可达，默认分支不受拖线方向影响 |
| Mixed 分组 | 当前 pattern 和 Generator 对 Object/Process 都写 Attribute -> Operation | BLOCKED | Object 使用 Attribute -> Operation，Process 使用 Operation -> Attribute |
| Package envelope | `FileProfilePackageLoader` 已校验 required role、路径、bytes、digest、内部身份和 package digest，并返回按 `load_order` 排序的逻辑路径和 capability binding 描述符 | CLOSED | 已由 `ProfilePackageAssembler` 消费；不得在调用方重新硬编码路径 |
| 语义 asset loader | Rule/Symbol/Grammar/Normalization 均已有只读、按 digest 绑定的 loader；Symbol 同时索引 capability projection 与所有 `symbol_id` | PARTIAL | 仍需由 Plan validator 校验本次选中的 exact template/slot |
| Commit 装配 | Golden replay 的提交已在 guard 后使用 `ProfilePackageAssembler`，忽略 command 内存 Grammar；`LocalApiService` 直接文本查询与 Rule/Trace 闭包尚未改造 | PARTIAL | ACTIVE 所有提交与直接文本生成统一使用 assembler 输出，且无内存 Grammar bypass |
| 原子性 | SQLite 已覆盖 Revision/Parent/Trace/Finding/Head/Operation/Receipt 七个写阶段回滚 | PARTIAL | 资产/production 生成前失败也从同一正式入口证明七项零增量 |

ISO 19450:2024 的依据固定为 `10.3.3.1`、`10.3.3.2.2`、`11.3` 和 `A.4.6.3~A.4.6.4`。标准原文区分 Object/Process 的 mixed 分组顺序，并要求 Feature 与 Exhibitor 之间出现 `of`；本 Gate 不扩展 scalar/range/value-state 数据表示，也不因此声明完整 ISO 符合性。

#### 2. Exhibition Source tuple 与分支

唯一持久化表示复用 Fact `source`：

```text
source_profile_id = revision.profile_binding.profile.id
source_profile_version = revision.profile_binding.profile.version
source_kind = OPL_PRODUCTION
source_entity_id = opl.structural.exhibition.v1
```

1. tuple 只允许 parser/import 创建；Editor `CREATE_FACT` 使用普通构造来源，`UPDATE_FACT` 保留既有 tuple，但不得根据 direction、endpoint order、route、junction 或拖线方向创建/删除 tuple。
2. `source_kind != OPL_PRODUCTION` 时使用默认 Characterization；`source_entity_id` 单独相同不构成显式身份。
3. `source_kind=OPL_PRODUCTION` 时必须先核对 source Profile、Fact Capability 和 concrete template 三方；未知 ID、Profile 不一致或非 `CAP-ISO-STRUCT-006` 返回 `TEXT_PRODUCTION_IDENTITY_INVALID`，禁止回退。
4. 新提交仍使用 `MS-REV-001/0.2`；tuple 使用 `0.1` 已有的四个 SourceProvenance 字段，不修改 Revision 字段形状或 SQLite schema。历史普通 source 值由 `GATE-05-06` 继续宽松读取。

#### 3. 端点、文本与 Trace

| 分支 | Endpoint 约束 | 完整性 | Canonical 选择 |
| --- | --- | --- | --- |
| 默认 Characterization | ordinal `0`=`EXHIBITOR_THING`；`1..n`=`FEATURE_THING`，`n>=1` | `COMPLETE/INCOMPLETE` | 单一 kind 或 mixed；Object Attribute -> Operation，Process Operation -> Attribute |
| 显式 Exhibition | ordinal `0`=Exhibitor；`1`=句首 Feature；`2..n`=右侧 feature list，`n>=2` | 只允许 `COMPLETE` | `opl.structural.exhibition.v1`，一条 `SINGLE` Sentence |

全部 Feature endpoint 必须引用 Attribute/Operation，target ID 唯一，owner 等于 Exhibitor，ordinal 从 `0` 连续。Exhibition 右侧单组使用 list，两组按 Exhibitor kind 使用 `as well as`；scalar、range、range clause、Feature Value State 或 `INCOMPLETE` 返回 `TEXT_PLAN_UNSUPPORTED`。

两个语义 PASS case 固定保留在 `178` coverage catalog 中：`EXHIBITION_OBJECT_ATTRIBUTE_IMPORT` 与 `EXHIBITION_PROCESS_OPERATOR_IMPORT`。前者验证 Attribute-first Object 句，后者验证 Operator-first Process 句；两者都必须断言 tuple、Endpoint 分区、Template、Rule、Token、Trace 和 exact binding。

显式句的 Source catalog 在无 path 的 Fact 后依次加入：

```text
FACT/<fact_id>/source.source_kind/SINGLE
FACT/<fact_id>/source.source_entity_id/SINGLE
```

`of`、`is` 和 production 选择谓词必须引用这两项；句首 Feature 使用 ordinal `1`，右侧列表使用 `2..n`。Token/Trace 仍必须闭合 concrete Template、Grammar、`rule.iso.struct.exhibition.v1`、`symbol.link.structural.exhibition` 和 Revision binding，Source tuple 不替代任何资产来源。

#### 4. 正式 Profile 资产装配器

ACTIVE 提交入口冻结为以下职责，不允许 `LocalApiService` 临时构造 Grammar 或从 catalog 常量拼出 Rule/Symbol：

| 组件 | 输入 | 输出/职责 |
| --- | --- | --- |
| `FileProfilePackageLoader` | profile id/version/package digest | 校验 package envelope，返回 required role 的规范路径、exact ref、load order 和 Profile capability 描述符 |
| `RuleSetAssetLoader` | RULE_SET path + ref | 校验 bytes/identity，输出有序且无重复的 `rule_id` 集合 |
| `SymbolCatalogAssetLoader` | SYMBOL_ASSET path + ref | 输出按 `symbol_id` 和 `capability_id` 双索引的 descriptor；两类键均唯一 |
| `OplGrammarAssetLoader` | GRAMMAR_ASSET path + ref | 输出 concrete template 索引；template ID 唯一，Capability/slot/pattern 非空 |
| `NormalizationAssetLoader` | NORMALIZATION_DATA path + ref | 输出 exact identity 和只读 normalization policy |
| `ProfilePackageAssembler` | Revision `ProfileBinding` | 依次装配以上资产，重算 binding digest，输出不可变 `TextGenerationAssets` |
| `PlanAssetBindingValidator` | SentencePlan + `TextGenerationAssets` | 验证 plan 选择的 exact Template、slot、Rule、Symbol 与同一 Capability 双向一致 |

`TextGenerationAssets` 至少包含五项 exact ref、Profile capability index、Rule ID index、Symbol descriptor index、Grammar、Normalization policy 和 canonical binding digest。缓存只能按五项 `id/version/digest + binding_digest` 精确键控；不得按 path、Profile ID 或 version 单独命中，也不得在一次 attempt 中二次读取已校验文件。

`CandidateRevisionCommand.grammar` 只能保留为旧测试/兼容适配输入；ACTIVE `CandidateRevisionCommitter` 必须忽略该对象并使用 assembler 输出。是否删除兼容字段由 `GATE-05-06` 决定，但生产路径出现 in-memory Grammar bypass 即本 Gate 失败。

#### 5. 短路顺序与稳定错误

同一输入有多个故障时只返回下表最先命中的错误；required role 内固定按 Profile `load_order`：`RULE_SET -> SYMBOL_ASSET -> GRAMMAR_ASSET -> NORMALIZATION_DATA`。

| 顺序 | 校验 | detail error code | CommitFailureCode |
| ---: | --- | --- | --- |
| 1 | replay、Head、read-only、base/candidate/expected binding 守卫 | 既有 guard code | 既有 code |
| 2 | Profile path、profile JSON/identity、required role/dependency/ref/manifest 形状 | `PROFILE_ASSET_PATH_INVALID`、`PROFILE_PACKAGE_INVALID` 或 `PROFILE_DEPENDENCY_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 3 | required asset 文件存在且可读 | `PROFILE_ASSET_MISSING` | `TEXT_GENERATION_BLOCKED` |
| 4 | manifest/ref digest 一致、byte length、文件 SHA-256 | `PROFILE_ASSET_DIGEST_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 5 | asset 内部 ID/version | `PROFILE_ASSET_IDENTITY_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 6 | package canonical digest | `PROFILE_PACKAGE_DIGEST_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 7 | Revision 五项 ref 与已装配 package 精确相等 | `PROFILE_REVISION_BINDING_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 8 | `GATE-05-01` 五 role canonical binding digest | `PROFILE_BINDING_DIGEST_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 9 | candidate 使用的 Profile Capability -> Rule/Symbol 存在性和反向 capability 绑定；Grammar 至少存在该 Capability 的 concrete template | `PROFILE_CAPABILITY_BINDING_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 10 | Semantic validation | 既有 semantic code | `VALIDATION_BLOCKED` |
| 11 | production tuple、端点分区、Planner | `TEXT_PRODUCTION_IDENTITY_INVALID` 或 `TEXT_PLAN_UNSUPPORTED` | `TEXT_GENERATION_BLOCKED` |
| 12 | SentencePlan 的 exact Template/capability/slot 与 Rule/Symbol 双向绑定 | `PROFILE_CAPABILITY_BINDING_MISMATCH` | `TEXT_GENERATION_BLOCKED` |
| 13 | Template renderer、Composer、Trace | 既有 `TEXT_*` code | `TEXT_GENERATION_BLOCKED` |
| 14 | SQLite repository transaction | `PERSISTENCE_FAILED` | `PERSISTENCE_FAILED` |

任何预期资产故障落入 `PERSISTENCE_FAILED` 都是错误映射缺陷。Golden `expected_error_code` 比较 detail error code，Replay Report 同时记录顶层 CommitFailureCode、detail code、role、asset id/version；Local API 继续按顶层 `TEXT_GENERATION_BLOCKED` 返回既有 422，不新增 operationId。

`ProfilePackageAssembler` 失败使用独立的受控异常类型，`CandidateRevisionCommitter` 必须显式捕获并映射；不得依赖兜底 `RuntimeException -> PERSISTENCE_FAILED`。Profile 级 binding validator 在 Planner 前运行，Plan 级 validator 只校验本次已选择的 exact template/slot，不重复读取文件。

正式流程冻结为：

```text
replay/guard
-> ProfilePackageAssembler
-> SemanticRevisionValidator
-> Planner
-> PlanAssetBindingValidator
-> Generator/Composer/Trace Validator
-> SqliteRevisionCommitRepository
```

#### 6. Atomic Golden 表示与 19 个 case

主 `opm-opl-golden-manifest.json` 新增与 `cases[]` 同级的 `atomic_cases[]`，Schema 版本随实现升级。`cases[]` 仍与 `GATE-05-03` 的 `178/130/48` 精确相等；Atomic case 不进入 semantic coverage key，不允许借此改变该摘要。`golden:coverage` 校验 Atomic case ID 无重复且不出现在 coverage catalog，`golden:replay` 必须执行两组 case。

Atomic case 固定字段：

```text
case_id, category, base_revision_fixture, input_revision_fixture,
profile_ref, rule_set_ref, grammar_ref, symbol_catalog_ref,
normalization_adapter_ref, binding_digest,
fault {stage, role?, mutation, recompute_digests},
expected_commit_code, expected_error_code,
expected_transaction
```

`expected_transaction` 必须直接复用 `GATE-05-01` 的 exact 结构：`revision_delta/revision_parent_delta/text_artifact_delta/text_trace_delta/finding_delta/operation_delta/receipt_delta/draft_head_changed`，禁止为 Atomic case 建立简写或第二份 Schema。

字段枚举冻结如下：`category=PRODUCTION|PROFILE_ASSEMBLY`；`fault.stage=PRODUCTION_IDENTITY|PRODUCTION_PLAN|ASSET_PRESENCE|ASSET_BYTES|ASSET_IDENTITY|CAPABILITY_BINDING|REVISION_BINDING|BINDING_DIGEST`；`fault.role` 使用 Profile 原始 role `RULE_SET|SYMBOL_ASSET|GRAMMAR_ASSET|NORMALIZATION_DATA`，在 `ASSET_PRESENCE/ASSET_BYTES/ASSET_IDENTITY/CAPABILITY_BINDING` 必填，其余 stage 禁止；`mutation` 必须是下表 variant 的同名值；`recompute_digests` 为 Boolean。未声明字段禁止。

Atomic 的 base/candidate fixture 在 fault 前必须通过 Schema、标准 Golden binding 和语义输入校验。Runner 只允许按 `fault` 对隔离副本做下方声明的确定性变更；这是技术故障注入例外，不得改 endpoint、Fact ID、Capability 或文本期望。变更后的五项 ref、binding digest 和实际 mutation 摘要必须写入 Replay Report，禁止用 runner 猜测或修补普通 `cases[]`。

ID 使用 `G-OPL-ATOMIC-<001..019>.<VARIANT>.BLOCKED`。`expected_commit_code` 固定为 `TEXT_GENERATION_BLOCKED`；七项 numeric delta 全为 `0`、`draft_head_changed=false`，Head 另在 replay 深度断言中同时比较 ID 与 sequence。case 集合固定为：

| 类别 | Variant 生成规则 | 数量 | detail error |
| --- | --- | ---: | --- |
| Production | `UNKNOWN_PRODUCTION` | 1 | `TEXT_PRODUCTION_IDENTITY_INVALID` |
| Production | `EXHIBITION_RHS_MISSING`、`EXHIBITION_INCOMPLETE` | 2 | `TEXT_PLAN_UNSUPPORTED` |
| Asset presence | `ASSET_MISSING_<RULE|SYMBOL|GRAMMAR|NORMALIZATION>` | 4 | `PROFILE_ASSET_MISSING` |
| Asset bytes | `ASSET_DIGEST_MISMATCH_<RULE|SYMBOL|GRAMMAR|NORMALIZATION>` | 4 | `PROFILE_ASSET_DIGEST_MISMATCH` |
| Asset identity | `ASSET_IDENTITY_MISMATCH_<RULE|SYMBOL|GRAMMAR|NORMALIZATION>` | 4 | `PROFILE_ASSET_IDENTITY_MISMATCH` |
| Capability binding | `BOUND_RULE_MISSING`、`BOUND_SYMBOL_MISSING` | 2 | `PROFILE_CAPABILITY_BINDING_MISMATCH` |
| Revision binding | `REVISION_BINDING_MISMATCH` | 1 | `PROFILE_REVISION_BINDING_MISMATCH` |
| Binding digest | `BINDING_DIGEST_MISMATCH` | 1 | `PROFILE_BINDING_DIGEST_MISMATCH` |

Ordinal 按上表从上到下分配；同一行的 role 按 `RULE_SET -> SYMBOL_ASSET -> GRAMMAR_ASSET -> NORMALIZATION_DATA` 展开。因此 `001~003` 是 Production，`004~007` 是 presence，`008~011` 是 digest，`012~015` 是 identity，`016/017` 是 bound Rule/Symbol，`018` 是 Revision binding，`019` 是 binding digest。Case ID、variant、stage、role 和 ordinal 必须互相校验。

Runner 先对原始 package 执行 `golden:check`，再复制到 attempt 专用临时目录并施加 fault；不得把本来损坏的仓库资产当作预期 BLOCKED。Mutation 到达目标阶段的规则固定如下：

1. `ASSET_MISSING/ASSET_DIGEST_MISMATCH` 的 `recompute_digests=false`；前者只删除 role 对应临时文件，后者只翻转该文件最后一个非空白 byte，不改 manifest/ref。
2. `ASSET_IDENTITY_MISMATCH` 的 `recompute_digests=true`；Rule 修改 `rule_set_id`，其余三类修改 `asset_id`，统一在原 ID 后追加 `.mutated`，version 不变。随后重算 entry byte length/digest、dependency/ref digest、package digest 和 Revision binding digest，但 Profile ref 的预期 asset ID/version 保持原值，使前四阶段通过后在 identity 阶段失败。
3. `BOUND_RULE_MISSING/BOUND_SYMBOL_MISSING` 删除 `rule.iso.struct.exhibition.v1` 或 `symbol.link.structural.exhibition`，保持 asset identity，并重算全部受影响 digest/ref/binding，使其只在 Capability binding 阶段失败。
4. `REVISION_BINDING_MISMATCH` 使用完整有效 package，只把 base/candidate 和 Atomic 顶层 expected binding 的 `symbol_catalog.digest` 最后一个十六进制字符按 `0->1`、其他值 `->0` 同步翻转，并按改后 refs 重算三者相同的 binding digest；base/candidate/expected 五项 ref 与 binding digest 仍深度相等，使 guard 通过，但三者都与已装配 package 不一致并在阶段 `7` 失败。
5. `BINDING_DIGEST_MISMATCH` 保持五项 ref 与 package 正确，只把 base/candidate 和 Atomic 顶层 expected binding 的 binding digest 最后一个十六进制字符按同一规则同步翻转为相同错误值；三者仍深度相等，使 guard 和阶段 `7` 通过，并在阶段 `8` 失败。

#### 7. 零增量与重复执行

每个 Atomic case 使用独立 package copy 和独立 SQLite。Runner 先 seed 已提交 base 与 Draft Head，记录以下 baseline，再从正式 `CandidateRevisionCommitter` 入口执行两次；两个 attempt 不能复用数据库、缓存或 mutation 目录：

```text
revision_document, revision_parent, text_trace_index, finding_index,
operation_record, idempotency_record, model_head(draft_head_revision_id, head_sequence)
```

失败后重新打开 SQLite，逐项断言前六张表增量为 `0`，Head ID/sequence 不变，candidate Revision JSON 不存在；另用 repository spy 断言装配、validation、planning 失败时 `repository.commit()` 调用次数为 `0`。只断言异常类型、不回读 SQLite，或只证明第一次 attempt 均不算关闭。

#### 8. Gate 退出证据

- [x] Exhibition tuple、默认/显式分支、端点分区、Object/Process 分组顺序、范围排除和 Trace 来源已冻结。
- [x] Package envelope、四类 asset loader、assembler、plan binding validator、缓存键和 ACTIVE bypass 禁令已冻结。
- [x] 14 阶段短路顺序、detail/top-level 错误映射、19 个 Atomic case、mutation 到达规则和七项零增量已冻结。
- [x] `opl.structural.exhibition.v1` 的两个 PASS case 通过，Structural Generator/合法 canonical 用例达到 `24/24`，Process mixed 顺序符合 ISO。
- [x] Rule/Symbol/Grammar/Normalization loader 与 assembler 测试全部通过；Rule/Symbol 绑定缺失由隔离 Profile 的实际资产移除触发。
- [x] `atomic_cases[]` Schema/fixture/runner 已实现，19 个 case 两次均为 `BLOCKED_MATCHED`，错误码和 role 精确一致。
- [x] 所有 case 的 Revision/Parent/Trace/Finding/Operation/Receipt 增量为 `0`，Head 不移动，pre-repository case 的 `repository.commit()` 调用为 `0`。
- [ ] `GATE-05-01~04` 仍按各自证据关闭；本节设计冻结不关闭完整 `178` coverage、兼容回放、DEV-CANVAS-06 或生产 enablement。

### GATE-05-06 Compatibility/Handoff 冻结执行契约

本节是 `GATE-05-06` 的唯一实施口径。它冻结 Revision `0.1/0.2` 兼容窗口、历史 exact-digest 回放、ACTIVE Writer/Grammar 边界和 DEV-CANVAS-06 handoff，不表示当前 Schema、Reader/Writer、兼容 fixture、报告或 release build 已满足契约。

本节设计冻结子任务使用 `feature + design-module-docs (primary) + testing`；允许同步设计、DEV-CANVAS-05/06 spec/checklist，不授权实现 Schema/Reader/Writer、生成 release artifact、启用 Capability 或进入视觉/E2E/性能验收。

#### 1. 当前事实与边界

| 审计面 | 当前事实 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| Revision Schema | 工作树正在原 `$id=.../opm-revision/0.1` 上增加 Token/Trace，独立 `opm-revision-v0.2.schema.json` 不存在 | BLOCKED | 恢复不可变 `0.1`，新增并验证独立 `0.2` |
| Reader/Writer | `SemanticRevisionReader/JsonWriter` 都写死 `schema_version=0.1`，没有版本 Router | BLOCKED | Reader exact 分派 `0.1/0.2`，ACTIVE Writer 只输出 `0.2` |
| Legacy text | `0.1.0` Grammar 只有 `mappings[]`，不是 concrete pattern；Token/Trace legacy 构造器会制造 `LEGACY` SourceRef | BLOCKED | 隔离 Legacy Renderer 只回放历史文本，不补造或持久化 Token/Trace |
| ACTIVE Grammar | `CandidateRevisionCommand.grammar` 必填，Committer 直接使用该对象 | BLOCKED | ACTIVE command 删除该字段并只消费 assembler；历史回放走独立请求 |
| 历史资产 | `0.1.0` Profile package 和四类资产仍在仓库，旧 package/Grammar digest 可解析 | PARTIAL | 旧资产进入 release evidence bundle，并以 exact digest 双重回放 |
| ACTIVE 资产 | `0.2.0` Profile package 当前仅存在于未跟踪工作树，尚不是 clean source build 输入 | BLOCKED | exact bytes 进入受控 source commit，随后从 clean checkout 构建 |
| Handoff | 当前没有 handoff Schema、compatibility report、release artifact ref 或 Capability evidence catalog | BLOCKED | 形成机器 handoff，DEV-CANVAS-06 只消费 READY + exact SHA 输入 |

`GATE-05-06` 只证明指定 Revision/资产版本的读取、回放和交付闭包，不实施 Profile 语义迁移，不运行前端视觉、浏览器 E2E、性能或 ISO 符合性测试。

#### 2. 冻结版本与资产基线

| 用途 | Revision Schema | Profile package | Grammar | Canonical binding digest |
| --- | --- | --- | --- | --- |
| 历史读取/回放 | `MS-REV-001/0.1`，`opm-revision.schema.json` | `profile.iso19450.2024.draft/0.1.0`，package `4cc3289722ab5c62e9273127318d5dcb383f7f0bdb801d23293afdef48fcbb00` | `grammar.opl.iso19450.2024.draft/0.1.0`，`be315186135f2cfa525128532220b289e083fa4bc70bacb33a4287331467a9d1` | `35bf8490cdd363bc29380cc560d2667a70b72e474b739925b2cda4a598e3c037` |
| ACTIVE 写入/Golden | `MS-REV-001/0.2`，`opm-revision-v0.2.schema.json` | `profile.iso19450.2024.draft/0.2.0`，package `5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c` | `grammar.opl.iso19450.2024.draft/0.2.0`，`c88e672bd9db7f0405a7ef3fc464043f15cae844931192e3412c94ce05339e7d` | `93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d` |

两组 binding 都使用 `GATE-05-01` 的五 role 行编码算法。Rule、Symbol、Normalization 当前在两组中共享相同 `0.1.0` exact ref；共享版本不允许省略其 digest，也不表示未来可按版本字符串复用任意 bytes。

`0.1` Schema 和资产是历史依赖，release bundle 必须保留其原始 bytes；不得把 `0.2` 文件复制后改名为 `0.1`，也不得用新 Generator 重新解释旧 mapping。兼容报告必须记录每个输入 Schema、Revision、package 和四类 asset 的原始 bytes SHA-256。

#### 3. Reader、Writer 与历史回放职责

| 组件 | 输入 | 输出/守卫 |
| --- | --- | --- |
| `RevisionDocumentReaderRouter` | 原始 Revision bytes | 只窥视 `schema_id/version`，选择 exact Schema/Reader；未知版本阻断 |
| `RevisionV01Reader` | 通过不可变 `0.1` Schema 的 bytes | `RevisionDocumentEnvelope(version=0.1)`；不补 Token/Trace，不改原 bytes |
| `RevisionV02Reader` | 通过 `0.2` Schema 的 bytes | `RevisionDocumentEnvelope(version=0.2)`；验证 Text/Trace/binding 闭包 |
| `RevisionV02Writer` | ACTIVE candidate/committed model | 只输出 `0.2`；不存在 ACTIVE `RevisionV01Writer` |
| `HistoricalRevisionReplayService` | `HistoricalRevisionReplayRequest` + exact old binding | 用 digest 绑定的 Legacy Renderer 生成只读历史文本结果，禁止 commit |
| `LegacyOplRendererV01` | 仅 `0.1.0` Grammar digest | 重放 family-only 旧句式；输出 text-only evidence，不生成 `0.2` Token/Trace |
| `RevisionCompatibilityRunner` | 版本化 compatibility manifest | 两次隔离执行，生成机器 Compatibility Report |

`RevisionDocumentEnvelope` 至少携带 `schema_id/version`、原始 bytes SHA、Semantic Revision、`text_evidence_availability` 和只读标志。availability 只允许：`NOT_RECORDED`（无历史文本）、`STORED_TEXT_ONLY`（有旧 Text Artifact、无 Token/Trace）、`LEGACY_REPLAYED_TEXT`（仅本次隔离回放结果）、`FULL`（合法 `0.2` Text/Trace）。前三种均不得伪装为 `FULL`。

`0.1` base 可以在普通语义 command 中由 ACTIVE Writer 产生 `0.2` candidate，前提是五项 asset ref/binding 深度相等；Schema envelope 升级不得改变该 command 未触及的语义字段。若 Profile/Rule/Grammar/Symbol/Normalization 任一 ref 改变，必须走 Profile migration staging；普通 command 返回顶层 `RULE_VERSION_CONFLICT`、detail `PROFILE_MIGRATION_REQUIRED`，Revision/Parent/Trace/Finding/Operation/Receipt 和 Head 均不变。

#### 4. Compatibility manifest 与固定 13 case

新增：

```text
docs/contracts/schemas/opm-revision-compatibility-manifest.schema.json
docs/contracts/schemas/opm-revision-compatibility-report.schema.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/compatibility/opm-revision-compatibility-manifest.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/compatibility/fixtures/**
```

Manifest 固定 `manifest_id=compatibility.revision.0.1-to-0.2`、`manifest_version=0.1.0`，所有路径相对 manifest 且不得越界。每个 case 固定包含 `case_id/mode/expectation/input_ref/input_sha256/source_schema_ref/target_schema_ref?/source_binding/target_binding?/expected_availability?/expected_error_code?/expected_detail_code?/expected_transaction`；PASS/BLOCKED 条件字段互斥。

| Case | 场景 | 预期 | 稳定结果 |
| --- | --- | --- | --- |
| `COMPAT-001.V01_SEMANTIC_ONLY_READ.PASS` | `0.1` 无 Text Artifact，缺旧版可选集合 | PASS | 语义/顺序不变，缺省集合为空，availability=`NOT_RECORDED` |
| `COMPAT-002.V01_STORED_TEXT_READ.PASS` | `0.1` 含旧 Text Artifact、无 Token/Trace | PASS | 文本 bytes 不变，availability=`STORED_TEXT_ONLY`，不补造证据 |
| `COMPAT-003.V01_EXACT_DIGEST_REPLAY.PASS` | 旧 package/binding + Legacy Renderer | PASS | 两次 text bytes/SHA 一致，availability=`LEGACY_REPLAYED_TEXT`，零写入 |
| `COMPAT-004.V01_SQLITE_REOPEN.PASS` | SQLite seed 历史 Revision/Head 后重开 Projection/Text | PASS | Revision bytes、Head ID/sequence 和全部表不变 |
| `COMPAT-005.V01_TO_V02_SAME_BINDING.PASS` | `0.1` base 已绑定 `0.2.0` exact assets，执行一个代表性普通语义 command | PASS | candidate 为 `0.2`、binding 不变，仅包含 command 预期语义变化并正常原子提交 |
| `COMPAT-006.V02_ROUNDTRIP_REPLAY.PASS` | `0.2` Writer -> Reader -> replay -> SQLite 回读 | PASS | Semantic/Text/Token/Trace 深度等价且 SHA 稳定 |
| `COMPAT-007.UNKNOWN_SCHEMA.BLOCKED` | schema ID/version 无已注册 Reader | BLOCKED | `FORMAT_VERSION_UNSUPPORTED` / `REVISION_SCHEMA_UNSUPPORTED` |
| `COMPAT-008.V01_SHAPE_POLLUTION.BLOCKED` | `0.1` 冒充携带 `0.2` Token/Trace 字段 | BLOCKED | `PERSISTENCE_FAILED` / `REVISION_SCHEMA_SHAPE_INVALID` |
| `COMPAT-009.V01_ASSET_MISSING.BLOCKED` | 历史回放缺旧 Grammar 文件 | BLOCKED | `PROFILE_ASSET_MISSING` / `HISTORICAL_ASSET_MISSING` |
| `COMPAT-010.V01_ASSET_DIGEST_MISMATCH.BLOCKED` | 旧 Grammar bytes 与 ref 不同 | BLOCKED | `PACKAGE_INTEGRITY_FAILED` / `HISTORICAL_ASSET_DIGEST_MISMATCH` |
| `COMPAT-011.V01_RENDERER_MISSING.BLOCKED` | 旧资产完整但无 digest 对应 Legacy Renderer | BLOCKED | `TEXT_GENERATION_BLOCKED` / `HISTORICAL_RENDERER_MISSING` |
| `COMPAT-012.PROFILE_REBIND_WITHOUT_MIGRATION.BLOCKED` | `0.1.0` binding 直接改为 `0.2.0` | BLOCKED | `RULE_VERSION_CONFLICT` / `PROFILE_MIGRATION_REQUIRED` |
| `COMPAT-013.V02_LEGACY_VALUE_WRITE.BLOCKED` | ACTIVE Token=`PROCESS/OBJECT` 或 SourceRef=`LEGACY` | BLOCKED | `TEXT_GENERATION_BLOCKED` / `TEXT_LEGACY_VALUE_FORBIDDEN` |

固定汇总为 `13`：PASS `6`、BLOCKED `7`。每个 case 执行两次隔离 attempt；`001~004/007~013` 的所有持久化增量为 `0`，`005/006` 使用 `GATE-05-02` PASS transaction 结构。所有 `0.1` 输入在 attempt 前后 raw SHA 必须相同；BLOCKED case 的 detail/top-level code、Head 和 `repository.commit()` 调用次数必须与预期一致。

Compatibility manifest、fixture 和 report 是测试/交付证据，不进入 Profile 四项 required manifest、package digest 或五 role binding digest；Handoff 必须通过各自 raw SHA 引用它们。

#### 5. Compatibility Report

Report 固定 `schema_id=OPM-REVISION-COMPATIBILITY-REPORT-001`、`schema_version=0.1`，至少包含：manifest 原始 SHA、runner/build identity、两组 Schema ref、历史/ACTIVE binding、`case_count/pass_count/blocked_count/failed_count`、每个 case 的两次 attempt、输入/输出 SHA、availability、错误码、事务增量和 Head before/after。

Observed status 只允许 `PASS_MATCHED/BLOCKED_MATCHED/FAILED`；只有 `6/7/0` 且两个 attempt 全部 matched 才返回退出码 `0`。输入/Schema/资产无效返回 `2`，case mismatch 返回 `3`，未分类 I/O/内部错误返回 `4`。报告自身必须通过 Schema，且其原始 bytes SHA 进入 handoff。

#### 6. DEV-CANVAS-05 Handoff 机器契约

新增：

```text
docs/contracts/schemas/opm-dev-canvas-05-handoff.schema.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/reports/**
```

Handoff 固定 `schema_id=OPM-DEV-CANVAS-05-HANDOFF-001`、`schema_version=0.1`，顶层字段为：

```text
handoff_id, handoff_status, generated_at,
source_build, build_artifacts[], revision_contract,
historical_binding, active_binding,
gate_evidence[], coverage_summary, compatibility_summary,
capability_evidence[], production_gate, limitations[], blockers[]
```

`handoff_id` 固定编码为 `dev-canvas-05.<profile-id>.<profile-version>.<source-commit前12位>`；当前目标 Profile 的前缀为 `dev-canvas-05.profile.iso19450.2024.draft.0.2.0.`。`handoff_status` 只允许 `BLOCKED/READY_FOR_DEV_CANVAS_06`，`gate_evidence[].status` 只允许 `BLOCKED/MATCHED`。

1. 所有对象封闭；所有文件 ref 使用 bundle 内相对 `path + byte_length + sha256`，禁止绝对路径、`..`、仅版本无 digest 或仅报告状态无原始文件。
2. `source_build` 必填 source Git commit、`dirty_before_build=false`、evidence output root、Java/Node exact version、OS、build command 和 lockfile/POM SHA；clean 检查在生成 Handoff/report/artifact 之前执行，生成目录不是源码输入。`build_artifacts[]` 至少包含 `LOCAL_RUNTIME_JAR` 与含 runner/Schema/Profile `0.1.0/0.2.0` 的 `EVIDENCE_BUNDLE`。
3. `revision_contract` 固定 `reader_versions=["0.1","0.2"]`、`active_writer_version="0.2"`，并引用两个 Schema 原始 SHA。`historical_binding/active_binding` 必须等于第 2 节 exact ref/digest。
4. `gate_evidence[]` 必须恰有 `GATE-05-01~06`，分别引用 Golden Contract、Replay、Coverage、Token/Trace、Structural/Atomic、Compatibility/Build 报告；每项包含 `status/path/sha256/summary`，不得把 checklist 勾选状态当作报告。
5. `coverage_summary` 固定要求 semantic `178/130/48` 全 matched、Atomic `19/19`、Structural concrete `24/24`、Control allowed `20/20`、failed `0`，并引用 catalog/manifest/replay/trace SHA。
6. `capability_evidence[]` 对 `CAP-ISO-PROC-001~016`、`CAP-ISO-CTRL-001~008`、`CAP-ISO-STRUCT-001~010` 恰有 `34` 项。每项包含 family、eligibility、coverage keys、Template/Rule/Symbol/Grammar/binding digest 和 disabled reason；eligibility 只允许 `ELIGIBLE_FOR_RELEASE_VALIDATION/BLOCKED`。
7. `production_gate.state` 在 DEV-CANVAS-05 结束时只能是 `DISABLED`，`enabled_capability_ids=[]`。Handoff 只交付 release-validation eligibility；DEV-CANVAS-06 必须在视觉/E2E/性能/恢复通过后另行生成 enablement manifest，禁止把 eligibility 直接解释为 enabled。
8. `limitations[]` 必须明确未执行 DEV-CANVAS-06 视觉/E2E/性能、未证明其他硬件、未证明 ISO 19450:2024 符合性。

`handoff_status=READY_FOR_DEV_CANVAS_06` 时 `blockers=[]`；`BLOCKED` 时 `blockers.minItems=1`，每项必须包含稳定 code、owner Gate 和 evidence ref，禁止只写自由文本原因。

Handoff 文件不进入 Profile 四项 required manifest、package digest 或五 role binding digest。生成命令必须输出 handoff 原始 bytes SHA-256；DEV-CANVAS-06 的输入 `handoff_ref` 固定记录 `path + sha256`，任何内容变化都必须重新完成准入检查。

#### 7. READY 判定与 DEV-CANVAS-06 准入

`handoff_status=READY_FOR_DEV_CANVAS_06` 必须同时满足：

1. `GATE-05-01~05` 的实现退出证据全部 matched；
2. Compatibility `13/13` matched、failed `0`，旧 Revision/资产 bytes 未变化；
3. release build 来自 clean commit，两个 build artifact 和全部报告 ref 的 length/SHA 通过；
4. semantic `178`、Atomic `19`、Structural `24`、Control `20` 汇总与底层报告精确一致；
5. `34/34` Capability 均为 `ELIGIBLE_FOR_RELEASE_VALIDATION`；
6. production gate 仍为 `DISABLED`，未生成任何 enabled ID；
7. Handoff 和所有报告 Schema 验证通过，`handoff_ref.sha256` 已冻结到 DEV-CANVAS-06 输入。

任一条件不满足时 `handoff_status=BLOCKED`，必须列出稳定 `blockers[]`，DEV-CANVAS-06 只能读取诊断，不得进入 Build、视觉/E2E/性能或生成 enablement manifest。DEV-CANVAS-06 不得重新解释、修补或部分复制 DEV-CANVAS-05 报告；发现语义/资产缺口必须回流对应 Gate。

#### 8. Gate 退出证据

- [x] 不可变 `0.1`、独立 `0.2`、Reader/Writer 路由、Legacy Renderer 和 ACTIVE Grammar 边界已冻结。
- [x] 两组 exact package/Grammar/binding digest、13 个兼容 case、错误映射和重复执行已冻结。
- [x] Handoff Schema、报告引用、34 项 eligibility、READY 算法和 DEV-CANVAS-06 准入/回流已冻结。
- [ ] 原 `opm-revision.schema.json` 已恢复为 `0.1`，独立 `opm-revision-v0.2.schema.json`、Router、Readers 和 `RevisionV02Writer` 已实现并通过测试。
- [ ] `CandidateRevisionCommand.grammar` 已从 ACTIVE command 删除，legacy replay 无 commit 入口，ACTIVE committed Revision 不出现 `PROCESS/OBJECT/LEGACY`。
- [ ] Compatibility `13/13` 两次 matched，Report 为 `6/7/0`，所有历史输入 raw SHA、只读表和 Head 保持不变。
- [ ] `GATE-05-01~05` 实现证据全部关闭，clean release build、reports 和 artifacts 的 exact SHA 已生成。
- [ ] Handoff 通过 Schema，`34/34` eligibility、`handoff_status=READY_FOR_DEV_CANVAS_06`、production gate=`DISABLED`。
- [ ] DEV-CANVAS-06 checklist 已冻结 exact `handoff_ref` 后才可关闭输入门槛；当前不得启动 production enablement。

#### 2026-07-30 GATE-05-06 实现证据

1. `JAVA_HOME=<JDK21> npm run handoff:evidence` 生成并 Schema 校验两份独立机器报告：`GATE-05-01` 的 `16/16` Golden Contract mutation，以及 `GATE-05-04` 的 `160/160` JDK 21 Token/Trace 测试；后者同时验证 `130` 个 PASS Golden case 的两次 replay 均有 Trace SHA-256。
2. `JAVA_HOME=<JDK21> npm run handoff:check` 将两份报告及其 TAP/Surefire 原始结果复制到 handoff bundle，`GATE-05-01~06` 均为 `MATCHED`，Handoff Schema 校验通过。
3. 当前 handoff 仍为 `BLOCKED`，且 `34` 项 Capability 全部保持 `BLOCKED`、production gate 为 `DISABLED`。稳定 blocker 仅为 `SOURCE_BUILD_DIRTY` 与 `RELEASE_ARTIFACTS_MISSING`：当前工作树未清理，也未从 clean commit 生成 `LOCAL_RUNTIME_JAR/EVIDENCE_BUNDLE`。不得以当前 target 目录中的诊断报告替代 release artifact。

#### 2026-07-31 Clean Release Build 入口

`npm run handoff:release` 是正式构建入口。它在任何报告、JAR 或 bundle 写入前检查当前 checkout 的 `git status --porcelain`，仅接受 clean committed source；随后执行 Golden、Compatibility、Gate Evidence 与 JDK 21 Maven package，生成 `handoff/release/local-runtime-0.1.0-SNAPSHOT.jar`、包含 runner/Schema/Profile `0.1.0/0.2.0` 的 `handoff/release/dev-canvas-05-evidence-bundle.jar`，并写入 release-build 元数据。

`handoff:check` 仅在 release-build 元数据的 source commit 与当前 `HEAD` 一致、构建前 dirty=false、release 后除 `handoff/**` 工件外源码未变化、两种 artifact 均存在时才可生成 READY。校验器逐个复算所有报告、Schema、blocker 与 artifact ref 的 byte length/SHA；READY 还要求两个指定 artifact 和 `34/34` eligibility。release 输出目录已存在时构建拒绝覆盖，必须使用新的干净 checkout 或明确的新输出目录。当前工作树仍不满足 clean-source 前置，因此不得运行该入口生成 READY handoff。

### Control `20/20` 覆盖审计

| Control | 冻结组合数 | Grammar | Generator 映射/文本分支 | canonical OPL fixture | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| `CAP-ISO-CTRL-001` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| `CAP-ISO-CTRL-002` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| `CAP-ISO-CTRL-003` | 4 | 4/4 | 4/4 | 4/4 | PARTIAL |
| `CAP-ISO-CTRL-004` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| `CAP-ISO-CTRL-005` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| `CAP-ISO-CTRL-006` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| `CAP-ISO-CTRL-007` | 4 | 4/4 | 4/4 | 4/4 | PARTIAL |
| `CAP-ISO-CTRL-008` | 2 | 2/2 | 2/2 | 2/2 | PARTIAL |
| 合计 | 20 | 20/20 | 20/20 | 20/20 | PARTIAL |

`C-OPL-CTRL-BLK-001~010` 已覆盖 Result、State Result、Effect 输出、非输入段、基础 Capability 不匹配、两种 Modifier 缺失、两种 Modifier 重复和 Event+Condition。它们只证明 Planner 在生成前阻断；尚未形成版本化 golden fixture，也未证明持久化失败后无 Revision、Text Artifact 或 Head 移动。

### Structural 全变体覆盖审计

| Structural | Grammar 模板 | Generator 分支 | 合法 canonical OPL 模板用例 | 状态 | 关键缺口 |
| --- | ---: | ---: | ---: | --- | --- |
| `CAP-ISO-STRUCT-001` | 1/1 | 1/1 | 1/1 | PARTIAL | Object/Object、Process/Process 正例和 `SINGLE` Trace 已覆盖；缺标签反例、Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-002` | 1/1 | 1/1 | 1/1 | PARTIAL | Object/Object、Process/Process 正例和 `SINGLE` Trace 已覆盖；缺 Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-003` | 2/2 | 2/2 | 2/2 | PARTIAL | Object/Object、Process/Process 的双句与 `FORWARD/REVERSE` Trace 已覆盖；缺标签反例、Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-004` | 2/2 | 2/2 | 2/2 | PARTIAL | tagged Object/Object、null-tagged Process/Process 的单句和 `RECIPROCAL` Trace 已覆盖；缺其余标签/Thing 组合、Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-005` | 2/2 | 2/2 | 2/2 | PARTIAL | 合法 Object fan 的 `1/2/3`、完整/不完整和混合 Thing 阻断已覆盖；缺 Process fan、增删重排、Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-006` | 5/5 | 4/5 | 4/5 | PARTIAL | Attribute/Operation/mixed 的完整/不完整 OPL 与 Trace 已覆盖；`opl.structural.exhibition.v1` 仍无显式产生式身份入口，且缺 Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-007` | 4/4 | 4/4 | 4/4 | PARTIAL | Object 单项/多项/不完整、Process 单项和混合 Thing 阻断已覆盖；缺 Process 多项/不完整、增删重排、Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-008` | 2/2 | 2/2 | 2/2 | PARTIAL | Object 单/多 instance 与非法 completeness 已覆盖；Process、fan `3`、增删重排、Token/Trace 和 golden 未覆盖 |
| `CAP-ISO-STRUCT-009` | 1/1 | 1/1 | 1/1 | PARTIAL | Specialized Object -> 自身 Attribute Value State 正例与 source/owner/type 反例已覆盖；缺 Token/Trace 细粒度映射和 golden |
| `CAP-ISO-STRUCT-010` | 4/4 | 4/4 | 4/4 | PARTIAL | 15 个允许 State 位置及 tagged/null-tagged 变体、句槽和 Process 阻断已覆盖；Reciprocal 仍受 Local API `UNDIRECTED` 入口限制，缺 Token/Trace 细粒度映射和 golden |
| 合计 | 24/24 | 23/24 | 23/24 | BLOCKED | Exhibition 产生式身份与全部 Profile coverage key 尚未形成机器 manifest |

Local API 现有测试只为 `003/005/006/009/010` 提供部分候选、语义或投影证据，不能替代 OPL、Token、Trace、Rule 和 digest fixture。`CAP-ISO-STRUCT-010` 的 Generator 虽有 Reciprocal 分支，但生产命令入口不可达；该项在 API 与 Profile 方向契约一致前不得计为 PASS。

#### Structural 24 template 可执行证据矩阵

| Concrete template | Generator | 当前合法文本用例 | 状态/关闭条件 |
| --- | --- | --- | --- |
| `opl.structural.tagged.unidirectional.v1` | 可达 | Object/Object、Process/Process | PARTIAL：`SINGLE` Trace 已覆盖；补标签必填反例、Token/Trace 细粒度映射和 golden |
| `opl.structural.null-tagged.unidirectional.v1` | 可达 | Object/Object、Process/Process | PARTIAL：`SINGLE` Trace 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.bidirectional.forward.v1` | 可达 | Object/Object、Process/Process | PARTIAL：`FORWARD` Trace 已覆盖；补标签反例、Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.bidirectional.reverse.v1` | 可达 | Object/Object、Process/Process | PARTIAL：`REVERSE` Trace 已覆盖；补标签反例、Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.reciprocal.v1` | 可达 | Object/Object | PARTIAL：单句与 `RECIPROCAL` Trace 已覆盖；补 Process/Process、Token/Trace 细粒度映射和 golden |
| `opl.structural.null-tagged.reciprocal.v1` | 可达 | Process/Process | PARTIAL：单句与 `RECIPROCAL` Trace 已覆盖；补 Object/Object、Token/Trace 细粒度映射和 golden |
| `opl.structural.aggregation.complete.v1` | 可达 | Object `1/2` member | PARTIAL：合法同类 Thing 与列表已覆盖；补 Process fan、增删重排、Token/Trace 细粒度映射和 golden |
| `opl.structural.aggregation.incomplete.v1` | 可达 | Object `3` member | PARTIAL：合法同类 Thing 与不完整尾句已覆盖；补 Process fan、完整性切换 Fact ID、Token/Trace 细粒度映射和 golden |
| `opl.structural.characterization.complete.v1` | 可达 | Attribute、Operation 各一项 | PARTIAL：两种 feature-kind 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.characterization.incomplete.v1` | 可达 | Attribute、Operation 各一项 | PARTIAL：类型化不完整尾句已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.characterization.mixed.complete.v1` | 可达 | Attribute + Operation | PARTIAL：分组与 `as well as` 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.characterization.mixed.incomplete.v1` | 可达 | Attribute + Operation | PARTIAL：两个分组的 incomplete 尾句已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.exhibition.v1` | 不可达 | 0 | BLOCKED：先冻结并实现显式 parser/import 产生式身份入口 |
| `opl.structural.generalization.object.single.v1` | 可达 | Object 单项 | PARTIAL：合法 Object 单项和混合 Thing 阻断已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.generalization.process.single.v1` | 可达 | Process 单项 | PARTIAL：合法 Process 单项已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.generalization.multiple.v1` | 可达 | Object 两项 | PARTIAL：列表顺序已覆盖；补 Object 三项、Process 多项、Token/Trace 细粒度映射和 golden |
| `opl.structural.generalization.incomplete.v1` | 可达 | Object 一项 | PARTIAL：不完整尾句已覆盖；补 `2/3` 项、Process、Token/Trace 细粒度映射和 golden |
| `opl.structural.classification.single.v1` | 可达 | 1 | PARTIAL：补 Process、Trace 和机器 golden |
| `opl.structural.classification.multiple.v1` | 可达 | 1 | PARTIAL：补 Process、三项、增删重排、Trace 和机器 golden |
| `opl.structural.characterization.state.v1` | 可达 | Specialized Object + 自身 Attribute Value State | PARTIAL：source/owner/type 反例已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.state.unidirectional.v1` | 可达 | source/destination/both State × tagged/null-tagged | PARTIAL：6 个允许变体和 `SINGLE` Trace 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.state.bidirectional.forward.v1` | 可达 | source/destination/both State | PARTIAL：3 个允许变体和 `FORWARD` Trace 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.state.bidirectional.reverse.v1` | 可达 | source/destination/both State | PARTIAL：3 个允许变体和 `REVERSE` Trace 已覆盖；补 Token/Trace 细粒度映射和 golden |
| `opl.structural.tagged.state.reciprocal.v1` | Generator 可达、API 不可达 | source/destination/both State × tagged/null-tagged | PARTIAL：6 个生成器变体和 `RECIPROCAL` Trace 已覆盖；先统一 `UNDIRECTED` API 入口，再补 Token/Trace 细粒度映射和 golden |

`CAP-ISO-STRUCT-010` 的最小输入 coverage 为 `15`：Unidirectional 的 source/destination/both State × tagged/null-tagged 共 `6`，Bidirectional 的 source/destination/both State 共 `3`，Reciprocal 的 source/destination/both State × tagged/null-tagged 共 `6`。这 `15` 个输入会映射到 `4` 个 concrete template，不能用 `4/4` template presence 代替。

### Token/Trace 闭包覆盖审计

| 冻结门槛 | 当前实现证据 | 状态 | 未闭环项 |
| --- | --- | --- | --- |
| Token 最小字段 | `OplToken` 已有 `token_id/sentence_id/ordinal/text/kind/start_utf8_byte/end_utf8_byte/source_refs`；Revision Schema 同步必填，SQLite 测试逐句断言 Token `sentence_id` 与所属 Sentence 一致 | PASS | 已关闭；后续字段变化必须通过兼容 Schema version 演进 |
| UTF-8 range 与全 byte 覆盖 | `OplToken` 校验单 token UTF-8 byte 长度；`OplSentence` 校验 ordinal、连续区间、句子总 byte 长度和 token text 重建；生成句与中文多字节用例在当前全量测试通过 | PARTIAL | 尚无 gap、overlap、越界、错误 ordinal、非法字符边界等负向 fixture，也未覆盖所有 concrete 句式 |
| Token kind | 枚举包含冻结的 `ENTITY/STATE/RELATION_VERB/CONTROL_KEYWORD/LIST_SEPARATOR/PUNCTUATION/WHITESPACE`，tokenizer 已按名称、短语、空白和标点分段 | PARTIAL | 自动化只断言 `ENTITY/STATE`；Control、Structural list/completeness 和全部 Procedural 句式尚无 kind 序列 fixture |
| 名称与 State 引用 | Element/Feature/State 名称 token 可携带 owner、`name.local_name` 和 endpoint ordinal；Occurrence 进入基础 refs | PARTIAL | 当前/引用 Occurrence 未区分；同名端点合并、Feature State owner 和所有 State qualification 变体未形成 fixture |
| 基础动词与 Control keyword | Token 基础 refs 已包含 Fact、基础 Capability、具体 Endpoint、Template、Grammar、Rule、Occurrence 和全部 Modifier；Control refs 另包含 `control.capability` 指向的 Control Capability，Modifier 使用自身 stable ID | PARTIAL | 尚未为全部 Procedural/Control 句式形成 endpoint Golden；`RULE.stable_id` 仍退化为 template ID，尚无独立 Rule 资产身份 |
| list/completeness | tokenizer 能识别 `and/as well as` 为 `LIST_SEPARATOR` | BLOCKED | 逗号、separator 和 completeness 尾句未映射相邻 endpoint ordinals、`completeness` 字段及 Grammar list production |
| Bidirectional/Reciprocal | `sentence_slot` 已进入 source refs；Java 测试覆盖 `FORWARD/REVERSE/RECIPROCAL` 和 `CAP-ISO-STRUCT-010` 的 15 个输入变体，Bidirectional fixture 已断言 direction slot、label field 与 endpoint ordinal 来源 | PARTIAL | 尚无 Golden Token/Trace fixture；Reciprocal 的 label/endpoint source ref 尚未固定，生产入口仍受 `UNDIRECTED` 契约冲突阻断 |
| Sentence Trace 闭包校验 | `validateTrace()` 已验证每个 Sentence 恰有一个 Trace、Trace 包含全部 Token refs、Fact/Occurrence/Rule 来源、Grammar ID/digest 和合法 UTF-8 byte range | PARTIAL | 尚未验证 Modifier/State/Feature/Element 必需集合、range 对应的具体 source、全部 Rule 与 Profile/Rule/Symbol/Normalization binding 依赖闭包 |
| Rule 与 binding digest | Trace 已携带并校验 Revision 的 `binding_digest`；Grammar ref 记录 binding ID，Trace `rule_ids` 和 Sentence `generation_rule_ids` 均有值 | PARTIAL | Grammar digest 被编码进 `field_path`；Rule ID 退化为 template ID；Profile/Rule/Symbol 等精确来源尚未闭合 |
| SQLite 持久化 | Revision JSON 已写入 token、`sentence_id`、UTF-8 range、token/Trace source refs 和 Trace ranges；SQLite 测试解析 JSON 并逐句断言 Token 所属 Sentence | PARTIAL | 仍未断言全部字段值与顺序、Revision Schema 合法性及 Text Artifact/Token/Trace 完整回读等价 |
| 兼容与禁止退化 | 新字段采用 Revision JSON 扩展，未修改 SQLite DDL | BLOCKED | `OplToken`、`OplTextTrace` 仍保留生成 `LEGACY` source ref 的兼容构造器，Schema 也允许 `LEGACY`；尚无生产路径禁止退化和旧 Revision 回读证据 |
| 当前自动化证据 | Procedural 为 `16 PASS + 17 BLOCKED`、Control 为 `20 PASS + 15 BLOCKED`，均已形成静态 Fact/Projection/Sentence/Token/Trace/artifact manifest 并双重 replay；Structural 合法 canonical 文本为 `23/24` | PARTIAL | 尚无 Structural 全量 Golden、Trace 全依赖负向闭包与完整 artifact/Token/Trace SHA-256 覆盖 |

审计结论：Token 最小字段已关闭，Control canonical OPL 单元组合达到 `20/20`，Sentence/Trace 一一对应和 SQLite `sentence_id` 持久化也已形成自动化证据；但 Golden Token/Trace、全 variant source refs、Rule 身份和完整 binding 依赖闭包仍为 `BLOCKED`，不得关闭 DEV-CANVAS-05 的对应 Build/Verify 项。
