# 模型问题校验与定位

## 执行元数据与边界

- Work Mode：change；Risk Level：L2；Task Type：feature。
- Active Playbooks：frontend-vue（primary）、testing。
- 允许：工作台组件、store、已有草稿查询封装；Local Runtime 的问题派生查询；对应测试；本规格和工作台设计文档。
- 禁止：数据库迁移、API/schema 结构变化、依赖变更、Profile/Grammar 资产升级、其他功能重构、`.harness` 修改、修改既有案例语义数据。
- 已检查现有 dirty 状态；保留此前改动。repo-profile 为 Harness 模板事实，运行命令以本仓库 package.json 和已有 Maven 为准。

## 目标与非目标

完成活动草稿的校验、问题说明、定位、修改后重新校验流程。复用 exact DraftToken 的 findings 查询；检查全模型基础语义、状态改变的对象身份以及已支持关系在所有 OPD 的 OPL/Trace 生成约束。保持 coverage_state=INCOMPLETE，明确不代表 ISO 全规则覆盖。

不增加异步校验任务或新接口，不修复旧 validation-tasks 的历史持久化实现，不升级 OPL 句式资产，不自动修改模型。历史版本允许查看和定位已有问题；新校验以活动草稿为入口。

## 契约影响

保留 DraftFindings 的全部字段、类别、BLOCKING 严重程度、MODEL 范围、null context_id 及 INCOMPLETE 覆盖状态。允许新增 rule.opl.* 和 rule.model.* 问题规则标识。context_id 不扩展，通过投影查找所属图；端点/布局等定位标识归一到画布实体或 OPD。查询不修改 DraftToken、保存历史或模型内容。

## 验收

- A1：运行校验实际请求当前 exact token 的模型 findings；显示运行、失败可重试、完成、未校验、编辑后过期；竞态响应不得污染新模型、新 token 或新图。
- A2：全模型检查保留所有基础问题，并检查支持关系的 OPL/Trace 与 PROC-008/009/010 同对象状态转换；返回可显示中文说明；问题数据符合既有 schema；正常关系不误报。
- A3：问题列表显示严重程度、中文说明、规则、实体和修复建议；非完整覆盖和零问题文案准确；结果过期时禁止按旧结果定位。
- A4：问题可在当前或其他 OPD 定位；URL 同步，节点/状态/特征及关系端点可见高亮；纯图或不可见目标有明确反馈；取消、另选、切图清理高亮。
- A5：实际浏览器新建隔离模型，创建错误状态关系、校验、跨图定位、修复后重新校验、保存重开；同时验证失败重试、只读和窄屏。不得改动原案例。

## Plan

1. 复用语义与 OPL 校验器，问题查询与编辑拒绝保持各自职责；每关系独立检查，防止首条失败遮蔽其余问题。
2. 封装问题详情及定位映射；通过现有投影查询解析跨图目标；导航后只恢复同 token 的待定位目标。
3. 为运行结果保留输入身份和状态，切图同 token 可保留校验完成状态，编辑产生新 token 时过期；失败保留可重试入口。
4. 定向后端/前端测试，类型检查及 lint，最后浏览器主流程和截图复核。

## Checklist

- Spec：`specs/opm-findings-workflow-feature-task-spec.md`。
- 边界：已确认，无新接口、schema、依赖、数据库或 Profile 资产变更。
- [x] A1
- [x] A2
- [x] A3
- [x] A4
- [x] A5

## 验证与回滚

运行后端派生查询与控制器回归、前端问题工作流/画布/面板定向测试、typecheck、lint、git diff --check 和本地 Playwright。验证结果记录于本文件。回滚只撤销本次新增模块及本次相关差异，保留此前工作。

## 实际验证结果（2026-10-03）

- A1/A3/A4：前端 5 个测试文件、156 项测试通过，覆盖草稿身份、竞态、校验失败重试、结果过期、中文详情、定位及画布高亮；typecheck 与 lint 通过。日志：`/private/tmp/opm-findings-frontend.log`、`/private/tmp/opm-findings-typecheck.log`、`/private/tmp/opm-findings-lint.log`。
- A2：后端控制器和模型校验器共 40 项测试通过。校验器遍历 130 个有效黄金夹具，覆盖 34 项关系与控制能力及根图/子图；另验证 PROC-008/009/010 跨对象状态转换、多关系错误不遮蔽、schema、问题身份稳定及输入不变。日志：`/private/tmp/opm-findings-backend.log`。后端 package 成功，本地服务已加载当前实现。
- A5：Playwright 真实浏览器 2 项测试通过（8.6 秒）。原五个案例运行校验时 token 不变、无命令/保存/pin 写请求，并保留 INCOMPLETE；该测试不把案例零问题作为验收前提。隔离模型通过鼠标在画布创建跨对象状态关系，从根图校验后定位子图，URL 同步且 5 个节点、2 个关系分支高亮；故障注入后可重试，删除错误关系并创建同对象状态关系后问题数为零，保存重开后再次校验通过。历史只读校验按钮禁用，隔离模型测试结束后移入回收站。日志：`/private/tmp/opm-findings-e2e.log`。
- 视觉复核：已检查桌面、390×844 窄屏和历史只读截图，问题卡片中文说明及高亮正常，窄屏使用紧凑状态标签。截图位于 `/private/tmp/opm-findings-e2e/workbench-findings-真实画布错误关系：全模型校验、跨图定位、失败重试、修改修复及保存重开/`。
- 边界：本轮完成已有草稿查询支持的模型检查流程；仍为部分规则覆盖。旧 validation-tasks 历史持久化故障、OPL 句式资产差异及其他无关绘图问题不在本轮验收范围。
