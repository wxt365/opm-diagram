# DEV-CANVAS-06 Runtime Relation Catalog Query 闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

关联实现：`GOLDEN-AUTHORING-03B Common Browser Capture`

## 1. 目标

冻结 P03 `TOOLCHAIN_CATALOG` 唯一的真实 Runtime 只读输入。该输入提供 34 个 ISO relation capability 的工具目录，不替代端点已选择后的 `API-EDT-001 command-capabilities`，也不授权任何语义写入。

## 2. 契约

新增 `API-CAT-001`：

```text
GET /api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/relation-catalog?request_id=&revision=
```

请求必须校验 Project、Model、Context 与 `revision` 的既有关系，并返回既有 `QueryEnvelope`。响应 `data` 为封闭对象：

```text
items[]:
  family: PROCEDURAL | CONTROL | STRUCTURAL
  capability_id: stable ID
  display_name: non-empty string
  symbol_id: stable ID
  enabled: boolean
  reason_codes: string[]
```

`items` 不增加 command、option、endpoint、modifier、layout 或资产 digest 字段。它是工具目录，不能被当作 `CREATE_FACT` 或 `UPDATE_FACT` 的可提交授权。

## 3. 唯一数据源与语义

- `PROCEDURAL` 16 项只来自 `ProceduralLinkCatalog.all()`；`enabled=true`、`reason_codes=[]`。
- `STRUCTURAL` 10 项只来自 `StructuralLinkCatalog.all()`；`enabled=true`、`reason_codes=[]`。
- `CONTROL` 8 项只来自新增的 `ControlLinkCatalog.all()`；`enabled=false`、`reason_codes=["CONTROL_REQUIRES_BASE_FACT"]`。
- `enabled=true` 仅表示该能力在活动 Profile 的 relation catalog 中可见。能否以当前端点创建，仍只能由 `API-EDT-001` 的 exact endpoint normalization 判定。
- `CONTROL` 只能以现有 Procedural Fact 的两个冻结 Modifier 通过 `UPDATE_FACT` 形成；目录禁止把其显示为独立 Fact 创建命令。
- 不得从前端 mock、fixture、环境变量、checkout 或数据库推导目录；不得修改 Profile/Rule/Grammar/Symbol bytes。

## 4. 顺序、错误与 UI 映射

- 顺序固定为 `PROCEDURAL`、`CONTROL`、`STRUCTURAL`，每组按 `capability_id` UTF-8 bytes 升序。期望计数为 `16/8/10`。
- Service 只能组合上述受控 Catalog descriptor；Controller 不承载目录规则。
- 查询不写 SQLite、不创建 Revision、不触发校验，也不读取端点选择。
- P03 每次打开 relation catalog 时读取 `API-CAT-001`；失败时不得回退 mock 或前端硬编码目录，而是显示既有 Runtime 请求失败反馈。
- P03 用 `data-testid="p03-relation-catalog-{family}"` 与 `data-testid="p03-relation-catalog-option-{capability_id}"` 暴露 capture anchor。Control disabled 项须将 `reason_codes` 作为可访问文本显示。

## 5. 修改边界

允许：`ControlLinkCatalog`、`LocalApiService`、`LocalApiController`、OpenAPI、Runtime MVC 测试、Web API client、Workbench store/view、03B 规格与 checklist。

禁止：SQLite DDL、公共写命令 payload、`API-EDT-001/002/003/004` 语义、Profile 资产、mock fallback、Candidate/Approval/Publisher/Manifest。

## 6. 验收与回滚

- `CAT-01`：OpenAPI 与 MVC 验证响应有 34 项、计数 `16/8/10`、固定排序、Control 的唯一 disabled 原因。
- `CAT-02`：P03 通过 Runtime client 展示三组真实目录；Runtime 失败时不读取 mock。
- `CAT-03`：Web 定向测试覆盖目录计数和 Control 禁用可访问文本。

验证：Runtime 定向 MVC 测试、Web 定向测试和 typecheck、`npm run contract:validate`、`git diff --check`。

回滚：撤销本闭包允许范围内的只读 endpoint、P03 查询与测试；不触及任何持久化数据。
