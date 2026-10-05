# 修复较大脑图的语义审查截断

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：none (primary)、testing。

## Spec

目标：完整传递专用审查工具的定版数据，避免 Harness 截断后要求使用未授权文件工具导致反复读取；报告以结构化提交为主；审查未完成时显示实际原因并保留已经完成的平台诊断。

非目标：修改用户脑图语义、跳过审查、扩大审查工具权限、自动确认正式模型、改变 API/schema/依赖、全面重构、提交 Git。

允许：apps/assistant/src/harness.mjs、plan-finalizer.mjs、相关测试与 README、本规格；必要的本机服务重启与纯虚构验证模型。禁止：用户正式模型/分析正文、密钥及配置文件、Java Runtime、生成契约、依赖与 `.harness/`。

事实：用户当前模型的两次审查会话均出现 tools/result 中间 `[...]` 和 spill-policy 的 Omitted 提示，遗漏 14890 字节；模型连续 read_review_model，结束原因 max-tokens。当前只允许 read_review_model/submit_review，临时文件读取不在权限中。SDK 的 maxTokensAsSuccess=false 正确保持失败。此前小模型测试没有触发 Harness 默认的工具输出截断。

契约影响：公共 API/schema 不变；只调整本机专用 Harness 的上下文保留策略和内部审查指导。完整输入仍受既有节点、关系、步骤、HTTP 和工具调用上限约束。有效报告、快照摘要、平台校验、只读/停止/过期守卫保持；不能把截断或无报告当成功。

验收：RT-01 生成的 Harness 配置关闭要求文件工具恢复的输出截断，工具权限保持；RT-02 较大虚构模型审查读取完整定版数据并形成有效报告，完整报告有问题时准确阻断；RT-03 max-tokens/无报告仍阻断且原因可识别，已完成的平台诊断保留；RT-04 定向/助手回归、本机真实 DeepSeek 浏览器验证和确认前零正式写入。

验证：先配置与失败守卫回归，再助手全部测试；用完全虚构的较大模型经浏览器执行同样转换链路，记录实际审查工具数据无截断、报告、状态和令牌。用户咖啡资料只在本机读取；前轮自动审批拒绝再次外发，未经新增明确授权不重发。

回滚：撤销本轮 Harness 策略与内部提示局部修改，保留原会话、资料和未应用模型；重启助手沿用原数据目录。

## Plan

1. 为配置截断策略、输出额度失败原因及诊断保留补回归；不增加无界重试。
2. 关闭专用 Harness spill-policy、压缩报告输出指导，保持权限/摘要/最终确认守卫。
3. 使用接近用户规模的完全虚构数据验证真实审查与浏览器结果，重启助手加载变更。

## Checklist

引用本文件 Spec；边界确认完成，保留此前所有未提交变更。

- [x] RT-01
- [x] RT-02
- [x] RT-03
- [x] RT-04

## 验证记录

- 先失败：新增配置/审查截断回归在原实现失败；修复后 Harness/Service 定向 26/26、助手全部 43/43 通过；Node 语法检查与 git diff --check 通过。前端产品代码未修改，无需重复前端构建。
- 实际根因：Harness spill-policy 默认 maxInlineTokens=12500，用户的两份审查日志遗漏中段 14890 bytes 并要求 file read；受限工具只能反复 read_review_model，随后 max-tokens。关闭此策略而非扩大工具权限/无界重试。
- 真实 DeepSeek/浏览器：独立全虚构模型 52 节点/17 关系，显式排除4属性，实时生成64项预览。审查工具输出104478 bytes，SDK估算18928 tokens，明确超过旧12500阈值；read_review_model一次，submit_review一次，无截断/spill提示，工具仍仅两项，turn/end=completed。平台blocking=0，语义报告完整且无ERROR，方案ready，浏览器确认按钮可用。
- 正式写入边界：验证模型确认前 token 不变，4属性保留。未执行确认。用户咖啡模型/分析只读取失败日志，不重新外发，不修改用户模型或对话记录。
- 截断/缺失报告/停止/过期仍拒绝确认；已有平台诊断在语义审查失败时保留，max-tokens返回明确长度限制原因。
- 助手沿用原配置和数据目录已重启加载修复；Runtime/前端无需重启。用户历史失败提示保留，需要生成新预览验证最新版本，不自动篡改旧记录。
- 证据：`/private/tmp/opm-review-truncation-fix/` 的 fixture.json、result.json、harness-proof.json、full-review-tool-result.json、large-model-ready.jpg；全部助手测试日志 `/private/tmp/opm-review-regression.log`。当前咖啡脑图最新完整语义报告仍未重新验证；本轮证明的是同一生成链路和更大工具数据的截断根因修复，不声明任何模型全面符合ISO。
