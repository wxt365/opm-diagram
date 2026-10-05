# Spec: OPM P03 Feature Owner 关系符号修正

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 目标

1. Object 与其全部 owned Attribute 在画布上聚合为一个表征 fan：一个双层三角，尖端连接 Object，各 Attribute 使用独立正交 member 分支。
2. Process 与其全部 owned Operation 在画布上聚合为一个组合 fan：一个实心三角，尖端连接 Process，各 Operation 使用独立正交 member 分支。
3. 保留现有 Feature 创建、名称编辑、默认收起和 `+/-` 展开收起行为。

## 2. 非目标

- 不改变 `FeatureDefinition`、`owner_element_id`、`CREATE_FEATURE` 或已提交 Revision。
- 不新增 Structural Fact，不修改 `CAP-ISO-STRUCT-005/006` 的 Profile、Rule、Grammar 或 OPL。
- 不修改 API、schema、后端、数据库、依赖、全局样式或工具栏创建权限。
- 不处理 Object-Operation、Process-Attribute 等既有非目标 owner 组合的语义迁移。

## 3. 允许与禁止范围

允许修改：

- `specs/opm-p03-feature-owner-relation-symbol-bugfix-task-spec.md`
- `specs/opm-p03-feature-owner-relation-symbol-bugfix-checklist.md`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-attribute-owner.spec.ts`

禁止修改上述清单外文件，尤其是公共 API、schema、Profile/Golden/Release 资产、后端、数据库、依赖和配置。

## 4. 契约影响

本任务只改变 owner 投影的装饰 Cell，不改变 wire 或领域契约。装饰 Cell 不带 occurrence capture anchor、不可选择、不可删除、不可编辑，也不提交命令。

Object-Attribute 使用与 `CAP-ISO-STRUCT-006` 一致的双层三角视觉；Process-Operation 使用与 `CAP-ISO-STRUCT-005` 一致的实心三角视觉。每个 owner、每种匹配关系只生成一个 fan，包含一条 owner-root 边、一个 junction marker 和按 Feature 稳定 ID 区分的 member 边。

fan 按 owner 到全部 member 平均中心的主方向选择水平或垂直主轴。水平主轴时 junction 与 owner 中心同高，root 为水平线，各 member 先沿共享纵向主干到目标中心高度，再水平连接目标；垂直主轴时规则旋转 90 度。不得再生成 owner 到 junction 或 junction 到 member 的斜线。三角尖端始终朝向 owner。既有非目标 owner 组合继续显示中性虚线，避免历史数据在画布上失联。

新建 Feature 与 owner 的默认横向间距为 56px，为 24px marker 和两侧连线保留稳定空间；同一 owner 下按 96px 纵向节奏排列，避免进入同排 Element 的占位区。不迁移既有 Layout。

## 5. 复现与根因

复现条件：展开拥有三个 Attribute 的 Object 或拥有两个 Operation 的 Process。当前实现按 Feature 逐个调用关系渲染，每个 Feature 都生成自己的 marker 和 root，导致三个属性出现三条表征关系、两个操作出现两条组合关系。

根因：Feature owner 投影虽然已能选择表征/组合符号，但渲染入口仍以单个 Feature 为单位，没有先按 owner 与关系类型聚合；原测试只覆盖每组一个 Feature，未覆盖 fan 多成员基数。

## 6. 验收项

- `OWNER-SYMBOL-01`：一个 Object 的三个 Attribute 只显示一个双层三角和一条 root，三个 Attribute 各有一条 member 分支。
- `OWNER-SYMBOL-02`：一个 Process 的两个 Operation 只显示一个实心三角和一条 root，两个 Operation 各有一条 member 分支。
- `OWNER-SYMBOL-03`：两类 fan 使用共享主干的正交折线，默认右侧布局为水平 root、垂直主干和水平 member 分支，不出现斜线。
- `OWNER-SYMBOL-04`：默认收起、展开、再次收起以及新增 Feature 自动收起行为保持不变。
- `OWNER-SYMBOL-05`：新建 Feature 的默认布局不与关系 marker 重叠。
- `OWNER-SYMBOL-06`：两类关系边和 marker 均为非语义装饰 Cell，无 capture anchor 且不响应指针；定向测试、完整前端测试、lint、typecheck 和 build 通过。

## 7. 验证

先运行 `OpdCanvas.spec.ts` 定向测试，再运行前端完整 Vitest、ESLint、Vue typecheck 和生产构建。浏览器验证对象属性与过程操作展开后的 marker 方向、节点遮挡和折叠恢复。

## 8. 回滚

回退本规格允许文件即可恢复原无方向虚线；没有数据或契约迁移需要回滚。
