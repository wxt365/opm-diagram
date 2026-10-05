# Spec: P03 单行分组关系工具栏与标准符号

2026-09-11 后继修正：[生成/消耗组合工具规格](opm-p03-combined-transformation-tool-task-spec.md) 取代本文关于基础 001/002 独立按钮、`5/4/5` 常驻及 `16/8/10` 展开按钮计数、对应 Tooltip/选择态的一对一限制。Catalog 能力数与各自标准名称不变；当前 UI 为 `4/4/5` 常驻和 `15/8/10` 展开。Consumption 与 Result 的闭合箭头外观相同，按规范端点方向区分，不要求两者图标可区分。

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `jdp-vue3-action-bar (primary)`
- `testing`

## 1. 目标

把 16 类 Procedural、8 类 Control 和 10 类 Structural 收敛到画布主工具栏同一排：选择/平移、构造创建、三族关系和视口控制依次排列并用竖线分组。每个关系族常驻 3～5 个高频标准符号，通过组尾向下箭头展开完整纯图标目录；所有图标只在悬停和可访问名称中显示“中文 / English”提示。关系选择仍进入既有 Runtime 候选流程，每项继续使用与 ISO 19450:2024 和活动 Symbol 契约一致的缩略符号。

## 2. 非目标

- 不修改 OpenAPI、Runtime、SQLite、Profile 业务资产、依赖或发布工件。
- 不把 Control 变成独立连线，也不绕过 Runtime 候选、规范端点、preview/confirm 或 Revision 事务。
- 不在本任务中开放关系顶点编辑、端点重连或路由持久化；自动分轨仍只解决多条普通二元关系的重叠。

## 3. 允许与禁止范围

允许修改 P03 画布工具栏、关系 Catalog 前端状态、关系缩略符号组件、局部样式、Vue/Playwright 测试，以及本规格对应的设计、索引和冻结记录。禁止修改服务端、公共 API/schema、数据库、Profile 包、依赖与本范围外文件。

## 4. 冻结契约

1. 画布工具栏固定为一行，唯一顺序为 `选择/平移 | Object/Process/Attribute/Operation/State | PROCEDURAL | CONTROL | STRUCTURAL | 缩放/适配`。关系工具不得再作为第二排；相邻区域使用竖向分隔线。窄视口只允许整条主工具栏横向滚动，不换行、不压缩符号、不增加第二或第三行。
2. 常驻高频项按稳定 Capability ID 冻结，不得按名称、Runtime 位置或使用次数动态推断：Procedural 为 `CAP-ISO-PROC-001~005`；Control 为 `CAP-ISO-CTRL-001/002/005/006`；Structural 为 `CAP-ISO-STRUCT-001/005/006/007/008`。
3. 每组末尾提供独立向下箭头，展开面板按 Runtime 原序显示该族完整 `16 / 8 / 10` 项，而不是只显示非常驻项。一次只展开一个族；点击外部、按 `Escape` 或选择项目后关闭。即使全组不可用，箭头仍可展开以查看 Runtime 原因。
4. 常驻项和展开项均为只显示标准缩略符号的可聚焦按钮，不显示族名称、数量、关系名称或端点描述。两类按钮的 `title` 和 `aria-label` 固定为“中文标准名称 / English standard name”；禁用时只在第二行追加“中文可操作原因 / English actionable reason”。Tooltip 禁止暴露 endpoint role、target kind、reason code、Capability ID 或其他机器字段。34 个活动 Capability 的中英文名必须由稳定 Capability ID 的前端只读显示表显式提供，英文名逐字节等于活动 Profile 名称，中文名采用本规格冻结术语；不得使用 Runtime 缩写、即时翻译或内部代码拼接用户文案。缺少名称映射或 Symbol 映射时按钮禁用，并显示通用可读原因。
5. Catalog 仍由 Runtime selection-aware 查询提供。Procedural/Structural 单击后进入既有关系拖线状态机；Control 仅在选中兼容的 committed Procedural Fact 后启用，单击后进入同 Fact 的 `UPDATE_FACT` 预览。
6. 缩略符号只接受 Runtime 的 exact `symbol_descriptor.id`。已知 Symbol ID 映射到冻结的标准 primitive；未知 ID 不绘制通用替代箭头并禁用该按钮。Consumption/Result/Effect、Agent/Instrument、Invocation/Self-invocation、两类 Exception、`e/c` Control、Tagged/Bidirectional/Reciprocal 及四类 fundamental structural marker 必须可区分。
7. 工具栏选择态由当前 relation/control candidate 的 exact Capability ID 驱动；取消、Context/Revision 切换和提交后清除，不维护第二套默认或最近使用关系。
8. 展开面板必须以视口固定浮层呈现在工具栏和画布之上，不参与工具栏或画布高度计算，也不受工具栏横向滚动裁剪；其位置随主工具栏横向滚动重新锚定，并限制在可见视口内。面板内容保持纯图标网格，族上下文仅由可访问名称表达。
9. 关系位置调整当前仅有自动稳定分轨。未冻结 `UPDATE_LAYOUT` 的 Fact route/vertices payload、Runtime 校验和重开投影前，不得启用 X6 vertex tool 或只在浏览器内保存临时折点。
10. 关系工具尺寸固定为：常驻按钮 `34 x 32px`、常驻符号 `32 x 18px`、展开按钮 `28 x 32px`、下拉符号 `42 x 20px`。下拉面板保持四列但最大宽度不得超过 `256px`；不得通过拉宽按钮或扩大 SVG 空白区模拟可点击范围。

### 4.1 关系显示名称

| Capability | 中文标准名称 | English standard name |
| --- | --- | --- |
| `CAP-ISO-PROC-001` | 消耗关系 | Consumption Link |
| `CAP-ISO-PROC-002` | 生成关系 | Result Link |
| `CAP-ISO-PROC-003` | 影响关系 | Effect Link |
| `CAP-ISO-PROC-004` | 主体关系 | Agent Link |
| `CAP-ISO-PROC-005` | 手段关系 | Instrument Link |
| `CAP-ISO-PROC-006` | 状态指定消耗关系 | State-specified Consumption |
| `CAP-ISO-PROC-007` | 状态指定生成关系 | State-specified Result |
| `CAP-ISO-PROC-008` | 输入-输出状态指定影响关系 | Input-output-specified Effect |
| `CAP-ISO-PROC-009` | 输入状态指定影响关系 | Input-specified Effect |
| `CAP-ISO-PROC-010` | 输出状态指定影响关系 | Output-specified Effect |
| `CAP-ISO-PROC-011` | 状态指定主体关系 | State-specified Agent |
| `CAP-ISO-PROC-012` | 状态指定手段关系 | State-specified Instrument |
| `CAP-ISO-PROC-013` | 调用关系 | Invocation Link |
| `CAP-ISO-PROC-014` | 自调用关系 | Self-invocation Link |
| `CAP-ISO-PROC-015` | 超时异常关系 | Overtime Exception Link |
| `CAP-ISO-PROC-016` | 欠时异常关系 | Undertime Exception Link |
| `CAP-ISO-CTRL-001` | 转换事件 | Transforming Event |
| `CAP-ISO-CTRL-002` | 使能事件 | Enabling Event |
| `CAP-ISO-CTRL-003` | 状态指定转换事件 | State-specified Transforming Event |
| `CAP-ISO-CTRL-004` | 状态指定使能事件 | State-specified Enabling Event |
| `CAP-ISO-CTRL-005` | 转换条件 | Transforming Condition |
| `CAP-ISO-CTRL-006` | 使能条件 | Enabling Condition |
| `CAP-ISO-CTRL-007` | 状态指定转换条件 | State-specified Transforming Condition |
| `CAP-ISO-CTRL-008` | 状态指定使能条件 | State-specified Enabling Condition |
| `CAP-ISO-STRUCT-001` | 单向标记结构关系 | Unidirectional Tagged Structural |
| `CAP-ISO-STRUCT-002` | 单向无标记结构关系 | Unidirectional Null-tagged Structural |
| `CAP-ISO-STRUCT-003` | 双向标记结构关系 | Bidirectional Tagged Structural |
| `CAP-ISO-STRUCT-004` | 互惠标记结构关系 | Reciprocal Tagged Structural |
| `CAP-ISO-STRUCT-005` | 聚合-参与关系 | Aggregation-participation |
| `CAP-ISO-STRUCT-006` | 展示-特征关系 | Exhibition-characterization |
| `CAP-ISO-STRUCT-007` | 泛化-特化关系 | Generalization-specialization |
| `CAP-ISO-STRUCT-008` | 分类-实例化关系 | Classification-instantiation |
| `CAP-ISO-STRUCT-009` | 状态指定特征关系 | State-specified Characterization |
| `CAP-ISO-STRUCT-010` | 状态指定标记结构关系 | State-specified Tagged Structural |

### 4.2 禁用原因显示

| 机器原因 | Tooltip 用户文案 |
| --- | --- |
| `CONTROL_REQUIRES_BASE_FACT` | 请先选择可附加控制的过程关系 / Select a compatible procedural relation first |
| `MODIFIER_COMBINATION_INVALID` | 所选过程关系不支持此控制类型 / The selected relation does not support this control |
| `READ_ONLY_REVISION` | 当前修订只读 / The current revision is read-only |
| `REVISION_STALE` | 当前修订已过期，请刷新 / The current revision is stale; refresh it first |
| 未知 Runtime 原因 | 当前不可用 / Currently unavailable |
| 缺少名称或 Symbol 映射 | 关系工具资源不可用 / Relation tool asset is unavailable |

展开按钮提示固定为“展开全部过程关系 / Show all procedural relations”“展开全部控制关系 / Show all control relations”“展开全部结构关系 / Show all structural relations”，不得显示内部数量或冒号式说明。

## 5. 验收

- `P03-REL-TOOLBAR-01`：选择/平移、五类构造、三族关系和视口控制位于同一主工具栏；关系区精确显示 `5/4/5` 个常驻高频按钮，区域以竖线分隔，窄屏不换行。
- `P03-REL-TOOLBAR-02`：三个纯图标下拉面板分别按 Runtime 原序展示完整 `16/8/10` 项；页面中不显示关系名称或数量，全部关系按钮具有本规格冻结的“中文标准名称 / English standard name”双语 `title/aria-label`，且不包含端点角色、目标类型、reason code 或 Capability ID；外部点击、`Escape` 和选择项目均关闭，展开和取消均不产生 Revision。
- `P03-REL-TOOLBAR-04`：常驻按钮与符号、展开按钮、下拉符号和面板宽度符合第 4.10 条固定尺寸；视觉上与普通 `32px` 工具按钮处于同一密度等级。
- `P03-REL-TOOLBAR-03`：26 个基础关系可从常驻或下拉入口进入拖线；8 个 Control 仅按 selection-aware Runtime 状态启用并进入 Control preview。
- `P03-REL-SYMBOL-01`：34 个活动 Symbol ID 均解析为受控标准 glyph，未知 Symbol ID 被拒绝且无通用 fallback。
- `P03-REL-SYMBOL-02`：三类 transforming、两类 enabling、Control `e/c`、Exception bar、tagged arrow/harpoon 与四类 structural triangle 在 DOM/视觉回归中可区分。
- `P03-REL-ROUTE-01`：本任务不出现可拖动 vertex handle，不产生关系 layout 命令或仅前端持久化。
- `P03-VERIFY-01`：定向/全量 Vue、lint、typecheck、build、P03 Playwright、桌面和窄屏浏览器检查及 `git diff --check` 通过。

## 6. 回滚

回退本规格允许范围内的前端、测试和文档修改，恢复上一版独立第二排关系工具带。不得改写已提交业务 Revision，也不得影响自动平行分轨。
