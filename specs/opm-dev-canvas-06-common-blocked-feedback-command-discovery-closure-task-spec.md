# DEV-CANVAS-06 Common BLOCKED_FEEDBACK 命令发现闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

关联实现：`GOLDEN-AUTHORING-03B Common Browser Capture`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 问题与目标

`BLOCKED_FEEDBACK` 已冻结一次性 Runtime fault port 和 exact command ID，但 P03 无法可信地区分普通 Web Runtime 与已由 release-only command-line guard 装配的 Runtime，也没有冻结该命令的业务 payload。把标识加入 `/opm-bootstrap.js` 会破坏已冻结的四字段 wire；由 URL、环境变量或页面状态开启会变成未受控开关。

本包新增只读 `API-REL-003`，仅报告已装配的 one-shot port 所对应的固定命令描述。P03 仅在成功发现该描述时显示并提交命令；普通 Runtime 保持无入口。

## 2. 冻结契约

### 2.1 API-REL-003

```text
GET /api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/release-visual-common-fault-command?request_id=&revision=
```

- 使用既有 `QueryEnvelope` 与 loopback query 边界，不新增 header 或 bootstrap 字段；属于 release-only read query，必须写入 OpenAPI，但不构成普通建模 API capability。
- 唯一数据源是注入的 `VisualCommonCommitFaultPort`。仅当它的运行时实例严格为 `OneShotVisualCommonCommitFaultPort`，且 project/model/context/revision 与下列固定值逐字节相等时才返回 `200`：

```text
project_id = project.visual.blocked-feedback
model_id = model.visual.blocked-feedback
context_id = context.visual.blocked-feedback.sd
revision = revision.visual.blocked-feedback
```

- 其余 port、任一 identity 或 revision 不匹配均返回既有 `NOT_FOUND/404`，不返回部分 descriptor、原因、fallback 或 production capability。
- 返回 `data` 严格为：

```json
{
  "command_id": "command.visual.blocked-feedback.persistence-failed",
  "command_type": "CREATE_FACT",
  "payload": {
    "kind": "CONSUMPTION",
    "fact_id": "fact.visual.blocked-feedback.one-shot",
    "object_id": "element.visual.blocked-feedback.input",
    "process_id": "element.visual.blocked-feedback.process",
    "layout": {"x": 340, "y": 266}
  }
}
```

该 payload 是经既有 `CREATE_FACT` 正常 validation/text/receipt/head recheck 后才抵达 fault port 的唯一候选。首次提交必须由 port 返回 `PERSISTENCE_FAILED`，七项事务增量为零；该 callback capture 不调用第二次提交。port 自有单元测试继续证明第二次同 command 可正常通过，不允许由浏览器路径补写。

### 2.2 Web 与 API client

- `localRuntimeApi.releaseVisualCommonFaultCommand(...)` 必须以显式 project/model/context/revision 查询 API-REL-003；只有 `NOT_FOUND` 可被 store 解释为“不可用”，其他错误保留为 load error。
- `localRuntimeApi.executeReleaseVisualCommonFaultCommand(...)` 只接受 API-REL-003 的 descriptor；它复用现有 command URL、session、active binding 与 `CREATE_FACT` wire，但 `command_id`、`command_type`、payload 必须逐字段透传 descriptor。不得给通用 `executeP0Command` 增加 caller-controlled command ID。
- store 在工作台 load 时查询 descriptor。普通 Runtime 的 `NOT_FOUND` 必须静默置空；进入其他 Context 或 revision 时清空旧 descriptor，禁止跨 context/revision 复用。
- P03 历史面板仅当 descriptor 非空时渲染按钮 `data-testid="p03-release-visual-common-fault-command"`。按钮点击调用唯一 store action；普通 Runtime、非目标 Context/revision 与任意查询异常均不渲染。
- 写入开始前清空 `feedbackCode`；捕获 `LocalRuntimeApiError` 时将 `error.code` 保存为 `feedbackCode`，其余错误保存 `null`。`PERSISTENCE_FAILED` 必须在 `data-testid="p03-command-feedback-code"` 的只读文本中可观察。该字段不改变既有中文反馈文案、revision、head 或 selection。

### 2.3 禁止项

- 不修改 `/opm-bootstrap.js` 的 227-byte 四字段 wire、`window` binding、Vite bootstrap 或 Web build 输入。
- 不新增 HTTP/环境/URL/DOM 开关，不修改公开 command Schema、DDL、Profile bytes 或 one-shot port 的触发条件。
- 不用 mocked response、route interception、`page.evaluate` 写状态或直接 HTTP 调用替代 P03 按钮。

## 3. 实现边界

允许修改：

- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`、`services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java` 及定向 MVC/application 测试；
- `apps/web/src/shared/api/localRuntimeApi.ts`、`apps/web/src/stores/workbenchRuntime.ts`、`apps/web/src/modules/workbench/WorkbenchView.vue` 及定向测试；
- `docs/contracts/openapi/opm-local-api-v1.yaml`；
- 本规格、03B 实现规格与 checklist。

禁止：Runtime Bootstrap、fault configuration/port、SQLite DDL、公共 command payload Schema、Profile assets、Candidate/Approval/Manifest writer。

## 4. 验收与回滚

- `BFC-01`：MVC 覆盖 armed exact `200`、NOOP 与 identity/revision drift 的 `NOT_FOUND/404`，并断言固定 descriptor bytes。
- `BFC-02`：API client 覆盖 URL/revision 和 descriptor 原样透传；通用 P0 command ID 不可覆盖。
- `BFC-03`：P03 组件覆盖普通 Runtime 不显示按钮、armed descriptor 显示按钮、点击后请求 exact command 且 DOM 可观察 `PERSISTENCE_FAILED` code。
- `BFC-04`：Web typecheck、Workbench/OpdCanvas 定向测试、Runtime MVC 测试、OpenAPI contract 校验与 `git diff --check` 通过。

回滚仅撤销 API-REL-003、P03 discovery/action 与定向测试；不得修改 Bootstrap wire 或 one-shot port。

## 5. Spec Mapping

| 规格项 | 目标 | 约束 | 验证 | 回滚 |
| --- | --- | --- | --- | --- |
| 2.1 | release-only descriptor | armed port + exact identity | BFC-01 | 移除 query |
| 2.2 | 正常 P03 command | descriptor 透传，无 ID override | BFC-02/BFC-03 | 移除 action |
| 2.3 | 保持 production 边界 | Bootstrap/wire 不变 | BFC-04 | 撤销本包 |
