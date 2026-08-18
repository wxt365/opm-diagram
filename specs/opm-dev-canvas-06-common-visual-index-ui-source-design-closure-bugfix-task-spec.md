# Spec: DEV-CANVAS-06 Common Visual Index/UI/Source 设计闭包修正

文档状态：`FROZEN`

更新时间：`2026-08-07`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

### 1.1 问题

`GOLDEN-AUTHORING-02B` 已冻结 Common Visual Fixture 顶层结构、8 个 subject 和 SQLite V1 唯一物化路径，但仍有三类实现者可自行决定的机器语义：

1. `index_seed` 只有五个数组名和数量/排序说明，没有五类 entry 的封闭 Schema、固定 ID/时间/状态值，也没有从 `MS-REV-001/0.2` 到 SQLite V1 每一列的一对一映射；
2. `capture_setup.steps[]` 只有自然语言步骤简写，没有 8 类 step 的 discriminated union、字段/枚举/参数约束和 8 个 subject 的 exact JSON 数组；
3. Common Catalog 的 `generator_ref/factory_source_ref` 指向 source bytes，但 02B Builder/Verifier 没有冻结 source root 的信任边界，也没有保证最终输出根自包含 source mirror。

在这些输入未闭合时，Builder、Verifier 和 Java Materializer 会各自发明 entry、step 或 source trust 规则，导致相同 fixture identity 可能对应不同 SQLite rows、UI 动作或 source bytes。

### 1.2 Root Cause

上游设计先冻结了 subject 语义差量和最终计数，未把可重建索引、受控 UI 动作和 source provenance 作为 Common Visual Fixture 同一机器契约的组成部分；已有 Common Catalog `fileRef` 只证明被引用文件的 raw bytes，不定义这些 bytes 从何处受控取得以及是否随输出根封装。

### 1.3 为什么此前未发现

此前定向验证集中在空 Text Artifact、JCS/Projection、Color Profile、Recovery Launch 和 E2E Runner identity。02B 的完整 Schema、8 个 factory bytes 和 semantic verifier 尚未实现，因此只检查了数组名称、步骤序列文字和历史 Catalog ref，没有执行“Revision -> index_seed -> SQLite rows”及“source checkout -> output mirror -> Catalog ref -> readonly verifier”的组合闭包。

## 2. Fix Strategy

按唯一顺序冻结：

1. 新增 Common Visual Fixture `0.1` Schema，以封闭定义承载五类 `index_seed` entry 和 8 类 UI step union；
2. 在 Visual Common 主设计中冻结所有 index entry 字段、固定 ID/时间/状态、排序、唯一性和 Revision 到 SQLite V1 的逐列映射；
3. 冻结每个 subject 的 exact `steps[]` JSON，不再允许实现从自然语言表格推导参数；
4. Builder 只允许镜像当前实际执行的 generator 和其静态导入的 factory 两个普通非链接文件，并逐 byte 封装到最终 fixture root；Catalog 的 source refs 只指向镜像；Builder/Verifier 均不接收 `--source-root`，也不依赖外部 checkout；
5. 保留历史Catalog`0.1.0`不可变，活动02B Catalog升为`catalog_version=0.2.0`；Catalog机器`schema_version`保持`0.1`并兼容两个已知版本，新semantic verifier只接受活动版本；
6. 同步 02B 实现规格、测试策略、开发执行包、工具链 checklist、正式索引和全局冻结基线，不提升任何实现、Report、Gate、Capability、production 或 ISO 状态。

本策略不影响公共 API、Revision `0.2`、SQLite V1 DDL、E2E Common fixture 或历史 Catalog/Plan bytes。

## 3. 修改边界

允许修改：

- 本规格及对应 Spec Mapping checklist；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md`；
- 新增 `docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json`；
- `docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json`仅增加历史`0.1.0`/活动`0.2.0`版本枚举，不改变字段形状；
- `specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`、`specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md`及其checklist；
- `docs/design/opm-test-strategy.md`、`docs/design/opm-development-execution-pack.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/design/opm-design-freeze-baseline.md`、`docs/README.md` 和历史全量冻结入口的当前指针。

禁止修改：

- `.harness/**`；
- `services/**`、`apps/**`、`scripts/**`、factory/Builder/Verifier/UI/Materializer 实现和测试；
- `docs/contracts/migrations/**`、SQLite V1 DDL、公共 API、Revision `0.2` Schema；
- 既有 fixture、Catalog、Capture Plan、Handoff、Evidence Bundle、Manifest、Report、candidate、approved 或 release bytes；
- Profile、Rule、Grammar、Symbol、Capability、production gate、Activation 和 ISO 状态；
- 新依赖、数据库 migration 或大范围重构。

## 4. 冻结结果

### 4.1 Index Seed

五类 entry 必须均为 `additionalProperties=false`，且数组必须显式存在：

| 数组 | 唯一键/排序 | Revision 来源 | SQLite 目标 |
| --- | --- | --- | --- |
| `element_index[]` | `element_id` | `elements[]` | `element_index` 全 6 列 |
| `fact_endpoint_index[]` | `fact_id/ordinal/endpoint_id` | `facts[].endpoints[]` | `fact_endpoint_index` 全 7 列 |
| `occurrence_index[]` | `context_id/occurrence_id` | `occurrences[]` | `occurrence_index` 全 6 列 |
| `finding_index[]` | `finding_id`；仅 `FINDING_FOCUS` 一项 | fixture 冻结 Finding | `finding_index` 全 8 列 |
| `operation_record[]` | `operation_record_id`；仅 `BLOCKED_FEEDBACK` 三项 | fixture 冻结 Operation | `operation_record` 全 11 列 |

`source_revision_id/model_id` 必须逐 byte 等于同 fixture Revision/Model。所有时间字段统一等于 `generated_at = Instant.ofEpochSecond(source_date_epoch)` 的 UTC ISO-8601 秒精度值；不允许当前时间、毫秒差异或本地时区。固定状态、ID、空值、排序和 subject exact 数组由主设计与 Schema共同承接。

### 4.2 UI Steps

唯一 `step_type` 枚举为：

```text
SELECT_OCCURRENCE
SELECT_RELATION_TOOL
SELECT_ENDPOINT
WAIT_CAPABILITY_OPTIONS
SELECT_EXACT_OPTION
OPEN_RIGHT_PANEL
OPEN_RELATION_CATALOG
CLEAR_RELATION_SEARCH
EXPAND_GROUP
OPEN_BOTTOM_PANEL
SELECT_FINDING
LOCATE_FINDING
SUBMIT_ONE_SHOT_FAULT_COMMAND
```

其中 8 类 JSON shape 按参数结构归并为：无参数、occurrence、capability、endpoint、right panel、group、bottom/finding、fault command。Schema 使用 `oneOf` discriminated union，禁止未知字段、自由 selector/script/payload/sleep。8 个 subject 的 exact step object/顺序只由主设计第 7 章承接。

### 4.3 Source Mirror

唯一 allowlist 和镜像路径为：

```text
scripts/build-canvas06-common-visual-fixtures.mjs
  -> sources/scripts/build-canvas06-common-visual-fixtures.mjs

tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
  -> sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

Builder 必须以 `fileURLToPath(import.meta.url)` 取得当前实际执行的 generator 普通文件，以静态 ESM import URL 取得本次实际调用的 factory 普通文件；两者都必须通过 `lstat/realpath`、单链接、非 symlink、普通文件和固定 basename/path 检查。禁止从 CLI、环境变量、cwd、Git tracked set、glob、目录扫描、动态 import 或 Catalog 自报 path 选择 source。Builder 先逐 byte copy 到 staging mirror，fsync 后回读并证明 source bytes 与 mirror bytes相等，再计算 mirror raw `path/byte_length/sha256`；Catalog `generator_ref` 和所有 `factory_source_ref` 只能指向上述 mirror。源与镜像 bytes 任一不等立即失败。

Builder 和 Verifier 均禁止 `--source-root`。Verifier 只允许从 readonly fixture root 解析 Catalog ref、验证安全相对路径、ordinary non-symlink、单链接、allowlist exact path、raw SHA/length、generator/factory 唯一性和前后 tree digest。最终 root 不得包含其他 source 文件、Git metadata、绝对路径或外部 checkout path；mirror只证明本次实际执行/调用的两份source bytes，不把Handoff的上游`source_build.source_commit`重解释为02B source identity。

## 5. 约束与兼容

1. Common Fixture Catalog机器`schema_version`保持`0.1`；历史`catalog_version=0.1.0`只读，含完整Visual fixture和source mirror的活动Catalog固定为`0.2.0`。Catalog Schema只接受这两个已知版本，新02B/03B semantic verifier必须拒绝历史`0.1.0`；
2. Common Visual Fixture 保持已冻结的 `0.1/0.1.0`，本包首次发布其完整机器 Schema，不重解释任何已发布完整 fixture，因为当前不存在这类 bytes；
3. Revision `0.2` 与 SQLite V1 保持不变；`index_seed` 是一对一重建输入，不是第二语义事实源；
4. source mirror 只证明本次实际执行/调用的 02B generator/factory bytes，不证明 clean build、Runtime JAR、production release 或 ISO 符合性；
5. 任何未来 allowlist、step、entry、固定时间、ID 或映射变化必须发布新的 fixture/catalog version 和新 change root，不得原地改写。

## 6. 验收与验证

设计验收必须证明：

1. Common Visual Fixture Schema 是 Draft 2020-12 可解析的封闭 Schema，五类 index entry 与 8 类 step shape 均无开放字段；
2. 主设计为 8 个 subject 给出 exact `index_seed` 差量和 exact `steps[]` JSON；
3. 每个 index 字段都有唯一 Revision/fixed input 来源及唯一 SQLite V1 列，null/空值规则明确；
4. Builder/Verifier CLI、运行source owner、source allowlist、镜像布局、symlink/escape/raw ref 和零输出边界唯一；
5. 02B 实现规格/checklist、测试策略、执行包、toolchain checklist、README 和冻结基线指针一致；
6. JSON 解析、Schema meta-validation、Markdown相对链接/表格/围栏、固定术语和 `git diff --check` 通过。

本轮不运行 02B Builder/Verifier、03C Materializer、浏览器、SQLite 物化、Visual/E2E/Recovery、production Report 或 release Gate，因为这些实现仍未完成。

## 7. 回滚

删除本包新增 Spec/checklist/Common Visual Fixture Schema，恢复主设计、02B入口和全局索引/基线的本包增量。不得删除或改写历史 fixture/Catalog/Plan、Handoff、release root、实现代码、数据库或用户资产。

## 8. 事实与假设

### 8.1 事实

1. SQLite V1 五张目标表的列、主键、外键和状态约束已经冻结；
2. Revision `0.2` 已定义 Element、Fact endpoint、Occurrence 的正式字段，但 Finding/Operation 不属于 Revision 文档；
3. 当前 8 个 Visual fixture 是历史元数据 fixture，不包含本规格冻结的完整字段；
4. 当前 Handoff `source_build.source_commit` 只绑定上游 DEV-CANVAS-05 clean build，不绑定后续 02B generator/factory source；
5. 当前 02B Builder/Verifier 尚未实现，未生成完整 fixture、source mirror、SQLite base 或 production evidence。

### 8.2 假设/解释

无。实现遇到 Schema、Revision、SQLite 列或 UI step 多种合理映射时，必须回到设计变更流程，不得自行选择。
