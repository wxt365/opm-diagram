# Spec: P03 活动 HEAD 稳定 URL 与精确 Revision 深链设计

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与目标

当前工作台把每次命令返回的 `committed_revision` 写回 URL。语义编辑或布局编辑产生新 Revision 后，浏览器地址随之变化；这把“当前活动草稿”错误地表现为一个固定历史版本，也使普通连续编辑不断改写深链身份。

目标是冻结两种互斥的工作台定位模式：

1. 活动草稿使用稳定 HEAD URL，Revision 提交只更新页面 Header 和投影，不改变 URL；
2. 历史 Revision、Named Snapshot、Baseline 和用户显式复制的永久链接使用精确 Revision ID，保持不可漂移的只读定位。

## 2. 非目标

- 不修改 Vue Router、Store、Header、Runtime、OpenAPI、Schema、SQLite、Profile 或测试代码；
- 不改变 `UPDATE_LAYOUT` 是否产生 Revision 的既有契约；
- 不决定 Revision 保留、垃圾回收、Snapshot/Baseline 数据结构或多分支草稿策略；
- 不把 viewport、选择、候选、工具、面板或其他临时 UI 状态持久化到 URL；
- 不把设计冻结表述为功能已实现或浏览器验证通过。

## 3. 修改边界

允许修改：

- `specs/opm-p03-stable-head-url-and-exact-revision-deeplink-design-task-spec.md`
- `docs/checklists/opm-p03-stable-head-url-and-exact-revision-deeplink-design-checklist.md`
- `docs/design/opm-modeling-workbench-state-model.md`
- `docs/design/opm-modeling-workbench-field-region-detail.md`
- `docs/design/opm-modeling-workbench-component-interaction.md`
- `docs/design/opm-modeling-tool-module-design.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/README.md`
- 仅为标记 URL 条款被取代而修改 `specs/opm-p0-frontend-interaction-task-spec.md` 和 `specs/opm-p04-workbench-contract-bugfix-task-spec.md`

禁止修改：

- `apps/**`、`services/**`、`scripts/**`、`tests/**`、`docs/contracts/**`、`migrations/**`、`packages/**`；
- `.harness/**`、依赖、构建配置、运行数据和 Git 历史；
- 本任务未列出的既有设计语义。

## 4. 冻结 URL 契约

### 4.1 两种定位模式

| 模式 | canonical URL query | 读取目标 | 编辑性 |
| --- | --- | --- | --- |
| `HEAD` | `?context=<context_id>`，禁止持久保留 `revision` | 当前活动 Draft Head 指向的实际 committed Revision | 由 M09 access mode 决定，正常为可编辑 |
| `EXACT` | `?revision=<revision_id>&context=<context_id>` | 指定 Model 内不可变的精确 Revision | 只读 |

`revision=head` 只作为兼容输入。解析成功后必须用 replace 规范化为省略 `revision` 的 HEAD URL，不新增浏览器历史；不得让省略字段与 `head` 成为两种长期 canonical URL。

### 4.2 HEAD 行为

1. 省略 `revision` 时，M01/M09 解析当前 Model 的活动 Draft Head，并返回实际 `committed_revision`、Context Projection 和 access mode；
2. Header 的 Revision 标识必须显示实际读取到的 `committed_revision`，不得显示空值或字面量 `head`；
3. 命令成功后，页面采用响应中的实际 `committed_revision` 更新 Header、编辑基线和各投影；HEAD URL 保持不变，且不得 push/replace 一个精确 Revision ID；
4. 语义命令、布局命令、撤销、重做或自动保存只要仍处于同一活动 Draft Head，均遵循第 3 项；
5. Model 没有活动 Draft Head 时，保留既有“打开最近 Baseline”恢复策略，但必须立即切换为该 Baseline 固定 Revision 的 EXACT URL 和只读模式；没有可用 Baseline 时显示无可打开版本，不得伪造 HEAD；
6. `UPDATE_LAYOUT` 是否产生 Revision 继续由布局与持久化契约决定，URL 策略不得改变该决定。

### 4.3 EXACT 行为

1. 只有打开历史 Revision、Named Snapshot、Baseline 或用户执行“复制永久链接”时，工作台 URL 才携带精确 `revision_id`；
2. Named Snapshot/Baseline 先由 M09 解析其固定 Revision 和访问模式，再打开对应 EXACT URL；URL 不以 Snapshot/Baseline 名称替代 `revision_id`；
3. EXACT URL 始终读取指定 Revision，不跟随 Draft Head，不因后台提交或刷新漂移；
4. EXACT 模式强制只读。用户执行“返回活动草稿”或“基于此版本创建草稿”成功后，才切换为 canonical HEAD URL；
5. “复制永久链接”必须读取 Header 当前显示且已由投影校验的实际 committed Revision，并生成带该精确 ID 的 URL；不得复制 `head` 或省略 Revision 的地址冒充永久链接。

### 4.4 Context 与非法输入

1. `context` 是 OPD 深链定位，HEAD 和 EXACT 两种 canonical URL 都必须携带；
2. 缺少 `context` 时，在目标 Revision 内解析默认根 Context，并以 replace 写成 canonical URL；
3. Context 不存在或不属于当前 Model/Revision 时，回退到该目标 Revision 的默认根 Context、显示非阻断说明并规范化 URL；
4. 精确 Revision 格式非法、不存在或不属于当前 Model 时必须拒绝该入口，不得回退到 HEAD，也不得把错误输入改写成当前 Revision；
5. 刷新、前进和后退只恢复 Context 以及 HEAD/EXACT 资源定位，不重放命令或恢复临时画布状态。

### 4.5 URL 禁止项

以下状态不得进入 query、path、fragment 或 history state：viewport 缩放和平移、框选、hover、焦点、当前 selection、Finding/OPL 临时高亮、关系/State 候选、候选参数、激活工具、菜单、弹层、属性检查器开关、底部面板标签和尺寸、提交中状态、撤销/重做栈。

## 5. 责任与兼容

1. M01 Workbench Router 负责 URL parse、canonicalize、导航和非法入口反馈，不自行推断 Revision 归属；
2. M09 负责 HEAD 解析、精确 Revision 归属、Snapshot/Baseline 固定 Revision 和 access mode；
3. M03 的 `DraftRevisionCommitted` 只驱动 Header、编辑基线和投影更新，不直接驱动 URL Revision 同步；
4. 当前已保存的精确 Revision URL 保持可读并按 EXACT 只读处理；`revision=head` 保持兼容但立即规范化；
5. 旧 `opm-p0-frontend-interaction-task-spec.md` 和 `opm-p04-workbench-contract-bugfix-task-spec.md` 的“活动 Revision 随提交写入 URL”条款仅保留为历史记录，由本规格取代。

## 6. 验收

- `HEAD-URL-01`：活动草稿 canonical URL 只有 `context`，`revision=head` 会 replace 为该形式；
- `HEAD-URL-02`：连续语义和布局提交后 URL 字节不变，Header 逐次显示响应中的实际 committed Revision；
- `HEAD-URL-03`：历史 Revision、Snapshot、Baseline 和永久链接使用精确 Revision ID，刷新后不跟随 HEAD 且保持只读；
- `HEAD-URL-04`：返回活动草稿或从固定版本创建草稿后进入 canonical HEAD URL；无活动草稿时的最近 Baseline 恢复会切换为只读 EXACT URL；
- `HEAD-URL-05`：非法/跨 Model 精确 Revision 被拒绝且不回退 HEAD；缺失/非法 Context 按目标 Revision 的根 Context 规范化；
- `HEAD-URL-06`：平移、缩放、选择、候选、工具和面板状态不会改变 URL 或新增浏览器历史；
- `HEAD-URL-07`：复制永久链接使用 Header 当前实际 committed Revision；
- `HEAD-URL-08`：活动设计、旧规格取代关系、冻结基线、索引和文档链接一致，`git diff --check` 通过。

## 7. 后继实现与回滚

后继实现必须创建独立 L3 实现规格，原子覆盖 Router、Workbench Store/View、Header、版本入口和浏览器回归；不得在本设计任务中声称实现。设计回滚仅回退本规格允许的文档，并恢复此前“活动 Revision 写入 URL”的设计基线，不涉及数据或机器契约迁移。
