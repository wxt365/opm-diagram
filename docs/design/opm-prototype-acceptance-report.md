# OPM 单机建模工具原型设计验收报告

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；原型验收基线冻结

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档目的

本文档记录 OPM 单机建模工具 P01-P06 无构建交互原型的验收对象、环境、方法、场景、问题修正和当前结论，作为前端 handoff 与首批开发执行包的输入。

验收通过仅表示信息架构、关键状态和交互路径可以指导开发，不表示生产前后端、数据库迁移、正式符号资产或 ISO 19450:2024 符合性已经实现。

## 2. 验收范围

### 2.1 验收对象

1. `prototype/index.html`
2. `prototype/styles.css`
3. `prototype/app.js`
4. `docs/design/opm-modeling-workbench-page-design.md`
5. `docs/design/opm-modeling-workbench-state-model.md`
6. `docs/design/opm-modeling-workbench-field-region-detail.md`
7. `docs/design/opm-modeling-workbench-component-interaction.md`
8. `docs/design/opm-symbol-and-text-generation-implementation-contract.md`

### 2.2 验收基线

1. P01-P06 页面总表与逻辑 route；
2. P03 顶部、左侧、画布、右侧、底部五区工作台；
3. OV01-OV11 高风险动作入口、预览和回流；
4. `editable-draft / readonly-baseline`、文本当前、校验当前/运行、Finding 定位；
5. 视口缩放与 OPM 语义缩放严格分离；
6. Object、Process、State、Consumption 和对应 OPL 最小闭环；
7. 单用户、单设备、本地优先，不出现账户、角色、租户和远程协作入口。

### 2.3 非目标

1. 不连接真实 API、SQLite、文件系统或后台任务；
2. 不验证 X6、Vue、Spring Boot、Flyway 或打包运行；
3. 不覆盖完整 96 Capability、103 规则组、511 原子规则和 Annex A Grammar；
4. 不验证正式无障碍审计、全键盘操作、屏幕阅读器和全部浏览器矩阵；
5. 不将 P04-P06 原型覆盖解释为首批生产开发范围。

## 3. 验收环境与方法

### 3.1 环境

| 项目 | 实际值 |
| --- | --- |
| 原型服务 | `http://127.0.0.1:8765/` |
| 服务方式 | Python 3.12 静态 HTTP Server，仅监听 loopback |
| 浏览器 | Codex In-app Browser |
| 桌面视口 | `1440 x 1000` |
| 移动视口 | `390 x 844` |
| 验收日期 | 2026-07-27 |

### 3.2 方法

1. `node --check prototype/app.js` 检查脚本语法；
2. 浏览器 DOM snapshot 检查标题、区域、控件、弹层和状态可访问名称；
3. 浏览器截图检查桌面/移动视觉层级、文本、结点、关系和面板布局；
4. 点击主路径并读取稳定页面状态，检查视口缩放、语义确认、只读、校验和回流；
5. 读取浏览器控制台 `error/warn`；
6. 读取 `documentElement.scrollWidth` 与 viewport 宽度，检查 P01-P06 移动端全局横向溢出。

## 4. 页面覆盖结论

| 页面 | 主要覆盖 | 结论 | 问题项 |
| --- | --- | --- | --- |
| P01 项目库 | 活动项目、搜索、创建、导入入口 | 通过 | 无 P0 问题 |
| P02 项目详情 | 摘要、模型列表、新建模型、转换入口 | 通过 | 无 P0 问题 |
| P03 建模工作台 | 五区、OPD、属性、OPL、Finding、Revision 状态 | 通过 | 无 P0 问题 |
| P04 版本与基线 | 修订、快照、比较、只读基线 | 通过 | 差异内容为固定原型数据 |
| P05 标准与校验 | 任务进度、Finding、规则证据、未知符合性 | 通过 | 规则覆盖为代表性数据 |
| P06 本地数据 | 存储、策略、备份、任务、恢复入口 | 通过 | 不进行真实文件操作 |

## 5. 状态与交互结论

| 编号 | 场景 | 观察结果 | 结论 |
| --- | --- | --- | --- |
| PA-001 | P03 桌面五区 | 左 230px、主画布、右 270px、底部 240px 稳定呈现 | 通过 |
| PA-002 | Object/Process/State/Consumption | 矩形、椭圆、对象内状态和闭合箭头可辨识 | 通过 |
| PA-003 | 图文一致 | 画布 Fact 与 `Processing consumes available Raw Material.` 同时呈现 | 通过 |
| PA-004 | 视口放大 | 点击“放大视图”由 100% 变为 110%，Revision 文案不变 | 通过 |
| PA-005 | 语义缩放 | “过程内缩放”打开语义确认，显示 `SEMANTIC_IN_ZOOM` 与新 Revision 影响 | 通过 |
| PA-006 | 只读基线 | 打开 BL-001 后 9/9 个语义控件禁用，显示只读横幅 | 通过 |
| PA-007 | 基于基线建草稿 | 明确动作恢复可编辑草稿，不原地修改基线 | 通过 |
| PA-008 | 全量校验 | 固定 r18，进度完成后显示“阻断 0 / 警告 1” | 通过 |
| PA-009 | Finding 回流 | 从 P05 回 P03，激活问题标签并选择 Raw Material | 通过 |
| PA-010 | 新建项目 | OV01 确认后进入 P02，未出现权限/远程设置 | 通过 |
| PA-011 | 移动端 P01-P06 | 六页 `scrollWidth == viewportWidth == 390` | 通过 |
| PA-012 | 控制台 | `error/warn` 列表为空 | 通过 |

## 6. 受控弹层覆盖

| 弹层 | 入口状态 | 预览/守卫 | 原型结果 |
| --- | --- | --- | --- |
| OV01 创建项目 | P01 | 名称、Profile、本地位置 | 创建后 P02 |
| OV02 创建模型 | P02 | 根 Context、文本模态、草稿 | 创建后 P03 |
| OV03 创建细化 OPD | P03 单选 Process | 父 Context、目标树、新 Revision | 创建后 P03 |
| OV04 Profile 转换 | P02/P05 | 固定 Revision、无损/有损/不可映射 | 登记分析任务 |
| OV05 创建快照 | P03/P04 | 保存状态、不可变属性 | 创建后 P04 |
| OV06 生成基线 | P03/P04 | Revision、阻断数、文本追踪、证据状态 | 创建本地只读基线 |
| OV07 导入 | P01/P06 | 格式、Profile、身份检查 | 登记检查任务 |
| OV08 导出 | P03/P06 | 范围、格式、版本元数据 | 登记导出任务 |
| OV09 备份 | P06 | 范围、位置、预计大小 | 登记备份任务 |
| OV10 恢复 | P06 | 完整性、目标、源项目不变、确认 | 默认独立恢复项目 |
| OV11 OPD 影响 | P03 | owner/reference/refinement/view | 提交上下文命令 |

## 7. 验收中修正的问题

| 问题 | 等级 | 修正 | 回归结果 |
| --- | --- | --- | --- |
| JS 多余方括号导致语法错误 | P0 | 删除多余字符并执行 `node --check` | 通过 |
| 语义缩放弹层写死视口 100% | P1 | 改为“保持当前值，不进入修订” | 通过 |
| Finding 回流错误保留历史基线只读态 | P0 | 按 Finding 的 r18 输入恢复可编辑草稿 | 通过 |
| 移动端顶部最后一项入口被滚动边界截断 | P1 | 改为 3x2 稳定网格 | 通过 |

以上均在本轮验收中即时修正，不属于 Harness 级失败，不写入 `.harness/docs/agent-failures.md`。

## 8. P0 与 P1 结论

### 8.1 P0 必须满足

1. P01-P06 和 P03 五区存在且职责清晰：通过；
2. 多 OPD 导航与根 SD 可见：通过；
3. 视口缩放与语义缩放分离：通过；
4. 图、文、Finding 可回流定位：通过；
5. 基线只读且可基于基线创建草稿：通过；
6. ISO 证据缺失时显示“证据未就绪”：通过；
7. 桌面/移动无 P0 重叠和全局横向溢出：通过；
8. 控制台无原型脚本错误：通过。

### 8.2 P1 后续开发验证

1. 正式 SVG 符号资产在 25%/100%/400% 的 marker 与标签像素检查；
2. 全键盘路径、焦点顺序、屏幕阅读器和 WCAG 对比度审计；
3. 真实长名称、百级 OPD 树、千级结点和大规模 Finding 性能；
4. 面板拖动、折叠、viewport bookmark 和浏览器刷新恢复；
5. 真实文件选择、导入、导出、备份和恢复任务。

## 9. 当前结论

### 9.1 总体验收结论

1. 原型验收结论为“通过”，无未关闭 P0 原型问题；
2. P01-P06 可作为完整产品信息架构与后续开发范围基线；
3. 首批生产开发只进入 P01-P03 和最小 Revision/OPL/校验/基线闭环；
4. 原型不包含真实 API、数据或 ISO 符合性证据，不能作为生产完成证明。

### 9.2 开发准备阅读顺序

1. `opm-development-execution-pack.md`
2. `opm-development-technology-baseline.md`
3. `opm-modeling-tool-architecture.md`
4. `opm-modeling-tool-module-design.md`
5. `opm-frontend-handoff.md`
6. `opm-local-api-v1.yaml`
7. `opm-physical-data-and-migration-design.md`
8. `opm-test-strategy.md`

## 10. 事实与推测

### 10.1 事实

1. 本报告中的浏览器场景已在 2026-07-27 实际执行；
2. 桌面和移动截图均显示非空 OPD 画布；
3. P01-P06 移动视口没有全局横向溢出；
4. 浏览器控制台未发现原型页面 error/warn。

### 10.2 推测/假设

1. 生产 Vue/X6 实现可以复现原型布局，但仍需组件和 E2E 验证；
2. 原型固定数据不能证明真实模型、规则、事务、文件和性能行为；
3. P1 浏览器与无障碍矩阵将在生产 UI 骨架完成后执行。
