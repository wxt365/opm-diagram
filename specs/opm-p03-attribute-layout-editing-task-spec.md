# Spec: OPM P03 Attribute 布局编辑

> 后继修正：[状态布局与展示—特征修正](opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md) 扩展 Operation/State 移动及 owner 联动，替代本文旧三类白名单和对应拒绝验收；保存策略以活动混合保存设计为准。

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

三个 playbook 不可拆分：本任务改变同一个 `UPDATE_LAYOUT` 公共契约在 OpenAPI、Spring Runtime、Vue 画布和 E2E 的允许目标集合。

## 1. 目标

在保持 `UPDATE_LAYOUT` wire shape 不变的前提下，允许用户移动当前根 Context 内 owned Attribute occurrence，并将新坐标提交为不可变 Revision；刷新或重开后位置必须保持。

## 2. 非目标

- 不开放 Operation、State、Feature State、Fact、Referenced occurrence 或其他 Context occurrence 的普通拖放。
- 不修改 Attribute 的 Feature identity、owner Element、Feature kind、名称、State、关系或 OPL/Trace。
- 不允许通过 payload 传入 target、owner、Context、尺寸、z-order、route 或其他扩展字段。
- 不修改 SQLite schema、Profile/Rule/Grammar/Symbol 资产、依赖、路由、发布资产或生产 Capability 状态。
- 不重构现有集中式节点 renderer；后继 Node Definition 迁移继续遵守已冻结架构。

## 3. 允许与禁止范围

允许修改：

- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs`
- `apps/web/src/shared/api/generated/apiEdtContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-opd-node-renderer-architecture.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/README.md`
- 本规格与对应 checklist

禁止修改上述清单外的文件，尤其 `runtime-data/`、数据库 migration、Profile package、Golden、Manifest、Report、Candidate 和 Activation。

## 4. 冻结契约

### 4.1 Wire 与机器标注

payload 继续固定为：

```json
{
  "occurrence_id": "occurrence.example.attribute",
  "layout": { "x": 240, "y": 180 }
}
```

`UpdateLayoutPayload` 保持 `additionalProperties=false`，只允许 `occurrence_id` 和必填有限数值 `x/y`。OpenAPI 在该 payload schema 上固定扩展 `x-opm-owned-construct-roles=[OBJECT_NODE,PROCESS_NODE,ATTRIBUTE_NODE]`；生成器必须复核该精确顺序和值，生成产物 digest 随机器契约更新。

### 4.2 Runtime 授权与提交

Runtime 是唯一授权边界。目标 occurrence 必须同时满足：

1. ID 在当前 Revision 中唯一存在；
2. `context_id` 等于当前模型根 Context；
3. `ownership=OWNED`；
4. 属于以下封闭联合之一：
   - `target_kind=ELEMENT`、`construct_role=OBJECT_NODE|PROCESS_NODE`，且目标 Element 的 `core_kind` 对应；
   - `target_kind=FEATURE`、`construct_role=ATTRIBUTE_NODE`，且目标 Feature 存在并满足 `feature_kind=ATTRIBUTE`。

Runtime 只替换 occurrence 引用 Layout 的 `x/y`，保留 layout ID、width、height 和 z-order。Attribute 的 ID、owner、kind、名称、State、Fact、OPL 和 Trace 必须不变。前端节点白名单不得替代上述复核。

不存在或不满足封闭联合返回现有 `DOMAIN_REJECTED/422` 且零 Revision；payload 字段、非数值或非有限数值返回现有 `INVALID_ARGUMENT/400`。旧 revision、只读 revision、重复 `command_id` 和事务失败继续复用既有 base revision、幂等及原子提交语义，本任务不改变其 wire code。

### 4.3 前端交互

X6 `nodeMovable` 与 `node:moved` 上送白名单固定为 `object|process|attribute`。Operation、State 和装饰节点必须不可移动，也不得发送 `move` 事件。Attribute 拖动结束只发送一次其 exact `occurrenceId` 和 X6 最终坐标；提交成功后从 committed Revision 重读，提交失败不得把本地位置冒充已保存状态。

## 5. 验收项

- `ATTR-LAYOUT-01`：OpenAPI 与生成器冻结三种 owned construct role，wire shape 无变化。
- `ATTR-LAYOUT-02`：Runtime 接受 owned `FEATURE/ATTRIBUTE_NODE` 且目标 Feature 为 Attribute。
- `ATTR-LAYOUT-03`：Operation、State、Fact、不存在、非 owned、跨 Context 和 role/kind 不匹配均被拒绝且 head 不变。
- `ATTR-LAYOUT-04`：布局提交只改变 Attribute occurrence 的 `x/y`，保留 layout 其余字段与全部语义字段，OPL/Trace 不变。
- `ATTR-LAYOUT-05`：前端只允许 Object、Process、Attribute 移动并上送 exact occurrence ID。
- `ATTR-LAYOUT-06`：真实浏览器创建 Attribute、拖动、产生新 Revision，并在 reload 后保持坐标。
- `ATTR-LAYOUT-07`：契约、Service、MVC、Vue 组件、类型检查和构建验证通过。
- `ATTR-LAYOUT-08`：设计、索引、链接和 `git diff --check` 闭合，未提升 release 或 ISO 证据状态。

## 6. 验证

先运行 OpenAPI 生成/校验、后端 Service/MVC 定向测试和 `OpdCanvas` 组件测试，再运行前端 typecheck/build 与 `workbench-layout` 定向 Playwright。最后检查 Markdown 相对链接、尾随空白和 `git diff --check`。无法启动真实 Runtime 或浏览器时，E2E 必须记录为未执行或失败，不能由单测替代。

## 7. 回滚

回退本规格允许文件即可恢复旧白名单。已经提交的布局 Revision 不改写、不删除；可通过既有 Revision 历史恢复视图。
