# DEV-CANVAS-06 Visual Common Fixture Materialization 与 Color Profile 设计

文档版本：`1.4`

设计状态：`FROZEN`

实现状态：`NOT_STARTED`

责任：`DFR-021` / `GATE-06-03` Visual Golden Authoring

## 1. 文档定位

本文是 8 个 Visual Common subject 从 fixture bytes 到 Runtime 可捕获状态的唯一设计口径，同时冻结 Capture Plan `srgb` 与 Golden Environment `sRGB IEC61966-2.1` 的唯一映射。Golden Authoring 主设计继续承接审批、发布和 approved evidence；本文只承接 Common materialization、UI setup、Projection join 和 color profile semantic join。

本文冻结设计并发布Common Visual Fixture机器Schema；不表示Schema producer/contract test、factory、SQLite materializer、03B author、fixture/Catalog/Plan、source mirror、E2E asset、PNG、candidate或approved evidence已经生成。

## 2. 冻结决策

1. Common Fixture Catalog机器`schema_id/schema_version`保持`OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001/0.1`且不增加optional字段；历史`catalog_version=0.1.0`不可变，含完整Visual fixture、32个E2E asset和两份source mirror的活动Catalog固定为`0.2.0`；
2. 活动Catalog`visual_subjects[].fixture_ref`必须指向`OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001/0.1/0.1.0`完整fixture；
3. Capture Plan 保持 `0.1/0.1.0`，但 Common `expected_projection_sha256` 改为完整 `expected_projection` 的 RFC 8785 JCS SHA-256；
4. 唯一物化路径是 exact Runtime JAR 中 release-authoring-only、non-web 的 SQLite V1 materializer；禁止公共 API 物化、浏览器 localStorage seed、网络 mock、DOM 状态注入或实现时在 API/SQLite 之间选择；
5. 每个 subject 先生成一个 immutable base，再为每个 capture attempt 创建 fresh clone：`8` 个 base、`72` 个 capture、`144` 个 clone；
6. transient candidate/catalog/finding/feedback 通过正常 production Web 和真实 UI/API 路径建立；只有 `BLOCKED_FEEDBACK` 允许 exact Runtime JAR 的一次性、进程内、release-only SQLite fault hook；
7. Plan raw 值固定为 `srgb`，Environment canonical 值固定为 `sRGB IEC61966-2.1`，只接受这一对显式映射；
8. 旧 8 个元数据 fixture 和 `GOLDEN-CANVAS06-20260803-001` 保持不可变，可作为历史 Schema 资产，但不得进入新的 03B authoring。

## 3. 机器契约与 Owner

| 契约 | 版本 | Owner | 当前状态 |
| --- | --- | --- | --- |
| Common Fixture Catalog | Schema `0.1`；历史`0.1.0`/活动`0.2.0` | QA | 历史实体已实现；活动bytes/producer未实现 |
| Common Visual Fixture | `0.1/0.1.0` | QA + Runtime | 设计与机器Schema已冻结，fixture bytes/producer/verifier未实现 |
| Common Visual Materializer | `0.1.0` | Runtime | 设计冻结，未实现 |
| Common Projection Normalizer | `0.1.0` | Frontend + QA | 设计冻结，未实现 |
| Color Profile Mapping | `0.1.0` | QA + Release | 设计冻结，未实现 |
| Common JCS/Parity Contract | `0.1.0` | QA + Runtime | 设计、共享Node模块和向量已实现；03C Java消费测试未实现 |
| Capture Plan | `0.1/0.1.0` | QA | Schema/Planner 已存在，02B semantic join 修正未实现 |

目标 Schema 路径固定为：

```text
docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json
```

Common Catalog Schema只允许增加历史`0.1.0`/活动`0.2.0`已知版本枚举，字段形状不变；Capture Plan和Golden Environment既有Schema不得改写。内容闭包由新fixture Schema和semantic verifier承接。

## 4. Common Visual Fixture `0.1`

### 4.1 顶层封闭字段

每个 fixture 必须 `additionalProperties=false`，完整字段为：

```text
schema_id="OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001"
schema_version="0.1"
fixture_version="0.1.0"
fixture_id
subject_id
factory_id
generated_at
source_binding
project
model
revision_document
index_seed
capture_setup
expected_projection
fixture_payload_sha256
```

`generated_at`唯一等于`Instant.ofEpochSecond(source_date_epoch)`的UTC秒精度形式`YYYY-MM-DDTHH:mm:ss.000Z`，禁止当前时间、本地时区、其他小数精度或同义offset。`fixture_payload_sha256=sha256(JCS(除 fixture_payload_sha256 外的整个 fixture))`。Catalog 的 `fixture_ref.sha256` 是格式化 JSON 文件 raw SHA；两者不得互换。生产文件使用 UTF-8、LF、2 空格缩进、末尾单个 LF；相同 binding、实际generator/factory source bytes和epoch必须 byte-identical。

### 4.2 Project/Model/Revision 公共映射

令 `slug=subject_id.toLowerCase().replaceAll("_","-")`。以下值唯一：

```text
project.project_id  = "project.visual." + slug
project.name        = "Release Visual " + subject_id
project.normalized_name = project.name.toLowerCase(Locale.ROOT)
project.description = "DEV-CANVAS-06 release visual common fixture."
project.status      = "ACTIVE"

model.model_id      = "model.visual." + slug
model.project_id    = project.project_id
model.name          = project.name
model.normalized_name = project.normalized_name
model.description   = project.description
model.status        = "ACTIVE"

revision_document.schema_id      = "MS-REV-001"
revision_document.schema_version = "0.2"
revision_document.revision_id    = "revision.visual." + slug
revision_document.model_id       = model.model_id
revision_document.revision_sequence = 1
revision_document.model_header.root_context_id = "context.visual." + slug + ".sd"
```

`source_binding` 必须与 Catalog/Handoff active binding 五角色及 `binding_digest` 完全相等。写入 Revision 时，每个 `{id,version,sha256}` 映射为 `{id,version,digest:{algorithm:"sha256",digest:sha256}}`，禁止重算或替换资产版本。

`schema_set_ref` 固定为：

```json
{"core_metamodel_version":"0.2","profile_schema_version":"0.2","rule_schema_version":"0.1","storage_schema_version":"1.0"}
```

所有 Element/State/Fact/Context 的 `source` 固定使用 active profile id/version、`source_kind="ReleaseVisualFixture"`、`source_entity_id="fixture."+slug`；`normalization.level="CORE"`。`validation_summary` 固定为 `POST_COMMIT/0 blocking/0 warning/0 suggestion/INCOMPLETE`，其 report digest 和 `revision_digest` 分别按排除自身字段后的 JCS SHA-256 计算。未使用的 `features/state_presentations` 必须是空数组；`text_artifact`和`text_traces`必须按第4.2.1节显式出现。

### 4.2.1 唯一空Text Artifact闭包

Visual Common fixture不执行OPL生成，但`MS-REV-001/0.2`要求`text_artifact`为必填封闭对象。每个subject必须写入以下唯一形状，不允许省略、写`null`、增加paragraph/token字段或使用空字符串占位：

```json
{
  "artifact_id": "artifact.visual.<slug>.empty",
  "modality": "OPL",
  "context_id": "context.visual.<slug>.sd",
  "grammar_ref": {
    "id": "<source_binding.text_grammar.id>",
    "version": "<source_binding.text_grammar.version>",
    "digest": {
      "algorithm": "sha256",
      "digest": "<source_binding.text_grammar.sha256>"
    }
  },
  "sentences": [],
  "artifact_digest": {
    "algorithm": "sha256",
    "digest": "<empty-artifact-sha256>"
  }
}
```

Revision顶层同时必须存在`"text_traces":[]`。`artifact_id/context_id`按本节逐byte派生；`grammar_ref`必须与同fixture `source_binding.text_grammar`逐字段相等，只把Catalog/Handoff的裸`sha256`映射为Revision Digest对象，不重算Grammar资产。

`empty-artifact-sha256`的唯一preimage为：

```json
{
  "schema_id": "OPM-DEV-CANVAS-06-EMPTY-TEXT-ARTIFACT-PREIMAGE-001",
  "schema_version": "0.1",
  "revision_id": "<revision_document.revision_id>",
  "text_artifact": {
    "artifact_id": "artifact.visual.<slug>.empty",
    "modality": "OPL",
    "context_id": "context.visual.<slug>.sd",
    "grammar_ref": {
      "id": "<source_binding.text_grammar.id>",
      "version": "<source_binding.text_grammar.version>",
      "digest": {
        "algorithm": "sha256",
        "digest": "<source_binding.text_grammar.sha256>"
      }
    },
    "sentences": []
  },
  "text_traces": []
}
```

算法固定为：

```text
artifact_digest.digest = sha256(UTF8(JCS(empty_text_artifact_preimage_v01)))
```

JCS只能调用第8.3节唯一owner；字符串不做trim/case folding，数组保持上述顺序，preimage不包含`artifact_digest`以避免自引用。`revision_digest`必须在插入完整`text_artifact`、`text_traces=[]`和validation summary后，对仅排除Revision自身`revision_digest`的完整Revision计算，因此空工件及其digest进入Revision摘要。

该空工件只表示“Visual base尚未执行文本生成”，不是`OPL-GOLDEN-ARTIFACT-001/0.1`生成结果，不得进入OPL golden、Token/Trace符合性或文本正确性判定。后续真实命令若生成OPL，必须整体替换`text_artifact/text_traces`并使用正式OPL Artifact/Trace摘要，禁止在空工件上追加Sentence。

### 4.3 `index_seed`

`index_seed`是从同fixture Revision和本节固定补充记录一对一得到的SQLite V1重建输入，不是第二语义事实源。其唯一机器形状由[Common Visual Fixture Schema](../contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json)承接；顶层与五类entry均`additionalProperties=false`。五个数组必须显式存在：

```text
element_index[]
fact_endpoint_index[]
occurrence_index[]
finding_index[]
operation_record[]
```

令`R=revision_document.revision_id`、`M=model.model_id`、`P=project.project_id`、`C=revision_document.model_header.root_context_id`、`T=generated_at`。前三类entry与Revision的逐字段映射固定为：

| Entry | 封闭字段 | 唯一来源/算法 | SQLite V1列 |
| --- | --- | --- | --- |
| `element_index` | `source_revision_id,model_id,element_id,core_kind,capability_id,normalized_name` | `R,M,element.element_id,element.core_kind,element.capability_ref.capability_id,element.name.local_name.toLowerCase(Locale.ROOT)`；Visual名称均为ASCII，不trim、不做Unicode normalization | 同名6列 |
| `fact_endpoint_index` | `source_revision_id,model_id,fact_id,endpoint_id,endpoint_role,target_entity_id,ordinal` | `R,M,fact.fact_id,endpoint.endpoint_id,endpoint.role,endpoint.target_id,endpoint.ordinal` | 同名列；`endpoint_role -> endpoint_role`、`target_entity_id -> target_entity_id` |
| `occurrence_index` | `source_revision_id,model_id,context_id,occurrence_id,target_entity_id,ownership` | `R,M,occurrence.context_id,occurrence.occurrence_id,occurrence.target_id,occurrence.ownership` | 同名列；`target_entity_id -> target_entity_id` |

所有普通Consumption endpoint ID固定为`endpoint.visual.<slug>.0/.1`；Fundamental fan固定为`.0/.1/.2/.3`。所有本设计Occurrence的`ownership=OWNED`。数组排序分别为`element_id`、`fact_id/ordinal/endpoint_id`、`context_id/occurrence_id`的UTF-8 byte lexical升序；不得使用locale、插入顺序或SQLite隐式顺序。

`finding_index`只允许`FINDING_FOCUS`以下一项，完整字段直接映射SQLite同名8列：

```json
{
  "source_revision_id": "revision.visual.finding-focus",
  "model_id": "model.visual.finding-focus",
  "finding_id": "finding.visual.finding-focus.001",
  "rule_id": "RULE-VISUAL-COMMON-001",
  "severity": "WARNING",
  "category": "MODEL_QUALITY",
  "context_id": "context.visual.finding-focus.sd",
  "entity_id": "fact.visual.finding-focus"
}
```

`operation_record`只允许`BLOCKED_FEEDBACK`三项，顺序固定为`VALIDATION_BLOCKED -> REVISION_CONFLICT -> READONLY`，每项完整字段映射SQLite同名11列：

| ordinal | `operation_record_id` | `command_id`/`diagnostic_id`后缀 | `occurred_at` |
| ---: | --- | --- | --- |
| `0` | `operation-record.visual.blocked-feedback.validation-blocked` | `validation-blocked` | `T + 0秒` |
| `1` | `operation-record.visual.blocked-feedback.revision-conflict` | `revision-conflict` | `T + 1秒` |
| `2` | `operation-record.visual.blocked-feedback.readonly` | `readonly` | `T + 2秒` |

三项其余字段逐项固定为：

```text
project_id=P
model_id=M
operation_id="operation.visual.blocked-feedback.seed"
aggregate_id=M
command_id="command.visual.blocked-feedback."+后缀
input_revision_id=R
result_revision_id=null
result_status="BLOCKED"
diagnostic_id="diagnostic.visual.blocked-feedback."+后缀
occurred_at=上述UTC秒精度时间
```

`result_revision_id`必须以JSON `null`显式出现并以SQL NULL写入；不得省略或写字符串`"null"`。三个时间由`T`做精确秒加法后按`.000Z`格式输出，不读系统时钟。Operation Record只为UI History建立既有阻断历史，不创建Revision、parent、receipt或Finding。

8个subject的exact ID集合和数量固定为：

| Subject | `element_index.element_id`顺序 | `fact_endpoint_index.endpoint_id`顺序 | `occurrence_index.occurrence_id`顺序 | finding/operation |
| --- | --- | --- | --- | --- |
| `STATE_ROLES` | `element.visual.state-roles.order` | `[]` | `...completed,...new,...order,...processing` | `0/0` |
| `LONG_LABELS` | `...process,...request` | `endpoint.visual.long-labels.0,.1` | `...fact,...process,...request` | `0/0` |
| `FUNDAMENTAL_FAN` | `...assembly,...part-1,...part-2,...part-3` | `endpoint.visual.fundamental-fan.0,.1,.2,.3` | `...assembly,...fact,...part-1,...part-2,...part-3`按完整ID升序 | `0/0` |
| `CANDIDATE_LAYER` | `...input,...process` | `[]` | `...input,...process` | `0/0` |
| `INSPECTOR` | `...input,...process` | `endpoint.visual.inspector.0,.1` | `...fact,...input,...process`按完整ID升序 | `0/0` |
| `TOOLCHAIN_CATALOG` | `...input,...process` | `endpoint.visual.toolchain-catalog.0,.1` | `...fact,...input,...process`按完整ID升序 | `0/0` |
| `FINDING_FOCUS` | `...input,...process` | `endpoint.visual.finding-focus.0,.1` | `...fact,...input,...process`按完整ID升序 | `1/0` |
| `BLOCKED_FEEDBACK` | `...input,...process` | `endpoint.visual.blocked-feedback.0,.1` | `...fact,...input,...process`按完整ID升序 | `0/3` |

表中`...`只为Markdown压缩展示，producer不得把它当成字符串或推导规则；完整前缀分别为同列首项显示的`element.visual.<slug>.`、`occurrence.visual.<slug>.`。Verifier必须从Revision构造前三类期望row再深度比较，并独立构造Finding/Operation固定row；额外、缺失、重复、target不存在、ID/status/time/null或顺序不一致均拒绝物化。

### 4.4 `capture_setup`

字段固定为：

```text
setup_version="0.1.0"
steps[]
expected_read_revision
expected_context_id
expected_focus_target_id
expected_focus_anchor
expected_rendered_cell_count
one_shot_fault?
```

`steps[]`只允许第7章八类封闭JSON shape及各subject exact数组；每步`step_type`和参数必须逐字段相等，不接收脚本、CSS selector、任意JavaScript、HTTP payload、timeout或sleep。`one_shot_fault`只允许`BLOCKED_FEEDBACK`，固定hook和command id，不允许由CLI自定义。

## 5. Revision 构造规则

### 5.1 通用 ID 与布局

每个持久化 cell 必须具有同 slug 的：

```text
element_id/ state_id/ fact_id
occurrence_id="occurrence.visual.<slug>.<role>"
layout_id="layout.visual.<slug>.<role>"
context_id="context.visual.<slug>.sd"
```

Object/Process/State/Context capability 分别固定为 `CAP-OBJECT-001/CAP-PROCESS-001/CAP-STATE-001/CAP-CONTEXT-001`；普通 procedural Fact 使用 `CAP-ISO-PROC-001`，fan 使用 `CAP-ISO-STRUCT-005`。所有 capability 的 profile id/version来自 active binding。

布局单位是 Context world CSS pixel；`x/y/width/height` 为整数，`z_order` 为 `1..3`。viewport/zoom 只改变 View State，不改 Revision Layout。

### 5.2 8 个 subject 完整差量

下表与第 4.2、5.1 节公共模板合成完整 Revision；表中没有列出的 elements/states/facts/findings/operations 必须为空。

| Subject | 持久化语义与名称 | Layout `(x,y,w,h,z)` | Index 数量 `element/endpoint/occurrence/finding/operation` | rendered cells | Focus |
| --- | --- | --- | --- | --- | --- |
| `STATE_ROLES` | Object `element...order`/`Order`；State `...new`/`new`/`INITIAL`、`...processing`/`processing`/`DEFAULT`、`...completed`/`completed`/`FINAL`；Object `state_ids` 按该顺序 | order `(180,120,360,280,2)`；new `(220,190,140,30,3)`；processing `(220,250,140,30,3)`；completed `(220,310,140,30,3)` | `1/0/4/0/0` | `4` | `occurrence.visual.state-roles.order/CENTER` |
| `LONG_LABELS` | Object `...request`/`Enterprise Customer Order Fulfillment Request`；Process `...process`/`Coordinating Cross-Regional Fulfillment and Exception Resolution`；Consumption Fact `fact.visual.long-labels`，label slot `label.primary="consumes validated enterprise customer fulfillment request"` | request `(100,200,360,112,2)`；process `(620,194,380,124,2)`；fact `(460,256,160,2,1)` | `2/2/3/0/0` | `3` | `occurrence.visual.long-labels.fact/LABEL` |
| `FUNDAMENTAL_FAN` | Object whole `...assembly`/`Assembly`；parts `...part-1/2/3`/`Part One/Two/Three`；one `CAP-ISO-STRUCT-005` Fact，endpoint roles `WHOLE_THING,PART_THING,PART_THING,PART_THING`，ordinal `0..3`，`collection_completeness=INCOMPLETE` | assembly `(120,220,220,96,2)`；parts `(620,80,200,88,2)/(620,220,200,88,2)/(620,360,200,88,2)`；fact `(460,266,8,8,1)` | `4/4/5/0/0` | `5` | `occurrence.visual.fundamental-fan.fact/JUNCTION` |
| `CANDIDATE_LAYER` | Object `...input`/`Input`；Process `...process`/`Processing`；无 committed Fact | input `(120,220,220,96,2)`；process `(600,216,240,104,2)` | `2/0/2/0/0` | `3`，含一项 transient candidate | `candidate.visual.candidate-layer/CENTER` |
| `INSPECTOR` | Object `...input`/`Input`；Process `...process`/`Processing`；Consumption Fact `fact.visual.inspector` | input `(120,220,220,96,2)`；process `(600,216,240,104,2)`；fact `(340,266,260,2,1)` | `2/2/3/0/0` | `3` | `occurrence.visual.inspector.fact/CENTER` |
| `TOOLCHAIN_CATALOG` | Object `...input`/`Input`；Process `...process`/`Processing`；Consumption Fact `fact.visual.toolchain-catalog` | input `(120,220,220,96,2)`；process `(600,216,240,104,2)`；fact `(340,266,260,2,1)` | `2/2/3/0/0` | `3` | `P03-tool-relation-menu/CENTER` |
| `FINDING_FOCUS` | Object `...input`/`Input`；Process `...process`/`Processing`；Consumption Fact `fact.visual.finding-focus`；Finding `finding.visual.finding-focus.001` 固定 `rule_id=RULE-VISUAL-COMMON-001,severity=WARNING,category=MODEL_QUALITY,context_id=<root>,entity_id=<fact>` | input `(120,220,220,96,2)`；process `(600,216,240,104,2)`；fact `(340,266,260,2,1)` | `2/2/3/1/0` | `3` | `occurrence.visual.finding-focus.fact/CENTER` |
| `BLOCKED_FEEDBACK` | Object `...input`/`Input`；Process `...process`/`Processing`；Consumption Fact `fact.visual.blocked-feedback`；三项预置 Operation 分别 `BLOCKED/VALIDATION_BLOCKED`、`BLOCKED/REVISION_CONFLICT`、`BLOCKED/READONLY` | input `(120,220,220,96,2)`；process `(600,216,240,104,2)`；fact `(340,266,260,2,1)` | `2/2/3/0/3` | `3` | `P03-command-feedback/CENTER` |

普通 Consumption endpoints 固定为：Object `CONSUMED_OBJECT/ordinal=0`，Process `CONSUMING_PROCESS/ordinal=1`，`direction=DIRECTED`，`collection_completeness=NOT_APPLICABLE`。Fact/endpoint/occurrence/layout ID 均按本节 slug 规则生成；不得在实现时改用随机 ID。

## 6. SQLite V1 唯一物化

### 6.1 启动守卫

Materializer 只能在 exact Runtime JAR 同时满足以下参数时装配：

```text
--spring.profiles.active=release-golden-authoring
--opm.release.golden-authoring=true
--opm.release.visual-common-materializer=true
--spring.main.web-application-type=none
```

缺一、值不精确、存在 Web server 配置或默认生产启动时，组件不装配并退出 `GOLDEN_COMMON_MODE_REJECTED/2`。Materializer 不注册 controller、route、actuator extension、JMX write operation 或生产配置项。

### 6.2 写入顺序

每个 subject 使用 fresh empty root，单连接 `BEGIN IMMEDIATE`，唯一顺序为：

```text
SQLite V1 migration
-> profile/rule/grammar package rows
-> project_metadata
-> model_catalog
-> revision_document
-> model_head
-> element_index
-> fact_endpoint_index
-> occurrence_index
-> optional finding_index
-> optional operation_record
-> verify staged rows
-> COMMIT
-> close connection
-> read-only reopen verification
```

物理文本编码唯一为第8.3节owner输出的无BOM、无尾随LF JCS文本。核心表逐列映射固定为：

| SQLite表/列 | Fixture唯一来源 |
| --- | --- |
| `project_metadata.project_id/name/normalized_name/description/status` | `project`同名字段 |
| `project_metadata.default_profile_id/default_profile_version` | `source_binding.profile.id/version` |
| `project_metadata.created_at/updated_at` | `generated_at/generated_at` |
| `model_catalog.model_id/project_id/name/normalized_name/description/status` | `model`同名字段 |
| `model_catalog.profile_binding_json` | `JCS(revision_document.profile_binding)` |
| `model_catalog.created_at/updated_at` | `generated_at/generated_at` |
| `revision_document.revision_id/model_id/revision_sequence/schema_version` | `revision_document`同名字段 |
| `revision_document.profile_id/profile_version` | `revision_document.profile_binding.profile.id/version` |
| `revision_document.rule_set_id/rule_set_version` | `revision_document.profile_binding.rule_set.id/version` |
| `revision_document.schema_set_json/profile_binding_json` | `JCS(revision_document.schema_set_ref/profile_binding)` |
| `revision_document.document_json` | `JCS(revision_document)` |
| `revision_document.document_digest` | `sha256(UTF8(JCS(revision_document)))` |
| `revision_document.commit_reason/created_at` | `VISUAL_COMMON_FIXTURE_MATERIALIZED/generated_at` |
| `model_head.model_id/draft_head_revision_id/head_sequence/updated_at` | `model.model_id/revision_document.revision_id/1/generated_at` |

`element_index/fact_endpoint_index/occurrence_index/finding_index/operation_record`按第4.3节entry字段同名逐列插入，禁止Materializer从Revision之外重新规范化名称、替换ID或读取系统时间。Profile/Rule/Grammar package的`installed_at`也固定为`generated_at`；其ID/version/digest和raw package bytes继续由exact Runtime JAR active binding资产负责，不由fixture伪造。

`model_head`指向sequence `1`；`revision_parent`、idempotency、background task、asset manifest和`text_trace_index`均为`0`。禁止修改SQLite V1 DDL或复用130个Family materialization root。任一JCS文本、digest、时间、null或index row与上述映射不等必须在COMMIT前回滚。

SQLite V1没有独立`text_artifact`表。02B/03C的唯一计数定义为：

```text
text_artifact_count = count(revision_document rows where
  json_type(document_json,'$.text_artifact') == 'object'
  and the object passes Revision 0.2 plus 4.2.1 semantic verification)

text_trace_count = count(text_trace_index rows)
```

每个fresh Visual Common base提交后的固定值为`revision_document_count=1`、`text_artifact_count=1`、`text_trace_count=0`。Verifier还必须证明Head Revision的`json_type('$.text_traces')='array'`且`json_array_length('$.text_traces')=0`，以及`text_trace_index=0`；不得把`text_traces`数组本身计作一条Trace，也不得按Sentence数计算Text Artifact。

事务delta统一采用“提交前后上述计数之差”：从空库物化base时`revision_delta=1/text_artifact_delta=1/text_trace_delta=0`；后续BLOCKED操作三者均为`0`；后续成功生成新Revision时`text_artifact_delta`只在新Revision包含Schema-valid Text Artifact时为`1`，`text_trace_delta`等于新增`text_trace_index`行数。02B fixture verifier只验证预期值，03C SQLite verifier从数据库复算，二者不得从文件名、modality或`sentences.length`推断。

### 6.3 提交后验证

必须验证：

1. `PRAGMA integrity_check=ok`、foreign key 零行、无 WAL/SHM/journal；
2. Project/Model/Revision/Head、binding、document raw SHA、第4.2.1节空工件/Trace闭包、第6.2节计数和第 5.2 节 index 数量完全相等；
3. 正式 Revision reader 与正式 SQLite read path 均能重开；
4. 从重开结果计算 normalized committed Projection，与 fixture `expected_projection.committed_cells` 深度相等；
5. base 关闭后 tree digest 固定，后续只读验证前后不变。

`semantic_state_sha256` 固定为：

```text
sha256(JCS({
  storage_schema_version:"1.0",
  project_id,model_id,revision_id,revision_sequence:1,
  draft_head_revision_id:revision_id,head_sequence:1,
  source_binding,revision_document_sha256,index_counts,
  committed_projection_sha256
}))
```

SQLite raw SHA 是单次物理证据，不要求跨重建相等；`semantic_state_sha256` 在相同输入下必须相等。

## 7. 受控 UI Setup

### 7.1 通用顺序

每个 clone 启动正常 Web Runtime 和 production Web 后，只允许以下顺序：

```text
WAIT_RUNTIME_READY
OPEN_PROJECT_MODEL_REVISION
OPEN_ROOT_CONTEXT
VERIFY_COMMITTED_PROJECTION
APPLY_SUBJECT_SETUP_STEPS
VERIFY_EXPECTED_UI_STATE
FOCUS_TARGET
APPLY_VIEWPORT_AND_ZOOM
WAIT_STABLE
CAPTURE
```

步骤通过稳定 `data-testid` 和公开 UI/API 动作完成；禁止 `page.evaluate` 写 Pinia/X6/DOM 状态、route interception、mock response 或数据库热写。`page.evaluate` 只允许读取 normalized Projection、geometry、font 和 pending 状态。

### 7.2 Subject steps

Schema把所有`step_type`归入以下恰好8类封闭JSON shape；这是类型数量，不是subject数量：

| Shape | `step_type` | 必填参数 |
| --- | --- | --- |
| `commandOnlyStep` | `WAIT_CAPABILITY_OPTIONS/OPEN_RIGHT_PANEL/OPEN_RELATION_CATALOG/CLEAR_RELATION_SEARCH/LOCATE_FINDING` | 无 |
| `occurrenceStep` | `SELECT_OCCURRENCE` | `occurrence_id` |
| `capabilityStep` | `SELECT_RELATION_TOOL/SELECT_EXACT_OPTION` | `capability_id=CAP-ISO-PROC-001` |
| `endpointStep` | `SELECT_ENDPOINT` | `endpoint_role=SOURCE\|TARGET,target_kind,target_id` |
| `groupStep` | `EXPAND_GROUP` | `group_id=PROCEDURAL\|CONTROL\|STRUCTURAL` |
| `bottomPanelStep` | `OPEN_BOTTOM_PANEL` | `panel_mode=FINDINGS\|HISTORY` |
| `findingStep` | `SELECT_FINDING` | `finding_id=finding.visual.finding-focus.001` |
| `faultCommandStep` | `SUBMIT_ONE_SHOT_FAULT_COMMAND` | `command_id=command.visual.blocked-feedback.persistence-failed` |

每类均`additionalProperties=false`。完整`step_type`枚举是上表13个值；禁止alias、大小写折叠、trim、自由参数或按可见文本选择。每个subject的`steps[]`必须逐byte语义等于以下JSON；顺序是动作语义的一部分：

```json
{
  "STATE_ROLES": [
    {"step_type":"SELECT_OCCURRENCE","occurrence_id":"occurrence.visual.state-roles.order"}
  ],
  "LONG_LABELS": [
    {"step_type":"SELECT_OCCURRENCE","occurrence_id":"occurrence.visual.long-labels.fact"}
  ],
  "FUNDAMENTAL_FAN": [
    {"step_type":"SELECT_OCCURRENCE","occurrence_id":"occurrence.visual.fundamental-fan.fact"}
  ],
  "CANDIDATE_LAYER": [
    {"step_type":"SELECT_RELATION_TOOL","capability_id":"CAP-ISO-PROC-001"},
    {"step_type":"SELECT_ENDPOINT","endpoint_role":"SOURCE","target_kind":"ELEMENT","target_id":"element.visual.candidate-layer.input"},
    {"step_type":"SELECT_ENDPOINT","endpoint_role":"TARGET","target_kind":"ELEMENT","target_id":"element.visual.candidate-layer.process"},
    {"step_type":"WAIT_CAPABILITY_OPTIONS"},
    {"step_type":"SELECT_EXACT_OPTION","capability_id":"CAP-ISO-PROC-001"}
  ],
  "INSPECTOR": [
    {"step_type":"SELECT_OCCURRENCE","occurrence_id":"occurrence.visual.inspector.fact"},
    {"step_type":"OPEN_RIGHT_PANEL"}
  ],
  "TOOLCHAIN_CATALOG": [
    {"step_type":"OPEN_RELATION_CATALOG"},
    {"step_type":"CLEAR_RELATION_SEARCH"},
    {"step_type":"EXPAND_GROUP","group_id":"PROCEDURAL"},
    {"step_type":"EXPAND_GROUP","group_id":"CONTROL"},
    {"step_type":"EXPAND_GROUP","group_id":"STRUCTURAL"}
  ],
  "FINDING_FOCUS": [
    {"step_type":"OPEN_BOTTOM_PANEL","panel_mode":"FINDINGS"},
    {"step_type":"SELECT_FINDING","finding_id":"finding.visual.finding-focus.001"},
    {"step_type":"LOCATE_FINDING"}
  ],
  "BLOCKED_FEEDBACK": [
    {"step_type":"OPEN_BOTTOM_PANEL","panel_mode":"HISTORY"},
    {"step_type":"SUBMIT_ONE_SHOT_FAULT_COMMAND","command_id":"command.visual.blocked-feedback.persistence-failed"}
  ]
}
```

以下表格只说明上述exact JSON达到的终态，不再作为producer输入：

| Subject | `steps[]` 固定序列 | 终态 |
| --- | --- | --- |
| `STATE_ROLES` | `SELECT_OCCURRENCE(order)` | 三个 State 显式展开，selection=`single-element` |
| `LONG_LABELS` | `SELECT_OCCURRENCE(fact)` | 长名称和 Fact label 完整渲染，inspector closed |
| `FUNDAMENTAL_FAN` | `SELECT_OCCURRENCE(fact)` | junction、ordered branches、INCOMPLETE annotation current |
| `CANDIDATE_LAYER` | `SELECT_RELATION_TOOL(CAP-ISO-PROC-001)` -> `SELECT_ENDPOINT(input)` -> `SELECT_ENDPOINT(process)` -> `WAIT_CAPABILITY_OPTIONS` -> `SELECT_EXACT_OPTION(CAP-ISO-PROC-001)` | relation_candidate=`preview`；candidate ID=`candidate.visual.candidate-layer`；committed Revision/Projection不变 |
| `INSPECTOR` | `SELECT_OCCURRENCE(fact)` -> `OPEN_RIGHT_PANEL` | selection=`relation`；inspector=`inspector-relation-fields` |
| `TOOLCHAIN_CATALOG` | `OPEN_RELATION_CATALOG` -> `CLEAR_RELATION_SEARCH` -> `EXPAND_GROUP(PROCEDURAL)` -> `EXPAND_GROUP(CONTROL)` -> `EXPAND_GROUP(STRUCTURAL)` | catalog open；可见分组计数严格 `16/8/10`，disabled reason 可访问 |
| `FINDING_FOCUS` | `OPEN_BOTTOM_PANEL(FINDINGS)` -> `SELECT_FINDING(finding.visual.finding-focus.001)` -> `LOCATE_FINDING` | finding selected；fact highlight current；基础符号 geometry 不变 |
| `BLOCKED_FEEDBACK` | `OPEN_BOTTOM_PANEL(HISTORY)` -> `SUBMIT_ONE_SHOT_FAULT_COMMAND(command.visual.blocked-feedback.persistence-failed)` | 当前 feedback=`PERSISTENCE_FAILED`；history 同时可见 `VALIDATION_BLOCKED/REVISION_CONFLICT/READONLY`；Revision/Head不变 |

`BLOCKED_FEEDBACK.one_shot_fault` 固定为：

```text
hook_id="sqlite.revision-commit.before-insert"
command_id="command.visual.blocked-feedback.persistence-failed"
error_code="PERSISTENCE_FAILED"
max_invocations=1
```

hook 只能由 03C 通过进程内受控启动参数绑定 exact command id；没有 HTTP/环境通配符/运行时切换入口，触发一次后自动禁用。其他 subject、Family、production 默认启动和 Visual validation runner 禁止装配该 hook。

## 8. Common Projection Normalization

### 8.1 封闭 payload

fixture `expected_projection` 和 Runtime observed Projection 使用同一结构：

```text
projection_version="0.1.0"
subject_id
read_revision
context_id
committed_cells[]
transient_cells[]
selection{kind,target_id?}
panels{right_open,right_mode?,bottom_open,bottom_mode?}
relation_candidate{state,capability_id?,candidate_id?}
catalog{open,search,procedural_count,control_count,structural_count}
finding{selected_finding_id?,highlighted_target_id?}
feedback{current_code?,history_codes[]}
focus_target_id
```

空 optional 状态必须用 `null` 或空数组，不得省略，由 Schema 固定唯一形状。

`committed_cells[]` 从 Context Projection 生成并按 `cell_id` UTF-8 升序排列，每项固定为：

```text
cell_id,layer="COMMITTED",target_kind,target_id,construct_role,
geometry{x,y,width,height,z_order},state_roles[],capability_id
```

`transient_cells[]` 只允许 `CANDIDATE_LAYER` 一项：

```text
cell_id="candidate.visual.candidate-layer"
layer="CANDIDATE"
target_kind="FACT"
capability_id="CAP-ISO-PROC-001"
source_target_id=<input element id>
target_target_id=<process element id>
state="preview"
```

candidate 不得进入 `committed_cells`、Revision、OPL、Trace、Finding 或 SQLite index。

### 8.2 Digest 与比较

```text
expected_projection_sha256 = sha256(JCS(fixture.expected_projection))
observed_projection_sha256 = sha256(JCS(runtime_normalized_projection))
```

Planner 必须先 Schema/semantic 验证 fixture，再把 expected digest写入 9 个同 subject capture。03B 必须先做 payload 深度相等，再比较 digest；只比较 digest 不构成通过。cell 数等于 `committed_cells.length + transient_cells.length`，并与 Plan `expected_cells` 相等。

旧算法 `sha256(JCS({subject_id,focus_target_id}))` 标记为 `HISTORICAL_PLACEHOLDER`，新 author semantic preflight 必须拒绝。旧 Plan 不改写，后续 02B 使用新 change ID 生成新 Plan。

### 8.3 JCS唯一Owner与跨Runtime一致性

02B信任链的唯一Node实现固定为：

```text
scripts/canvas06-rfc8785.mjs
  canonicalizeJcs(value) -> canonical JSON text
  sha256Jcs(value)       -> lowercase SHA-256 of canonical UTF-8 bytes
```

值域只允许`null/boolean/safe integer/string/array/object`。integer必须满足`Number.isSafeInteger(value)`，范围固定为`[-9007199254740991,9007199254740991]`；浮点、非有限数、越界整数、`undefined`、函数、symbol、bigint和循环引用必须拒绝。string和object key必须是有效Unicode scalar sequence，拒绝lone surrogate；string使用JSON escaping。object key按RFC 8785要求对解码后的名称执行UTF-16 code unit lexical order，不按Unicode code point、locale或normalization排序。02B必须删除Capture Planner局部`jcs()`，Builder、Verifier和Planner只能导入该模块；02B范围外历史脚本的局部实现不在本包迁移，也不得被02B调用。

Node与Java的唯一共用向量路径为：

```text
tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json
```

文件是封闭数组，每项字段为`vector_id/input/canonical_utf8/sha256`，`vector_id`唯一并按下表顺序排列；相同input不得重复。下表冻结vector值，不允许实现时替换为其他样例：

| vector_id | input JSON | canonical_utf8 | sha256 |
| --- | --- | --- | --- |
| `NULL` | `null` | `null` | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` |
| `BOOLEAN` | `true` | `true` | `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` |
| `INTEGER_POSITIVE` | `9007199254740991` | `9007199254740991` | `f40b423c2dd95ff2b2f027e22208f438cf7242862e5e746860e697308c9add26` |
| `INTEGER_NEGATIVE` | `-9007199254740991` | `-9007199254740991` | `4c933a456bb8f2e9894b2d0b26480439cd72d52fb8a27cbf8fd7f323f22c7815` |
| `STRING_EMPTY` | `""` | `""` | `12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126` |
| `STRING_ESCAPED` | `"A\"\n\\\u0000"` | `"A\"\n\\\u0000"` | `9ee57c65117d4ea2b8de0bd0bdf53ad899b6a37051808e2a347827dd5eda7d5e` |
| `STRING_NON_ASCII` | `"对象😀"` | `"对象😀"` | `2784cacf62438fba2bd69fc91f4b4be35e31df9f0d61470f4004ff495ff9d1d5` |
| `ARRAY` | `[null,false,0,"x"]` | `[null,false,0,"x"]` | `77064140c2ffc30dd4f0eec3183ffbc4931a521355540ff2ae7e13c13cbb6ace` |
| `OBJECT_KEY_ORDER` | `{"\uE000":2,"\uD83D\uDE00":1,"a":0}` | `{"a":0,"😀":1,"":2}` | `356bb09cec7ab06ff968a7e17eb81536156726241da02a0b315c0293b5f1a97a` |
| `NESTED_OBJECT` | `{"z":{"b":2,"a":1},"a":[3,{"d":4,"c":5}]}` | `{"a":[3,{"c":5,"d":4}],"z":{"a":1,"b":2}}` | `3eb62673a009296eaa1a2a988d9d718821527c6de09be527dd72f2c237edd98c` |

`OBJECT_KEY_ORDER`的第二、第三个decoded key分别是`U+1F600`和`U+E000`，专门区分UTF-16 code unit order与错误的code point order；其`canonical_utf8` bytes额外固定为hex `7b2261223a302c22f09f9880223a312c22ee8080223a327d`。02B Node test与03C Java test必须读取同一raw文件，复算canonical JSON text和SHA并与表中expected逐项相等；Java继续复用`org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer`，允许在03C实现包内修正该现有类以满足冻结值域，但禁止新增第二个Java canonicalizer。非法值不写入JSON向量：Node反例至少覆盖浮点、非有限数、正负越界整数、`undefined`、函数、symbol、bigint、lone surrogate和循环引用；Java反例至少覆盖decimal、正负越界整数、lone surrogate和循环引用。

## 9. Base 与 Attempt 隔离

工作根固定增加：

```text
<change-root>/common-materialization/
  <subject-id>/base/storage/projects/<project-id>/project.db
  <subject-id>/base/attestation.json
  <subject-id>/attempts/<capture-id>/<1|2>/storage/...
```

1. subject 顺序固定为 Catalog 顺序；每个 base 只创建一次，attestation 通过后只读；
2. capture 顺序固定为 Plan 顺序，每个 capture attempt `1` 后 `2`；
3. clone 前后校验 base tree digest，clone 必须从 fresh empty root创建；
4. Runtime、Web session、browser context、view state 和 fault hook 不跨 attempt 复用；
5. attempt 完成后关闭 Runtime/连接再清理 clone；base 不进入 candidate/approved 内容，author 结束后可清理；
6. candidate Report 通过 Plan ref、runner identity、每 attempt `projection_sha256/cell_geometry_sha256/png_sha256` 绑定结果；Common base 不混入固定 `130` 项 Family report/database 数组；
7. 任一 base 或 clone失败阻断整个 03B，不允许跳过 Common capture或降级为静态 component screenshot。

`attestation.json` 是 03C 内部受控 artifact，不是 release Gate Schema，字段固定为：

```text
contract_version,subject_id,fixture_ref,project_id,model_id,revision_id,
database_ref,semantic_state_sha256,committed_projection_sha256,index_counts,
materializer_identity,source_date_epoch
```

03B 使用后可清理，但定向集成测试必须验证其 Schema-like封闭结构、ref/SHA 和只读行为。

## 10. Color Profile Canonicalization

### 10.1 唯一映射

```text
mapping_version = "0.1.0"
plan_raw_value = "srgb"
required_launch_arg = "--force-color-profile=srgb"
canonical_value = "sRGB IEC61966-2.1"
```

函数固定为：

```text
canonicalize(plan_value, launch_args):
  require plan_value byte-for-byte == "srgb"
  require launch_args contains exactly one "--force-color-profile=srgb"
  require launch_args contains no other "--force-color-profile=" prefix
  return "sRGB IEC61966-2.1"
```

禁止 trim、case folding、Unicode normalization、`sRGB`/`SRGB`/ICC path 等别名，禁止读取 OS 默认 profile 后宽松接受。

### 10.2 比较与 fingerprint

03B semantic join 固定为：

```text
plan_canonical = canonicalize(plan.environment_policy.color_profile,
                              plan.environment_policy.launch_args)
require actual_browser_launch_args == plan.environment_policy.launch_args
require golden_environment.color_profile == plan_canonical
require golden_environment.launch_args == actual_browser_launch_args
```

Golden Environment `0.2` fingerprint payload中的 `color_profile` 只写 canonical 值 `sRGB IEC61966-2.1`；Plan raw `srgb` 不直接进入 Environment fingerprint，但 Plan raw ref、Environment raw ref 和 candidate Report 同时闭合。PNG/blank capture 前必须再次验证 browser process launch args；Chromium 未按 exact arg 启动即 `GOLDEN_COLOR_PROFILE_MISMATCH/3`。

## 11. CLI 与调用顺序

### 11.1 02B Contract/Planner

```text
npm run release:canvas06:common-visual:build -- \
  --handoff <ready-handoff> \
  --fixture-root <new-output-root> \
  --source-date-epoch <integer>

npm run release:canvas06:common-visual:verify -- \
  --handoff <ready-handoff> \
  --fixture-root <readonly-root> \
  --catalog <catalog-relative-path>
```

Builder与Verifier均禁止`--source-root`、source path override或环境变量source入口。Builder只允许fresh output root；verifier只读且验证前后tree digest不变。成功root必须恰有`43`个普通非链接文件，唯一布局为：

```text
<fixture-root>/
  dev-canvas-06-common-fixture-catalog.json
  visual/<8个subject-id>.json
  e2e/<16个case-id>.base.json
  e2e/<16个case-id>.input.json
  sources/scripts/build-canvas06-common-visual-fixtures.mjs
  sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

计数公式固定为：

```text
43 = 1 Catalog + 8 Visual + 32 E2E + 2 source mirror
```

32个E2E资产是Catalog `e2e_cases[16]`的活动raw ref目标，不是外部只读依赖。Builder必须从静态import的同一factory读取固定`e2eCases[16]`顺序，并对每个`case_id`调用`e2eFixture(caseId)`；base唯一写为`{...e2eFixture(caseId),fixture_kind:"BASE"}`，input唯一写为`{...e2eFixture(caseId),fixture_kind:"INPUT"}`。禁止复制`tests/e2e/**/fixtures/e2e`历史bytes、目录扫描、外部E2E root或source override。JSON编码与Visual fixture相同，固定UTF-8、LF、2空格和末尾单LF。

两份source mirror是输出根必需证据，不是可选调试文件。唯一source owner和信任规则为：

1. generator source必须由`fileURLToPath(import.meta.url)`取得，basename和仓库逻辑路径必须精确为`scripts/build-canvas06-common-visual-fixtures.mjs`；
2. factory source必须是generator静态ESM import实际解析到的`tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs`；禁止动态import、CLI/cwd/env替换；
3. 两个实际source都必须通过`lstat -> realpath -> lstat`，是普通非symlink单链接文件，且logical basename/path与allowlist相等；
4. Builder在同一fresh staging内生成8个Visual fixture、32个E2E asset并逐byte复制两份source到上述mirror path；file fsync后回读，要求`source bytes == mirror bytes`，再从staging内实际bytes计算Catalog fileRef；
5. 活动Catalog固定`catalog_version="0.2.0"`；`generator_ref={kind:"GENERATOR_SOURCE",path:"sources/scripts/build-canvas06-common-visual-fixtures.mjs",byte_length,sha256}`；8项Visual与16项E2E共24项`factory_source_ref`必须逐字段相同并固定指向第二个mirror，`kind="FACTORY_SOURCE"`；16项`base_fixture_ref/input_ref`分别固定指向`e2e/<case-id>.base.json`和`e2e/<case-id>.input.json`；
6. Verifier只信readonly output root内Catalog、8个Visual、32个E2E和两份mirror，验证安全相对路径、root containment、普通非链接单链接文件、raw length/SHA、两项source allowlist、16个case顺序、32个factory重算结果、24项factory ref相等、exact 43文件inventory和root前后tree digest；不读取外部checkout、Git或历史E2E目录；
7. root中缺任一E2E/source、存在额外文件或Git metadata、absolute/`..`/symlink/hardlink、source checkout path、source/mirror bytes不等、factory输出漂移或Catalog ref不闭合均拒绝。执行source owner/path/type、case集合或factory输出不合法映射`GOLDEN_COMMON_INPUT_INVALID/2`；copy/mirror/Catalog raw ref、E2E内容或43文件inventory不闭合映射`GOLDEN_COMMON_FIXTURE_REF_MISMATCH/2`。

Builder唯一调用顺序固定为：

```text
CLI/source owner
-> 生成8 Visual
-> 生成32 E2E
-> 镜像2份source
-> 生成Catalog 0.2.0
-> Schema与全量semantic verify
-> 复算43文件tree digest
-> fsync
-> atomic rename
```

Handoff `source_build.source_commit`只绑定上游DEV-CANVAS-05 clean build，不得重解释为后续02B generator/factory commit。mirror仅证明本次实际执行generator和实际调用factory的exact bytes；不证明Runtime JAR、clean product build、production release或ISO符合性。历史Catalog`0.1.0`保持原bytes；02B必须生成fresh活动Catalog`0.2.0`，完成后使用既有planner CLI和新change ID生成新Plan；不得覆盖旧Catalog/fixture/Plan。

### 11.2 03C Materializer

```text
java -jar <exact-runtime.jar> \
  --spring.profiles.active=release-golden-authoring \
  --opm.release.golden-authoring=true \
  --opm.release.visual-common-materializer=true \
  --spring.main.web-application-type=none \
  --opm.release.visual-common.fixture=<exact-fixture> \
  --opm.release.visual-common.storage-root=<new-empty-root> \
  --opm.release.visual-common.attestation-out=<fresh-path> \
  --opm.release.source-date-epoch=<same-integer>
```

03B author CLI不增加 fixture选择参数；它只能从 Plan -> Catalog -> fixture exact refs派生 8 个输入，按本设计调用 03C。禁止传 subject override、expected projection override、skip setup、force、reuse storage 或 update golden 参数。

唯一调用顺序：

```text
verify Plan/Catalog/fixture/color mapping
-> build 8 immutable bases
-> verify 8 attestations
-> for each Common capture and attempt clone/start/setup/normalize/capture/close
-> verify all 144 results and base digests
-> continue existing candidate Environment/Report transaction
```

## 12. 失败优先级与退出码

首错优先级固定为：CLI/path/source owner -> Schema/source mirror/raw ref -> fixture payload -> Handoff/binding -> Runtime JAR -> color mapping -> target empty -> migration -> seed -> storage verify -> clone -> Runtime/Web ready -> UI setup -> Projection/focus/cell -> stability -> capture/determinism -> writer/internal。

| Code | Exit | 边界 |
| --- | --- | --- |
| `GOLDEN_COMMON_INPUT_INVALID` | `2` | CLI、path、source owner/type或forbidden parameter |
| `GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID` | `2` | 不是 exact Common Visual Fixture `0.1` |
| `GOLDEN_COMMON_FIXTURE_REF_MISMATCH` | `2` | source mirror/raw ref/payload SHA/E2E asset/43文件inventory/Catalog join 不闭合 |
| `GOLDEN_COMMON_MODE_REJECTED` | `2` | release-only/non-web 守卫失败 |
| `GOLDEN_COMMON_BINDING_MISMATCH` | `3` | fixture/Handoff/Runtime binding 不同 |
| `GOLDEN_COLOR_PROFILE_MISMATCH` | `3` | alias/launch/canonical/fingerprint join 失败 |
| `GOLDEN_COMMON_STORAGE_NOT_EMPTY` | `3` | base/attempt 目标非空 |
| `GOLDEN_COMMON_MIGRATION_FAILED` | `3` | SQLite V1 migration 失败 |
| `GOLDEN_COMMON_SEED_FAILED` | `3` | transaction 写入/回滚失败 |
| `GOLDEN_COMMON_STORAGE_VERIFY_FAILED` | `3` | identity/count/reopen/integrity/sidecar 不闭合 |
| `GOLDEN_COMMON_CLONE_FAILED` | `3` | clone 或 base digest 变化 |
| `GOLDEN_COMMON_UI_SETUP_FAILED` | `3` | 受控步骤、option、finding、feedback/fault 失败 |
| `GOLDEN_COMMON_PROJECTION_MISMATCH` | `3` | payload/digest/focus/cell/geometry 不同 |
| `GOLDEN_COMMON_INTERNAL_ERROR` | `4` | 未分类 I/O、serializer、digest 或进程异常 |

任何失败都不得产生 READY Authoring Report、Golden Environment、Approval、approved root 或 Visual Manifest。SQLite transaction失败必须 rollback；base 创建失败只清理本次 fresh root。已存在路径、非空路径和他人资产不得删除。

## 13. 性能阈值

在 Golden Authoring 固定环境中：

1. 单 subject base materialization P95 `<=5 s`；8 项串行总计 `<=30 s`；
2. 单 clone 创建加 raw ref复核 P95 `<=1 s`；
3. UI setup包含在既有单 capture attempt `<=5 s` P95 中，仍受 `30 s`稳定等待硬超时；
4. 8 base加当前 active clone的额外 peak RSS `<=512 MiB`；
5. 03B全量总阈值仍为`<=180 min/peak RSS <=4 GiB`，不得因 Common materialization放宽。

性能是产品 release 阈值，不是 ISO 19450:2024 要求。

## 14. 实现分包与 Gate

### 14.1 `GOLDEN-AUTHORING-02B`

实现 Common Visual Fixture Schema consumer/contract test、8个完整Visual fixture、由同一factory确定性生成的32个E2E asset、两份source mirror、新Catalog、43文件只读verifier、Planner Common semantic join、color canonicalization纯函数和旧输入反例。完成后只证明新Plan与E2E Manifest的Common输入可生成，不产生SQLite、Manifest、Report或PNG。

### 14.2 `GOLDEN-AUTHORING-03C`

实现 release-only Java materializer、SQLite/index seed、attestation、8 base/clone verifier、one-shot fault hook和03B Common调用适配。完成后受控集成可通过，但不等于 production candidate。

### 14.3 `GOLDEN-AUTHORING-03B`

02B与03C implementation checklist全部通过后，03B才从`BLOCKED_BY_DEPENDENCY`恢复为可实现/继续状态。03B必须使用新 Plan；旧 Plan即使Schema-valid也必须被semantic preflight拒绝。

设计 Gate 关闭条件：本文、02B/03C规格/checklist、Golden Authoring/03B/GATE-06-03/测试/冻结基线指针一致。实现 Gate、production authoring和release Gate分别由各自报告判定，不由本文提升。

## 15. 验收矩阵

| 验收面 | 正例 | 必须拒绝 |
| --- | --- | --- |
| Fixture | 8个Schema-valid完整fixture，binding/payload/ref闭合 | 旧元数据fixture、缺Revision/UI setup/Projection、额外字段 |
| Source与E2E asset | generator/factory实际source逐byte镜像，32个E2E asset由同一factory生成，Catalog全部ref只指self-contained 43文件root | `--source-root`、外部E2E root、历史bytes复制、cwd/env/dynamic source、缺失/额外/链接/mirror漂移 |
| SQLite | 8个fresh base按V1原子写入并重开 | 公共API seed、共享写库、非空目标、DDL变化、索引漂移 |
| Isolation | 72 capture x 2 fresh clone，base digest不变 | 共享Runtime/clone、跨attempt状态、写base |
| UI setup | 真实Web/UI/API达到8个封闭终态 | DOM/Pinia/X6写注入、network mock、sleep替代状态 |
| Fault | exact command的一次性process-local hook | 通配hook、HTTP开关、默认生产装配、多次触发 |
| Projection | observed payload与fixture深度相等且digest相等 | 旧subject/focus占位hash、只比digest、candidate进入Revision |
| Color | exact `srgb`/launch arg映射到canonical Environment | trim/case/别名/OS默认profile宽松接受 |
| Transaction | 失败零READY输出、rollback/clean fresh root | 部分Report/Environment、覆盖旧Plan/candidate/approved |

## 16. 回滚与兼容

1. Common Catalog机器Schema保持`0.1`字段形状并只接受历史`0.1.0`/活动`0.2.0`；Capture Plan、Golden Environment Schema版本不变；新Common Fixture Schema是新增机器契约；
2. 旧fixture/Catalog`0.1.0`/Plan bytes保持不可变，但只作为历史输入；新02B/03B只接受Catalog`0.2.0`，不提供兼容降级；
3. 回滚02B/03C删除新Schema/factory/materializer/test/命令和新生成的未发布root，不删除历史或approved资产；
4. 任一已发布新approved version若后续 verifier失败，不原地修复，只能以新change和SUPERSEDE处理；
5. SQLite V1无migration变化，不需要数据回滚。

## 17. 事实与非结论

事实：当前8个历史fixture没有`schema_id/revision_document/index_seed/capture_setup/expected_projection`；源目录存在16组历史E2E base/input，但它们不在活动02B输出根且不能作为活动ref目标；Common Visual Fixture `0.1`机器Schema已新增并冻结，但producer/verifier、完整Visual fixture、32个活动E2E asset和43文件root尚不存在；当前Plan的Common projection hash是历史占位算法；当前Environment Schema固定canonical值但跨Plan映射尚未实现；共享Node JCS模块和vector已存在，03C Java consumer test尚未实现；source mirror尚未生成。

本文不构成02B/03C/03B实现、8个base、144个attempt、新Plan、PNG、candidate、Approval、approved version、Visual Manifest/Report、GATE READY、Capability enablement、生产发布或ISO符合性证明。
