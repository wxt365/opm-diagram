# Spec: OPM DEV-CANVAS-05 OPL、Trace 与 Golden

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 背景

`DEV-CANVAS-01~04` 承接 State、16 类 Procedural、8 类 Control 和 10 类 Structural 的语义、候选、命令与 Projection。本包把已冻结的 concrete OPL、确定性 SentencePlan、Token/Trace 和 golden manifest 实现为可执行、版本化、可重放的 Grammar/Template/Rule 资产，并关闭文本阶段的 partial commit 风险。

ISO 19450:2024 不存在 Clause 15。本包只按 `14.2.4.1.4` 处理 out-zoom/fold 所需的 Link 语义强度，按 `A.3.1` 解析 EBNF 运算符，按 `A.4.1/A.4.3/A.4.5.4/A.4.6` 生成 Paragraph、List、Control 和 Structural Sentence；跨 Sentence 的确定性顺序属于产品 Grammar 策略。

## 2. 目标与范围

1. 把 Grammar 中的 template family/占位 ID 替换或展开为可执行 concrete template，并绑定 exact version + digest；
2. 实现 8 类 Control 与 20 个允许基础 Fact 组合的合成句，保持原基础 `fact_id`、一个 SentencePlan 和完整 Modifier Trace；
3. 实现 10 类 Structural 的单向、双向两句、互惠一句、fan/list/completeness 和 State qualification；
4. 实现 UTF-8 byte 半开区间 Token、Sentence Trace 和 OPD/OPL 双向定位所需的稳定映射；
5. 实现 `G-OPL-PROC/CTRL/STRUCT` manifest、PASS/BLOCKED fixture、重放 SHA-256 和 coverage gate；
6. 在同一业务事务中验证 Text Artifact、Token、Trace、Validation Summary、Revision 和 Operation Record，任一阶段失败不移动 Draft Head；
7. 为相同 Revision + asset digests 提供字节一致的重放证据。

## 3. 非目标

- 不修改 P03 工具栏、X6 视觉、菜单、响应式布局或浏览器交互；
- 不执行 visual golden、浏览器 E2E 或性能验收，这些属于 `DEV-CANVAS-06`；
- 不新增 OPM Capability、不改变 Endpoint Schema、不为适配 UI 修改已冻结句式；
- 不启用任何尚未通过依赖闭包的生产 Capability；
- 不声明 ISO 19450:2024 符合性。

## 4. 修改边界

允许修改：

- `packages/**` 中版本化 Profile/Rule/Grammar/Symbol 绑定、concrete template 和 golden manifest/fixture；
- `services/local-runtime/**` 的 text planner/generator/composer/trace/validator、事务装配及测试；
- `docs/contracts/schemas/**` 中版本化 Sentence/Token/Trace 机器契约及兼容样例；
- `scripts/**` 的资产 digest、manifest coverage 和 golden replay 验证；
- 本规格、对应 checklist 和必要设计同步。

禁止修改：

- `apps/**`、`tests/e2e/**`、SQLite migration、公共 operationId；
- State/Fact/Endpoint/Control/Structural 已冻结语义；
- `.harness/**`。

不允许引入新运行依赖，除非独立 ADR 和本规格变更先明确必要性、版本、替代方案与回滚。

## 5. 输入冻结

1. Canonical 句式、Control 20 组合、Structural 句数/list/fan/completeness：`docs/design/opm-symbol-and-text-generation-implementation-contract.md` 第 7.3.2~7.3.4 节；
2. precedence 与产品确定性排序：同文档第 7.4 节；
3. Token/Trace：同文档第 7.5 节；
4. golden manifest：同文档第 9.1~9.2 节；
5. 测试层级和阻断门槛：`docs/design/opm-test-strategy.md`。

实现不得从现有 `template_ref` 字符串反推句式；发现输入与上述 Canonical 契约冲突时先阻断任务并更新设计，不静默选择。

## 6. 验收映射

| 需求 | 必须证据 |
| --- | --- |
| executable Grammar/Template | 每个 concrete template 可加载、Schema 合法、version/digest 可复现 |
| Control 合成 | 20 个 PASS case；Result、Effect 输出段、pair 缺失/重复/不匹配、Event+Condition BLOCKED |
| Structural 生成 | 10 个主 Capability 的全部合法 variant，Bidirectional 两句、Reciprocal 一句、fan `1/2/3` 成员与完整性 |
| Token/Trace | Sentence 全 byte 覆盖、range 合法、source refs 闭合、双向 direction slot 正确 |
| Golden coverage | manifest coverage 无缺口、case ID 唯一、PASS/BLOCKED 结果稳定 |
| 重放 | 同 Revision + digests 至少连续重放两次，artifact bytes/token/trace/SHA-256 一致 |
| 原子性 | 缺 Template/Rule/Grammar/Symbol/Trace、digest mismatch 和注入失败均无 partial Revision |
| 兼容性 | 已发布旧 Revision 按原 asset digest 可读；新资产不覆盖同版本历史内容 |

## 7. 完成定义

1. `G-OPL-PROC-001~016` 的既有主集合与受控变体全部通过；
2. Control `20/20` 允许组合通过，所有冻结反例返回稳定错误；
3. Structural 不以 `10` 个示例代替变体矩阵，所有 Profile 允许 coverage key 均在 manifest 中出现；
4. 每个 PASS fixture 同时断言 Canonical Fact/Endpoint、Projection、Symbol、concrete Template、Sentence、Token、Trace、Rule 和 digests；
5. 每个 BLOCKED fixture 没有 committed Revision、Text Artifact 或 Head 移动；
6. 定向单元、资产契约、模块集成、golden replay、事务故障注入和限定 diff check 全部通过；
7. 本包完成后仍保持生产 Capability gate 关闭，交由 `DEV-CANVAS-06` 验证并分批启用。

## 8. 兼容性与回滚

- API：不新增 operationId；如 Token/Trace wire contract 需要扩展，使用兼容字段或新 schema version；
- 数据：不修改 SQLite DDL；Revision Canonical JSON 只通过版本化 Schema 演化；
- 资产：同一 version 内容不可变，发布失败回到上一组 ACTIVE Profile/Rule/Grammar/Symbol digests；
- 回滚：关闭新 asset binding，历史 Revision 继续按原 digest 解析，不删除新 Revision、不覆写历史资产。

## 9. 事实与假设

### 9.1 事实

1. Control/Structural 的语义、持久化、Projection 和模板 family 已存在；concrete 句式与 Trace 输入由本规格引用的设计冻结；
2. `DEV-CANVAS-05` 不负责 UI、E2E 或性能；
3. ISO 的语义强度、EBNF 优先级和产品句序是三个不同概念。

### 9.2 待实现验证

1. 当前 Grammar/Rule/Template 机器结构能否无破坏承载全部 concrete variant，必须由资产 Schema 和 loader 测试证明；
2. 当前事务装配能否覆盖 Text/Trace 失败注入，必须由集成测试证明；
3. 设计输入存在不等于本包已经实现或通过 ISO 符合性测试。
