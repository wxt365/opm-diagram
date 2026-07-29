# Spec: OPM DEV-CANVAS-06 工具链集成与发布验收

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 背景

`DEV-CANVAS-05` 交付可执行的 16/8/10 OPL、Token/Trace、golden 与同版本依赖闭包。本包不再新增语义，而是把已验证 Capability 接入完整工具链，完成浏览器视觉、E2E、性能、恢复和分批启用证据，形成完整画布发布候选。

## 2. 目标与范围

1. 完成固定工具链、State 快捷工具、关系 split-button、搜索分组目录、候选层和完整检查器；
2. 按 Capability evidence gate 分批启用 16/8/10，禁用项显示稳定 reason；
3. 覆盖 committed、blocked、conflict、readonly、asset-missing、persistence-failed 和重开恢复路径；
4. 完成三视口、三缩放比例 visual golden、canvas pixel 非空和遮挡检查；
5. 在固定 release 环境执行普通操作、增量 OPL、大图交互和 10,000 结点模型任务的性能验收；
6. 输出包含版本、digests、数据集、环境、命令、样本、P50/P95/Max、失败率和残余风险的发布证据报告。

## 3. 非目标

- 不新增 Capability、Endpoint Schema、OPL 句式、Rule 语义、Token/Trace 口径或 golden variant；
- 不修改 Template 迁就 UI，也不在本包补写 `DEV-CANVAS-05` 缺失资产；
- 不修改 SQLite schema 或公共 operationId；
- 不以工具菜单完整、E2E 绿色或性能通过替代 ISO 19450:2024 符合性证据。

发现语义/资产缺口时退回 `DEV-CANVAS-05` 或更早依赖包，本包只保持对应 Capability disabled。

## 4. 修改边界

允许修改：

- `apps/web/**` 的 P03 工具链、X6 Projection、状态、样式、组件测试和可访问性；
- `services/local-runtime/**` 的只读 Projection/性能观测、发布守卫和必要测试，不得改变领域语义；
- `tests/e2e/**`、性能 fixture/factory、visual golden、canvas pixel 检查与运行脚本；
- `packages/**` 的 enablement manifest，只允许引用 `DEV-CANVAS-05` 已通过的 exact digests；
- 发布/验收报告、本规格、checklist 和必要设计同步。

禁止修改：

- concrete OPL/Trace/Rule 语义、Capability/Endpoint Schema、SQLite migration；
- P01/P02 无关页面和 `.harness/**`；
- 为通过性能测试而省略 OPM marker、标签、State、fan 分支或 Finding。

## 5. 性能门槛

以下数值是产品发布门槛，不是 ISO 19450:2024 要求。

| 场景 | 数据集 | PASS 阈值 |
| --- | --- | --- |
| 普通编辑反馈 | 工具切换、选择、检查器字段提交反馈 | 用户输入到可见反馈 P95 `<= 100 ms` |
| 增量 OPL | 有效语义变更到受影响 OPL 可见 | P95 `<= 500 ms` |
| 需求基线 OPD | 300 可见结点/600 关系 | pan/zoom frame time P95 `<= 32 ms`；选择反馈 P95 `<= 100 ms`；零功能失效 |
| 设计压力 OPD | 1,000 可见 construct/2,000 edge | pan/zoom frame time P95 `<= 50 ms`；选择反馈 P95 `<= 200 ms`；零功能失效、零 OOM |
| 大模型保存 | 10,000 结点、跨多 OPD | 每次 `<= 10 s`，5 次均成功 |
| 大模型快照 | 同一 10,000 结点模型 | 每次 `<= 15 s`，5 次均成功 |
| 大模型全量校验 | 同一 10,000 结点模型 | 每次 `<= 60 s`，5 次均成功、结果完整 |

交互测量先预热至少 `5` 次，再采样至少 `100` 次并报告 P50/P95/Max；frame time 在稳定画布上连续采样至少 `30 s`。10,000 结点三类任务各执行至少 `5` 次，报告每次时长、Max 和失败率，任一次失败、OOM、结果缺失或超时即 FAIL。

## 6. 固定测试环境

1. 使用 production/release build，关闭 HMR、Vue devtools、浏览器 DevTools 和非产品性能注入；
2. Java 固定 `21`，Node 固定 `22`，Chromium 固定为 lockfile/Playwright 对应版本；报告 exact patch version；
3. 参考机器至少 `8` 个逻辑 CPU、`16 GB` RAM 和 SSD，关闭节能/低电量模式；报告机器型号、CPU、RAM、SSD、OS build 和测试时可用内存；
4. 浏览器视口固定 `1440x900`，device scale factor `1`，CPU/network throttling 关闭；视觉矩阵另测 `1280x800`、`390x844`；
5. Fixture、Profile/Rule/Grammar/Symbol digests、Revision、冷/热启动口径固定；不同机器或版本的结果不得混算同一 P95；
6. 性能报告保留原始样本和计算脚本。原型、dev build、单次人工观察或无环境元数据的结果不得作为 PASS 证据。

## 7. 验收映射

| 需求 | 必须证据 |
| --- | --- |
| 完整工具链 | 组件测试和 P03 浏览器主路径，图标/tooltip/搜索/候选/检查器完整 |
| Capability gate | 每个 enabled ID 的 Symbol/Rule/Grammar/golden digests 与 DEV-CANVAS-05 报告一致 |
| 视觉 | `1440x900`、`1280x800`、`390x844`；`25%/100%/400%` visual golden 和 canvas pixel |
| E2E | State、Procedural、Control、Structural、fan、图文互定位、blocked/conflict/readonly/recovery |
| 性能 | 第 5~6 节全部阈值、样本量和环境记录 |
| 发布 | clean install/start/health/open/reopen/exit，feature gate 回滚和证据状态文案 |

## 8. 完成定义

1. `E2E-CANVAS-001~007` 和三视口/三缩放视觉矩阵全部通过，无空白 canvas、无关键遮挡、无全局横向溢出；
2. 每个 enabled Capability 的 exact dependency closure 与 DEV-CANVAS-05 PASS 证据一致；
3. 第 5 节所有性能门槛通过，原始样本、统计口径和环境可复核；
4. asset-missing、digest mismatch、服务失败、强停重启和只读回滚不产生 partial Revision 或错误 Head；
5. 整体及按 Capability 关闭 enablement gate 后，已有数据保持只读可渲染；
6. 发布报告明确“完整画布发布证据”和“ISO 符合性证据”是不同状态。

## 9. 兼容性与回滚

- API/数据：不变更公共 operationId 或 SQLite DDL；只消费已发布的兼容机器契约；
- 前端：新工具由 Capability gate 控制，P0 工具链继续可用；
- 资产：只启用 exact digest，失败时回到上一组 ACTIVE binding；
- 回滚：整体或按 Capability 关闭完整画布 gate，模型数据和历史 Revision 不回退、不删除。

## 10. 事实与假设

### 10.1 事实

1. 性能阈值和采样方法已由本规格冻结；
2. 通过本包只能证明指定版本、fixture 和环境的发布验收，不自动证明其他硬件或 ISO 符合性；
3. 本包不能修改上游语义输入来换取 UI 或性能通过。

### 10.2 待实现验证

1. X6、浏览器和 Local Runtime 是否满足视觉、交互和性能门槛必须实测；
2. 参考机器之外的容量与性能需要单独报告，不能从本规格推测；
3. 性能优化若需要架构或语义变更，必须退回独立 task spec，不在本包静默扩围。
