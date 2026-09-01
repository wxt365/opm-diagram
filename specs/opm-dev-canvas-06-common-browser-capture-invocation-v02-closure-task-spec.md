# Spec: Common Browser Capture Invocation 0.2 闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题

Capture Invocation `0.1` 只携带 `runtime_base_url`、revision 和 storage root，没有 project/model/context identity。Common browser callback 因而无法构造 P03 路由；使用目录名、环境变量、SQLite 路径反推或 checkout 读取均违反受控输入边界。

## 2. 冻结修正

新增 `docs/contracts/schemas/opm-dev-canvas-06-common-visual-capture-invocation-v02.schema.json`，身份保持 `schema_id=OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-INVOCATION-001`，版本为 `schema_version=0.2`、`invocation_version=0.2.0`。

新增必填、非空字段：

```text
project_id = fixture.project.project_id
model_id = fixture.model.model_id
context_id = fixture.revision_document.model_header.root_context_id
```

Adapter 在 fixture/Plan/Catalog semantic join 完成后唯一写入这三个值，并验证：`expected_revision == fixture.revision_document.revision_id`。callback 只消费这三个字段构造 P03 route；不得从任何路径、数据库、环境、页面文字或其他辅助输入派生身份。

`0.1` Schema、历史 bundle 和历史 contract CLI 保持只读。`runCommonVisualMaterialization` 的活动生产 invocation 切换为 `0.2`；Observed Result `0.1` 不变，其既有 identity 字段继续与 `0.2` invocation 对应。

## 3. 修改边界与验收

允许修改：新 v02 Schema、Common materializer、其 tests、Common browser capture spec/checklist 和 contract validation 入口。禁止改 `0.1` Schema、Observed Result、DDL、API 和生产发布资产。

验收：

- v02 正反 Schema 都通过；0.1 输入在 production materializer 的零副作用 preflight 被拒绝；
- invocation 三身份逐字段等于 fixture；
- callback route 只读取 v02 的显式身份；
- `npm run contract:validate` 与 Common adapter 定向测试通过。
