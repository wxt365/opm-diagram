# OPM 预览修正恢复与阻断展示

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：testing (primary)。

## Spec

目标：脑图转换修正误删原方案关系后允许在后续轮次恢复；保留阻断预览供核对，明确区分重新修正预览和补充脑图说明。

非目标：强制审核通过、扩大两轮上限、自动改变对象身份或关系语义、改用户脑图/正式模型、公共 API/schema/依赖变更、Git 提交。

允许：助手 mindmap-repair、mindmap-service、plan-finalizer、service、tools、只读审查 Skill 的证据判断提示，相关回归测试；AssistantPanel 及测试、WorkbenchView 预览状态提示；助手 README 与本规格。禁止：Runtime、持久化契约、配置与 .harness、用户原始数据、无关重构。

根因证据：用户最新 blocked 方案把拉花两条必需 Consumption 排除，重审又要求补回；reconcileMindmapRepair 比较上一轮子集，已删除步骤无法恢复。AssistantPanel.receive 仅保留 staging/ready，blocked 时清空预览。上一轮测试只有删除正确冲突项，没有误删后恢复场景。

契约：首次修正冻结原转换步骤和来源；后续方案可为原步骤任意子集并调整布局，可恢复原有步骤，不得创造分析外项或重写语义。来源每轮从冻结基线重新协调；用户明确排除不恢复，移除说明反映当前结果。read_model 额外提供只读原步骤供恢复。公共 API、schema 不变。

验收：RC-01 第二轮恢复原步骤及绑定，当前排除/说明移除对应内容；RC-02 新增语义改写、失效依赖、版本冲突、未确认写入仍禁止；RC-03 审核 blocked 的最新同版本整图预览保留，确认禁用、取消/过期/切图清空；RC-04 重新修正入口复用原转换流程且提示核对业务，不伪装分析消息能直接修改 OPM；RC-05 助手与前端定向测试、浏览器当前阻断预览及隔离虚构数据核对。

验证：先失败回归再实现，测试误删/恢复/来源、前端 blocked 展示及取消/过期；浏览器只读取用户原模型，外部模型仅发送虚构测试资料。不能把模型审查通过当作标准全面符合。

回滚：撤销本轮范围内修改，恢复每轮只允许上一轮子集与 blocked 清空预览；保留所有用户数据。

## Plan

1. 增加误删后恢复和 blocked 画布回归。
2. 固定原转换基线，来源与说明基于最终子集计算；提示核对端点，不删除无关关系。
3. 保留 blocked 预览，加入复用转换入口，执行回归并核对浏览器。

## Checklist

引用本文件 Spec；允许/禁止边界已确认，保留全部前轮变更。

- [x] RC-01
- [x] RC-02
- [x] RC-03
- [x] RC-04
- [x] RC-05

## 实际验证

失败回归：恢复被删关系测试抛 ANALYSIS_REPAIR_SCOPE；前端 blocked 预览测试收到 null。修复后助手全量 49/49 通过，AssistantPanel/MindmapPanel 26/26 通过；Web typecheck、受影响文件 ESLint、助手修改文件 node --check、git diff --check 通过。第二轮恢复测试同时检查 read_model 返回原方案、恢复绑定与用户排除不变、当前说明不再包含误删项、正式写入为零。日志 /private/tmp/opm-preview-recovery-tests.log。

浏览器当前用户模型：只读加载脑图会话后显示 52 步“待修正预览”，对象、过程与状态可见，旧报告仍保留 3 个阻断问题，确认禁用；新修正入口与补充脑图说明入口可见。本次不重发用户资料或改写旧提案；原模型 edit_seq=0，脑图 revision=36、与备份一致、conversionRecords=0。旧报告不会因代码更新自动改为通过。

真实隔离模型：model.60e2e405476b48bf839b4cc69d5ee1da 使用完全虚构的标记工件和合成试片资料，通过浏览器生成入口调用现有真实 DeepSeek。原 14 步移除工件误建消耗/生成后成为 12 步，保留合成试片对不同对象的两条 Consumption 与一条 Result、工件 Effect。Runtime blocking=0、独立审查无 ERROR；ready 前正式 token 与脑图不变、conversionRecords=0。浏览器点击一次“确认整图修改”，实际显示 edit_seq=1、已自动保存，OPL 四句与关系一致；来源记录=1、原脑图不变。证明 /private/tmp/opm-preview-recovery-proof.json，截图 /private/tmp/opm-preview-recovery-verified.png。真实供应商本轮无需第二次恢复；误删后第二轮恢复由确定性助手集成回归覆盖，不冒称供应商一定采用同一行为。

助手已重启加载修复，Runtime 与 Vite 沿用现有服务。能力边界仍为两轮修正原方案子集；无法改变对象身份/关系定义来消解业务歧义，仍保留阻断。新“重新生成并修正预览”复用 requestConversion 事件，组件已验证事件发出；用户旧脑图的重新生成未执行。
