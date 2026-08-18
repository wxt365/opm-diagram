# Spec: GOLDEN-AUTHORING-03B Golden Environment 0.2 Schema 与 Verifier 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 Golden Environment `0.2` 的独立 JSON Schema、AJV 正反例、只读离线 semantic verifier 和 npm 入口，完成 `GOLDEN-AUTHORING-03B` 的 Environment 契约前置条件。本包不写 candidate，也不启动浏览器或生成 PNG。

## 2. 设计输入

- `docs/design/opm-dev-canvas-06-golden-authoring-design.md` `v1.3` 第 4.1、6.2、6.3、7、10 章；
- `specs/opm-dev-canvas-06-golden-environment-v02-design-bugfix-task-spec.md`；
- Authoring Report/Approval Record `0.2` Schema 既有 exact ref 边界；
- 既有 Golden Environment `0.1` Schema 仅为历史兼容输入。

实现不得重新决定 `0.2` 字段、fingerprint、角色、路径、状态或退出码。

## 3. 非目标

- 不修改 `opm-dev-canvas-06-golden-environment.schema.json`、`0.1` 测试或历史输入；
- 不实现 03B Common Fixture Factory、clean build、Runtime 启动、browser/font 实测、capture、candidate writer 或 Authoring Report writer；
- 不修改 Approval/Publisher/Visual Manifest、SQLite、公共 API、Vue、Profile/Rule/Grammar/Symbol；
- 不生成 candidate、Approval、approved golden、Visual Manifest/Report、Candidate、Activation 或 Capability 启用。

## 4. 修改边界

允许修改：新增 `docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json`、其 Node verifier/测试、`package.json` 的定向命令、本规格/checklist 和必要状态/索引文档。

禁止修改：现有 `0.1` Schema/测试、`services/**`、`apps/**`、SQLite DDL、公共 API、既有 candidate/approved root、其他 `0.2` Schema 和发布状态。

## 5. 实现契约

1. Schema 固定 `schema_id=OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001`、`schema_version=0.2`、顶层及嵌套对象 `additionalProperties=false`；
2. Schema 必须强制完整的 OS/arch、browser executable evidence、三种 font role、固定 screenshot options、1242 PNG、9 named blank baseline、路径和 raw SHA 的结构约束；
3. `verify-canvas06-golden-environment-v02.mjs --environment <json> --source-date-epoch <non-negative integer>` 是唯一只读 verifier 入口；拒绝未知、重复、缺失和禁止参数；成功不写文件；
4. verifier 必须先做 JSON/Schema/路径结构校验，再复算 `environment_fingerprint`、`environment_id`、UTC `generated_at`、font 排序/角色、launch arg 与 PNG/blank ID/ref 唯一性；
5. Schema、JSON、路径、参数或输入引用错误退出 `2`；结构合法但 identity/fingerprint/epoch/排序/集合不闭合退出 `3`；可信读取或内部错误退出 `4`；stderr 以稳定错误码开头；
6. verifier 只能校验持久化的 Environment bytes。browser realpath 的实际文件 SHA、浏览器启动前再次验证、实际字体解析和与 Capture Plan 的顺序/内容 join 必须由后续 03B author 在运行时完成，不能由本切片虚构为已验证。

## 6. 测试要求

1. AJV 覆盖完整 `0.2` 正例、缺 browser evidence、错误 screenshot options、缺/重复 font role、非 1242/9 集合、路径逃逸和额外字段反例；
2. verifier 覆盖 fingerprint、`environment_id`、epoch、font 排序、PNG/blank 重复、unknown 参数和零写入；
3. 既有 `0.1` 输入 Schema 测试与 Authoring/Approval `0.2` Schema 测试必须继续通过。

## 7. 验收标准

1. `0.2` 与 `0.1` 可并存，且不存在让 `0.1` 成为生产可消费输入的代码路径；
2. Schema 和 verifier 均可独立复算、失败码稳定、无写入副作用；
3. 定向正反例和既有 Schema 回归通过；
4. 03B 的 Environment Schema/verifier 前置条件完成，但 browser capture/candidate/Approval/Visual Manifest 仍保持未实现状态。

## 8. 验证命令

```text
npm run release:canvas06:golden:environment:v02:schema:test
npm run release:canvas06:golden:environment:v02:test
npm run release:canvas06:input-schema:test
npm run release:canvas06:golden:author:schema:test
npm run release:canvas06:golden:approve:schema:test
npm run contract:validate
git diff --check
```

## 9. 兼容与回滚

公共 API、SQLite、产品配置和 `0.1` Schema/资产保持不变。回滚仅删除本包新增 `0.2` Schema/verifier/test/npm 入口，并将 03B 恢复到 Schema/verifier 前置未满足；不得删除任何 candidate、approved 或用户数据。

## 10. 事实与假设

事实：`0.2` Schema、离线 verifier、AJV/semantic 正反例和 npm 命令已实现并通过定向验证；真实 Environment、candidate 和发布证据仍不存在。

假设：无。
