# Spec: P03 特征关系反向手势端点归一化修复

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `none (primary)`

## 1. 问题、复现与根因

在当前草稿 Revision 中创建 Object、Attribute 及 Attribute Value State，选择：

- `CAP-ISO-STRUCT-006` 后从 Attribute 拖向 Object；
- `CAP-ISO-STRUCT-009` 后从 Attribute Value State 拖向 Object。

Runtime 均返回零候选，前端无法进入关系预览。正向 `Object -> Attribute/Value State` 可以创建。

根因是 `LocalApiService.normalizeStructuralEndpoints()` 对 `EXHIBITION_FAN` 和 `STATE_CHARACTERIZATION` 按用户选择位置判定规范角色；这违反活动设计中“拖动顺序只表达用户意图，最终角色、序号和方向由 Runtime 归一化”的契约。既有测试只覆盖规范方向，因此没有发现反向手势失败。

## 2. 目标与非目标

目标：

1. `CAP-ISO-STRUCT-006` 接受一个 Element 与一个或多个 Feature 的任意选择顺序，并规范化为 `EXHIBITOR_THING` 在前、`FEATURE_THING` 在后；
2. `CAP-ISO-STRUCT-009` 接受 Thing/owned State 与 Feature Value State 的任意选择顺序，并规范化为 `EXHIBITOR_THING_OR_STATE` 在前、`VALUE_STATE` 在后；
3. 正反向手势生成相同的持久化端点、关系方向、符号、OPL 和 Trace；
4. 非法端点组合继续返回零候选、零 Revision。

非目标：不改变其他 8 类 Structural、16 类 Procedural 或 8 类 Control 的端点语义；不增加自由连线；不修改公共 API、Schema、SQLite、Profile、Grammar、Symbol 或依赖。

## 3. 修改边界

允许修改：

- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `tests/e2e/workbench-layout.spec.ts`
- 本规格及对应 checklist

禁止修改：上述清单外全部文件，尤其公共 API、生成契约、数据库、Profile package、前端关系状态机、RenderSpec、发布资产和 `runtime-data/`。

## 4. 实现契约

1. Exhibition 必须精确包含一个 `ELEMENT`，其余端点全部为 `FEATURE`；Feature 顺序保持用户选择中的相对顺序。
2. State-specified Characterization 必须精确包含一个 Feature Value State，以及一个 `ELEMENT` 或非 Feature Value State 的 owned `STATE`；普通 `FEATURE` 不能充当 exhibitor。
3. Runtime 只重排候选的 `normalized_endpoints`，不得改写用户选择、Projection 或 committed Fact。
4. 规范端点角色和 ordinal 固定为：
   - Exhibition：`EXHIBITOR_THING/0`，随后 `FEATURE_THING/1..n`；
   - State-specified Characterization：`EXHIBITOR_THING_OR_STATE/0`、`VALUE_STATE/1`。
5. 候选确认后沿用现有 `CREATE_FACT` 原子提交；取消、零候选或非法组合保持零提交。

## 5. 验收与验证

- `REV-FEATURE-REL-01`：单元测试证明反向 Exhibition 返回候选并规范化为 Element -> Feature。
- `REV-FEATURE-REL-02`：单元测试证明反向 State-specified Characterization 返回候选并规范化为 Thing/State -> Feature Value State。
- `REV-FEATURE-REL-03`：非法 Exhibition 和 Characterization 组合仍不返回对应 Capability。
- `REV-FEATURE-REL-04`：浏览器从 Attribute/Value State 反向拖到 Object，可以预览、确认、生成两次 Revision，并在重开后保留两条关系。
- `REV-FEATURE-REL-05`：受影响 Runtime 测试、P03 Playwright、前端回归及 `git diff --check` 通过。

验证顺序：先运行新增 Runtime 用例确认旧实现失败；修复后重跑定向 Runtime 测试，再运行 P03 浏览器用例和前端测试。回滚仅回退本规格允许文件；回滚后反向手势恢复为零候选。
