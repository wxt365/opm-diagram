# 仓储订单履约案例录入记录

记录日期：2026-10-01。运行入口：`http://127.0.0.1:5177/projects`。所有仓储业务名称和规则均为演示数据；H1 完单条件未经客户确认。

## 项目与模型

项目：`仓储订单履约演示与工具校验`，ID `project.9ae0e3dd46ae4f3a8b45520c5057ecd7`。

| 模型 | ID | 手动保存修订 | 重开核对 |
| --- | --- | --- | --- |
| 客户演示 | `model.8b8024549f2a45b8b32a814b794a187b` | `revision.32e07871fb05427eaefb8d8b0778e3ab` | 草稿 token 为编辑 52，SD1 有 15 Fact、15 OPL 句、15 trace。 |
| PROC | `model.332a2cb78df2414986fb1c2862788e7c` | `revision.4a8c793597ac43639fd4d14f6a0e9d0d` | 16 类过程 Fact、16 OPL 句、16 trace。 |
| CTRL | `model.1060e344ad0e4da8890719dd40998450` | `revision.4f16ff64b5dd4a9ebb022595a4962f0f` | 8 组独立基础 Fact，各附着对应控制 Modifier；8 OPL 句、8 trace。 |
| STRUCT | `model.05e82787edd7408d887b9fe637be430c` | `revision.55fe0bcf3829484e9d62e477e0f4f005` | 12 个结构 Fact，覆盖 001 至 008 及 010；13 OPL 句、13 trace。 |
| NEG | `model.ec65a3951aef4dd8a5a5a4ef31216f06` | `revision.5c5fe60712e14bb19d5a46d8a0b8cd0f` | 11 元素、2 状态、0 Fact。 |

五个模型身份独立。保存后重新调用草稿 open、projection、text、findings，token 与提交目标一致。各 Context 的草稿 Finding 阻断数为 0；这只是草稿查询结果，不代表正式校验完成。

## 客户主模型

- SD：一个“订单履约”过程；它拥有子图 SD1。
- SD1：5 个子过程、7 个对象、9 个对象状态、2 个特征；M-01 至 M-15 的基础 Fact 均已提交，M-12 的 `CTRL-006` 与 M-15 的 `CTRL-008` 已附着到各自基础 Fact。15 条 OPL/trace 已在重开后核对数量；具体句子包括完单条件、订单状态变化、不合格分支及 `PT5M` 超时分支。
- SD1.1：由 SD1 的“异常处置”细化得到，含“异常确认”“人工复核”两个过程。尚未引用 SD1 的“异常记录”。
- 根图计划展示的出库订单、包裹、作业员、分拣设备，以及 SD1/SD1.1 的跨图同一身份引用尚未实现。本次只使用当前可用候选建模，不创建同名异 ID 的替代节点。

## 工具校验结果

| 范围 | 已证实 | 未完成或失败 |
| --- | --- | --- |
| PROC-001..016 | 各有一条已提交正例；保存重开后 16 Fact、16 OPL/trace。 | 逐条符号与 Golden manifest 的全文比较未执行。 |
| CTRL-001..008 | 每组独立基础 Fact 和控制 Modifier 已提交；保存重开后 8 Fact、8 OPL/trace。 | 逐条符号与 Golden manifest 的全文比较未执行。 |
| STRUCT-001..010 | 001..008、010 的正例已提交；005 的完整/不完整 fan、006 的三个 Feature owner 变体均录入。Feature Value State“超重”通过草稿 API 创建。 | `STRUCT-009` 候选出现且启用，但提交返回 `DRAFT_EDIT_REJECTED`；未写入 Fact。工作台没有手工创建 Feature Value State 的入口。 |
| NEG | 跨类型过程关系和独立 Control 候选被过滤；缺结构标签及缺超时时长的提交均被拒绝，token 和 Fact 数量不变。 | 不同包裹所属的输入/输出 State 的 `PROC-008` 候选出现，提交竟被接受，违反案例预期。已用删除影响预览确认仅一个 Fact，再通过 Runtime 删除，重开后 NEG 为 0 Fact。其他设计负例未逐一运行。 |

负例提交只证实当前 Runtime 的 `DRAFT_EDIT_REJECTED` 响应；草稿错误响应没有暴露设计中预期的更细错误码，不能声称错误码匹配。

## 验证边界与待处理问题

- 手动保存、草稿重开和 OPL/trace 数量检查已执行。客户 SD1 的 15 条 OPL 句已通过工作台显示，包含两个控制条件。
- 对五个已保存修订分别调用正式 `validation-tasks`，均返回 HTTP 500 `PERSISTENCE_FAILED`；正式校验结果不可用。
- 关系图的所有连线在小窗口中较密集，尚未完成桌面大视口的逐项符号与交互检查。
- W-03、W-05 的取消路径、W-06 布局/缩放/平移、W-07 Finding 定位与历史、W-08 固定版本/永久链接、W-09 删除依赖预览、W-10 旧候选等非关系操作未完整执行。
- 当前证据只支持“案例已部分录入并暴露运行时缺陷”，不支持 34 类工具正确性全量通过、ISO 符合性或客户业务验收结论。
