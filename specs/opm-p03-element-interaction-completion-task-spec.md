# Spec: OPM P03 元素选择与布局编辑

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `none (primary)`

## 1. 目标

修复 P03 画布的元素选择和拖动交互。普通 Object/Process 的位置变更必须通过受控 `UPDATE_LAYOUT` 命令提交为新的 Revision，刷新或重开后位置保持一致。

## 2. 非目标

- 不实现元素名称编辑、State/Feature/Fact 拖动、连线端点重连、自动布局或多选。
- 不修改数据库 schema、Profile/Rule/Grammar/Symbol 资产或引入依赖。
- 不允许前端以本地状态替代已提交布局。

## 3. 范围与边界

允许修改：

- `apps/web/src/modules/workbench/**`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/shared/api/**`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/**`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs` 及其生成产物
- `docs/design/opm-modeling-tool-application-api-contract.md`
- 本规格与对应 checklist

禁止修改：公共路由、数据库迁移、Profile 资产、运行时数据目录 `runtime-data/`、无关的 DEV-CANVAS-06 发布工件。

## 4. 受控契约

`UPDATE_LAYOUT` 不再使用 Legacy 任意 Map。请求 payload 固定为：

```json
{
  "occurrence_id": "occurrence.example.object",
  "layout": { "x": 120, "y": 80 }
}
```

- `occurrence_id` 必须属于 URL Context、为 `OWNED`，并且仅指向 `OBJECT_NODE` 或 `PROCESS_NODE`。
- `layout` 仅允许有限数值 `x/y`；不接收尺寸、target、Context、route、标签或任意扩展字段。
- 成功时只替换该 occurrence 引用 Layout 的 `x/y`，保留 layout ID、宽高和 z-order；不得修改 Element、Fact、OPL 语义或文本 Trace。
- 命令仍经过当前 base revision、binding、幂等和原子 Revision 提交；失败不得产生 Revision。

## 5. 前端行为

- 选择模式下左键单击节点必须选择节点，不得被画布平移截获。
- 仅 Object/Process 可拖动；拖动结束后发送一次 `UPDATE_LAYOUT`，成功后从 committed revision 重读投影。
- committed revision 重读期间保持既有工作台内容；当画布结构未变化时，仅同步节点坐标、选中态与缩放，不得清空后重建整张画布。
- 提交失败时重读前的本地拖动位置不得伪装为已保存位置；反馈遵循既有 command feedback 机制。

## 6. 验收与验证

1. X6 配置允许 Object/Process 移动并保留单击选择；State、Feature、Fact 与装饰节点不可通过该路径移动。
2. `UPDATE_LAYOUT` 接受当前根 Context 的 owned Object/Process occurrence，并在新 Revision 的 projection 中返回新坐标，OPL 保持不变。
3. 错误 occurrence、非自有 occurrence 或非 Object/Process occurrence 被拒绝，head revision 不变。
4. 前端在 `node:moved` 后提交准确 occurrence ID 与位置，重读 committed revision；失败显示既有反馈。
5. 执行 `npm run contract:validate`、前端定向单测、后端定向单测、`npm run typecheck`、`npm run build` 与 `git diff --check`。

## 7. 回滚

回退本任务的契约、生成产物、前后端代码和测试。已提交的布局 Revision 不做数据回滚；可通过 Revision 历史恢复。
