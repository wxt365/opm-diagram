# 脑图转换预览自动修正

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：testing (primary)。

## Spec

目标：脑图转换审查发现冲突后，复用既有最多两轮自动修正与重审；在暂存 OPM 图上修复可明确消除的重复关系，最后一次确认，显示修正内容。

非目标：取消审查、无限重试、自动提交、自动改脑图、删除正式元素、扩大跨图权限、schema/API/依赖变更、提交 Git。

允许：助手 plan-finalizer、mindmap-service、service、相关来源协调纯函数与测试、MindmapPanel 的未纳入项提示文案及现有断言、README 和本规格。禁止：Runtime/持久化契约、前端业务接口、用户已有数据、配置与 .harness、无关变更。

事实：finalizePlan 的 !task.analysisSource 判断使脑图转换直接抛 REVIEW_BLOCKED；Runtime 的 MindmapConversions.bind 要求保留来源关系一致且全部纳入项有绑定，因此仅删除此判断会使修正后的来源绑定失效。转换本身并非 analysisOnly，现有建模修正工具可复用。

契约影响：无公共契约改变。仅允许脑图来源方案删除未创建的冲突项、删除未执行的更新步骤和调整布局；不新增或重写分析语义。移除项以现有 excluded_ids 记录为未纳入，但必须在需求/完成说明中区分用户排除与自动修正，不冒称用户明确排除。来源绑定移除对应别名，最终 Runtime 校验再次核对。脑图原文保留。

验收：PR-01 审查冲突会自动进入修正并再次平台/语义校验，最多两轮；PR-02 修正实时预览且最终通过前不能确认；PR-03 来源绑定与修正后步骤一致，说明移除项，不能无声跳过、篡改名字/状态归属或新增分析外元素；PR-04 预览/取消零写入，停止和版本冲突仍阻断，确认时 Runtime 能接收修正来源；PR-05 定向自动化与真实浏览器虚构冲突模型修正验证，用户 demo 数据不变。

验证：回归覆盖自动修正、来源别名移除、非法变更、预览失败回滚、重试上限；本机全虚构数据真实 DeepSeek 修正、浏览器图形、一次确认和来源记录检查。用户原资料不外发。

回滚：撤销本轮局部改动，恢复脑图转换遇审查冲突直接阻断的行为，保留脑图与模型。

## Plan

1. 增加来源协调纯函数和失败回归；修正步骤只能取原方案子集或改变布局。
2. 最终校验复用既有修正循环，调用预览成功后再保存协调后的来源；修正说明进入后续审查和完成消息。
3. 验证 Runtime 来源绑定、真实供应商与浏览器流程，重启助手加载结果。

## Checklist

引用本文件 Spec；修改边界确认完成，保留前轮脏变更。

- [x] PR-01
- [x] PR-02
- [x] PR-03
- [x] PR-04
- [x] PR-05（实时预览与刷新后结果由浏览器核对，最终确认由本机 API 完成）

## 实际验证

最小复现：同一对象的状态变化同时误建 Consumption、Result、Effect。原 service 回归在第一次语义审查 ERROR 后抛 REVIEW_BLOCKED，未进入修正；来源协调模块实现前新测试无法加载。原验证覆盖普通 OPD 自动修正与脑图正常转换，未覆盖脑图转换语义冲突后的来源同步。

自动化：助手全量 47/47 通过，覆盖修正重审、预览失败时来源不变、未确认零写入、非法语义改写拒绝和既有重试上限；脑图组件 8/8 通过。4 个本轮助手实现文件 node --check 与 git diff --check 通过。日志在 /private/tmp/opm-preview-repair-tests.log。

真实链路：使用完全虚构的工件资料调用现有 DeepSeek 配置。首次审查 2 ERROR，自动移除误建消耗/生成关系，7 步变为 5 步；Runtime blocking=0，独立重审无 ERROR（有 1 WARNING 提醒核对移除项）。ready 时正式 token、脑图均不变且 conversionRecords=0；通过本机 apply API 确认后 edit_seq=1、conversionRecords=1、保存 5 项来源绑定，原脑图仍不变。证明在 /private/tmp/opm-preview-repair/proof.json 和 applied-proof.json。

浏览器：在隔离测试模型观察到实时预览从 7 步修正为 5 步、完成消息列出两项移除内容。初始生成按钮 busy 与刷新超时曾阻断 UI 操作，确认改用本机 API，不能声称完整按钮提交路径通过。关闭此前代理创建的重复测试页后页面恢复，刷新结果展示对象、过程、两个状态，以及 OPL“标记工件 changes 测试工件 from 未标记 to 已标记.”；分析会话仍显示修正说明。截图 /private/tmp/opm-preview-repair/verified-canvas.png。同步把已保存未纳入项文案改为“本次未纳入”，避免将自动修正冒称用户主动排除；组件断言与浏览器热更新均核对。

数据边界：用户 demo edit_seq=0、analysis revision=36、脑图与备份一致、conversionRecords=0；本轮未修改其数据或重发其资料。测试证明限于既有平台规则与部分语义审查，不代表 ISO 全面符合性。原脑图保留，自动移除记录随转换保存，可在后续转换查看/调整未纳入项。
