# Task Checklist: OPM DEV-CANVAS-06 工具链集成与发布验收

## Spec Mapping

- 规格：`specs/opm-dev-canvas-06-toolchain-release-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`frontend-vue (primary)`、`backend-springboot`、`testing`
- 目标：完整工具链集成、视觉/E2E/性能/恢复证据和按 Capability 分批启用。
- 范围：P03、X6、Projection、visual golden、E2E、性能 fixture、release gate 和发布报告。
- 非目标：新增语义、修改 concrete OPL/Trace/Rule、补写 DEV-CANVAS-05 资产、SQLite migration、ISO 符合性声明。
- 约束：只启用 exact dependency closure 已通过的 Capability；性能不以省略语义符号换取通过。
- 验收：规格第 5~8 节。
- 验证：组件、E2E、visual/canvas pixel、性能、故障恢复、clean install smoke、diff check。
- 回滚：整体或按 Capability 关闭 gate，历史模型和 Revision 不回退。

## 输入门槛

- [x] 性能阈值、样本量、固定环境和报告字段已冻结
- [ ] DEV-CANVAS-05 的 16/8/10 golden、Token/Trace 和 replay 报告全部通过
- [ ] release build、exact asset digests 和 enablement 清单已冻结
- [ ] 性能/视觉 fixture 的生成器与摘要已版本化

## Build

- [ ] 完成固定工具链、State、关系目录、候选层和完整检查器
- [ ] 接入逐 Capability evidence gate 和禁用 reason
- [ ] 完成 committed/blocked/conflict/readonly/asset-missing/recovery 状态
- [ ] 建立三视口、三缩放 visual golden 与 canvas pixel 检查
- [ ] 建立 300/600、1,000/2,000 和 10,000 结点性能 fixture
- [ ] 保留 P0 工具链和整体/逐 Capability 回滚入口

## Verify

- [ ] `E2E-CANVAS-001~007` 全部通过
- [ ] `1440x900`、`1280x800`、`390x844` 无关键遮挡或全局溢出
- [ ] `25%/100%/400%` visual golden 和 canvas pixel 非空检查通过
- [ ] 普通编辑反馈 P95 `<=100 ms`，增量 OPL P95 `<=500 ms`
- [ ] 300/600 frame P95 `<=32 ms`、选择 P95 `<=100 ms`
- [ ] 1,000/2,000 frame P95 `<=50 ms`、选择 P95 `<=200 ms`、零 OOM
- [ ] 10,000 结点保存/快照/全量校验每次分别 `<=10/15/60 s`，各 5 次零失败
- [ ] 交互预热/样本、30 s frame 采样、机器/版本/digest 元数据完整
- [ ] 强停、服务失败、asset mismatch 和 gate 回滚无 partial Revision/错误 Head
- [ ] clean install/start/health/open/reopen/exit smoke 通过
- [ ] 限定文件 `git diff --check` 通过

## 发布证据

- [ ] 报告原始样本、P50/P95/Max、失败率、fixture 摘要和运行命令
- [ ] 报告每个 enabled/disabled Capability 及其 exact evidence/digest/reason
- [ ] 报告明确未证明其他硬件性能和 ISO 19450:2024 符合性
- [ ] 回滚演练结果与残余风险已记录
