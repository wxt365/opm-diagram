# Spec: OPM P03 Object/Process 名称编辑

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 目标

冻结并实现 P03 画布中 Object/Process 的名称编辑。用户双击节点后通过 HTML `input` 覆盖层编辑名称，成功提交 `UPDATE_PROPERTY` 后以 committed Revision 重读 OPD 与 OPL。

## 2. 非目标

- 不编辑 State、Feature、Fact、Context 的名称或其他属性。
- 不修改 Element 稳定 ID、`core_kind`、Capability、Context 归属、Occurrence 或 Layout。
- 不增加名称唯一性、大小写折叠、首尾空白裁剪或 Unicode 规范化规则。
- 不修改 SQLite schema、Profile/Rule/Grammar/Symbol 资产，不引入依赖。
- 不改变 `UPDATE_LAYOUT` 及现有 DEV-CANVAS-06 发布证据边界。

## 3. 允许与禁止范围

允许修改：

- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs` 及其两个生成产物
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/**`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- 上述前端实现的既有测试
- `apps/web/src/shared/styles/base.css`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
- 本规格与对应 checklist

禁止修改：公共 URL、SQLite migration、依赖、Profile 包、`runtime-data/`、布局编辑规格及无关发布工件。

## 4. 名称规则

活动 Profile 中 Object/Process 的创建与改名使用同一规则：

1. 输入必须是 JSON string；以 Java `String.isBlank()` 等价规则判断后不得为空白。
2. 原字符串原样保存，不自动 `trim`、大小写折叠或 Unicode 规范化。
3. 长度按 Unicode code point 计数，范围为 `1..256`。
4. 同一模型中允许多个 Object/Process 使用相同名称。

`CREATE_ELEMENT` 与 `UPDATE_PROPERTY` 都必须执行该规则。OpenAPI 的 `minLength/maxLength` 是传输契约，Runtime 仍是最终校验 owner。

## 5. `UPDATE_PROPERTY` 机器契约

payload 固定为：

```json
{
  "target_ref": {
    "target_kind": "ELEMENT",
    "target_id": "element.material"
  },
  "property_name": "name",
  "value": "Material",
  "capability_query_id": "capability.query.example",
  "selected_option_id": "option.property.name.example"
}
```

- payload 与 `target_ref` 均 `additionalProperties=false`。
- `target_kind` 只能为 `ELEMENT`，`property_name` 只能为 `name`。
- `target_id` 必须引用 base Revision 中的 Object 或 Process。
- query/option 必须由同一项目、模型、base Revision、selection 和 `UPDATE_PROPERTY` intent 生成；不匹配或过期返回 `DOMAIN_REJECTED/422`。
- 成功时仅以新 `QualifiedName(namespace=原值, local_name=value)` 替换目标 Element；其他字段及所有非目标集合逐字段保持。

## 6. Command Capability Query

当 `intent=UPDATE_PROPERTY` 时：

| 条件 | `allowed` | `forbidden` | `options` |
| --- | --- | --- | --- |
| 当前 draft head，selection 是 Object/Process | 包含 `UPDATE_PROPERTY` | 不含该命令 | 一项 enabled name option |
| selection 缺失、未知或不是 Object/Process | 不包含 | `ENDPOINT_KIND_MISMATCH` | 空 |
| Revision 是已建立 Baseline 的历史 Revision | 不包含 | `READ_ONLY_REVISION` | 一项 disabled name option（仅在 selection 合法时） |
| 其他历史 Revision | 不包含 | `REVISION_STALE` | 一项 disabled name option（仅在 selection 合法时） |

name option 的 `required_fields` 固定为 `target_ref/ENDPOINT`、`property_name/ENUM[name]`、`value/TEXT`；`expires_with_revision` 必须等于查询 Revision。

## 7. 命令返回矩阵

| 场景 | HTTP / code | Revision 结果 |
| --- | --- | --- |
| 合法新名称 | `200`，`COMMITTED` | 产生一条新 Revision |
| 与当前名称逐字相同 | `422 / DOMAIN_REJECTED` | 零写入 |
| 空白名称、超过 256 code points、payload 形状错误 | `400 / INVALID_ARGUMENT` | 零写入 |
| 非 Object/Process target | `422 / DOMAIN_REJECTED` | 零写入 |
| 非 Baseline 的旧 base Revision | `409 / REVISION_CONFLICT` | 零写入 |
| 已建立 Baseline 的旧 base Revision | `409 / READ_ONLY_REVISION` | 零写入 |
| 重复 `command_id` 且完整请求摘要相同 | `200`，返回原 committed Revision | 零新增写入；该判定先于旧 Revision 判定 |
| 重复 `command_id` 但请求摘要不同 | `409 / IDEMPOTENCY_MISMATCH` | 零写入；该判定先于旧 Revision 判定 |

## 8. HTML 输入覆盖层

1. 仅双击 Object/Process 节点打开；先发出 selection，readonly 或 capability 禁止时不打开。
2. 输入初值为当前标签并全选。覆盖层使用 X6 `localToClient` 将节点四角转换为 host 相对坐标；在 zoom、translate/pan、resize、节点移动和投影重绘后重新定位。
3. `Enter` 提交，`Escape` 取消。输入法 composing 期间二者均不触发。
4. 失焦提交与 Enter 共用流程；提交进行中忽略重复失焦，中文IME中失焦延后至最终输入完成。由[后继交互修复](opm-p03-inline-name-commit-and-style-bugfix-task-spec.md)取代旧失焦取消规则。
5. 与原名称相同的 `Enter` 视为本地取消，不发送命令。
6. 提交失败保留覆盖层、用户输入与焦点，并显示既有 command feedback；成功后关闭覆盖层，等待 committed Revision 重读正式标签。
7. 覆盖层打开时不得触发节点拖动；不使用 SVG `foreignObject`、全局变量或 checkout fallback。文字居中、跟随缩放，无内边框/焦点外框/阴影；详见后继交互修复。V2成功以当前草稿token回读，不新增逐编辑Revision。

## 9. 验收项

- `NAME-EDIT-01`：OpenAPI 与生成 DTO 对 `UPDATE_PROPERTY` 使用唯一封闭 payload，不再落入 Legacy Map。
- `NAME-EDIT-02`：创建与改名执行相同的非空、最多 256 code point、非唯一名称规则。
- `NAME-EDIT-03`：Runtime 仅修改目标 Element 名称，并覆盖成功、同名、非法名称、旧/只读 Revision 和幂等语义。
- `NAME-EDIT-04`：Capability Query 对当前、非法 selection、Baseline 和 stale Revision 返回冻结 allowed/reason/option。
- `NAME-EDIT-05`：双击覆盖层正确处理坐标变换、Enter/Escape/blur、composing 和失败保留。
- `NAME-EDIT-06`：成功后从 committed Revision 重读投影与 OPL，不以本地标签伪装提交成功。
- `NAME-EDIT-07`：契约校验、Java 定向测试、Vue 定向测试、typecheck、build 与 `git diff --check` 通过。

## 10. 回滚

回退本规格涉及的契约、生成产物、Runtime、前端和测试。已提交的名称 Revision 不做破坏性删除，可通过既有 Revision 历史读取旧值。
