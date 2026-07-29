# Task Checklist: OPM DEV-CANVAS-05 OPL、Trace 与 Golden

## Spec Mapping

- 规格：`specs/opm-dev-canvas-05-opl-trace-golden-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`
- 目标：把 Control/Structural concrete OPL、确定性排序、Token/Trace 和 golden manifest 实现为版本化机器资产与原子文本提交链路。
- 范围：Grammar/Template/Rule、20 个 Control 组合、Structural 合法变体、Token/Trace、golden replay、故障注入。
- 非目标：P03 UI、视觉、E2E、性能、Capability 生产启用和新增语义。
- 约束：一个 Control Fact/一个合成句；Bidirectional 同 Fact 两句；Reciprocal 同 Fact 一句；fan 同 Fact/同 junction/有序 endpoints。
- 验收：规格第 6~7 节。
- 验证：资产/Schema、单元、模块集成、golden replay、事务故障注入、diff check。
- 回滚：回到上一组 ACTIVE asset digests，历史 Revision 仍按原 digest 解析。

## 输入门槛

- [x] 8 类 Control 已展开为 20 个允许基础 Fact concrete template
- [x] 10 类 Structural 的句式、句数、fan/list/completeness 和 State qualification 已冻结
- [x] `14.2.4.1.4`、`A.3.1` 与产品确定性句序边界已冻结
- [x] UTF-8 byte Token/Trace 与 golden manifest 已冻结
- [ ] `DEV-CANVAS-01~04` 的依赖证据和资产 digests 已在任务启动时重新核验

## Build

- [ ] 实现/版本化 concrete Grammar、Template、Rule 和 manifest loader
- [ ] 实现 Control 20 个合成变体及禁止组合阻断
- [ ] 实现 Structural 全部合法 variant、双向/互惠和 fan/list/completeness
- [ ] 实现 Sentence 全 byte Token 与闭合 Trace
- [ ] 实现 deterministic SentencePlan、同 Revision replay 和 artifact SHA-256
- [ ] 将 Text/Trace/Validation/Revision/Operation 接入原子事务
- [ ] 保持生产 Capability gate 关闭

## Verify

- [ ] 资产 Schema、digest、coverage 和 case ID 唯一性检查通过
- [ ] Control `20/20` PASS 与全部冻结 BLOCKED case 通过
- [ ] Structural 所有 Profile coverage key、`1/2/3` fan、双向/互惠用例通过
- [ ] UTF-8 range、全 byte 覆盖和 Trace source refs 检查通过
- [ ] 同 Revision 连续重放至少两次字节和 SHA-256 一致
- [ ] 缺资产、digest mismatch、Trace 不全和事务故障注入无 partial commit
- [ ] 旧 Revision/旧 asset digest 兼容回读通过
- [ ] 限定文件 `git diff --check` 通过

## 交付边界

- [ ] 报告明确已通过的 case/variant 数量和未覆盖项
- [ ] 报告明确本包没有执行视觉、浏览器 E2E、性能或 ISO 符合性验收
- [ ] 向 `DEV-CANVAS-06` 交付冻结的 release build、asset digests、golden 摘要和 Capability gate 清单
