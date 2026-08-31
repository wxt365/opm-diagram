# DEV-CANVAS-06 Family SETUP CommandMeta Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`
- `backend-springboot`

## 1. 问题与 Root Cause

Family RUN_SETUP设计曾把CREATE_FACT提交后的Revision写为`response.meta.revision`，但活动OpenAPI `CommandMeta`、TypeScript `CommandMeta`和Runtime正式响应字段均为`meta.committed_revision`，且Schema禁止未声明字段。旧口径会使合法response无法完成SetupBoundAttemptIdentity。

## 2. 唯一修正

所有RUN_SETUP身份绑定统一读取：

```text
subject_baseline_revision = response.meta.committed_revision
```

该值必须为非空稳定ID，并继续逐字段等于API Exchange entry `revision`、post-SETUP `API-CTX-002`请求Revision及响应read Revision、最终subject request `base_revision`。禁止兼容读取`meta.revision`、从`affected_ids`、Head、DOM、SQLite或目录推断Revision。

## 3. 修改与验收边界

本修正不修改OpenAPI、Java、TypeScript wire、Schema版本、Stage R `25=23 M+2 A`、累计`45=33 M+12 A`或Source Set `9+15=24`。后继Runner test至少覆盖`committed_revision`正例，以及缺失、null、旧`revision`别名、exchange/post snapshot/subject base漂移反例。

本规格不构成真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性证据。
