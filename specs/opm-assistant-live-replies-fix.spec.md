# 智能助手回复实时显示修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## 元数据
Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。.harness 规则目录不存在，不创建。

## 目标 / 非目标
生成中文字及时在对话显示，完成结果无需点击停止；订阅异常或延迟时可自动补拉当前会话。保持校验、审查、方案确认门槛及停止安全边界。不改模型协议、密钥、模型数据或公共 API/schema。

## 允许范围
apps/assistant/src/harness-sdk.mjs（转发 SDK 未提供的 agent/assistant-stream 通知）、service.mjs、mindmap-service.mjs、messages.mjs 或新增内部消息辅助模块及对应 test；apps/web/src/modules/workbench/AssistantPanel.vue 和 AssistantPanel.spec.ts、必要时 shared/api/assistantApi.ts 与其测试；apps/assistant/README.md、本规格。允许重启本会话启动的助手服务，构建前端。禁止改依赖、锁文件、其他功能源码、用户数据及 .harness。

## 契约
沿用 messages 数组字段，稳定消息 id 更新而非重复追加。文字展示不意味着方案已应用/已通过校验。任务 runId/active 校验阻止停止及旧轮迟到通知。独立审查内部文字不可进入用户对话。现有历史消息兼容。

## 验收
A1：后端 OPD/分析回复可在 Harness run 完成前读取；结束无重复回复，停止后迟到通知无写入。
A2：运行期间自动补拉 get；订阅断开不会要求停止才能更新，切图/卸载清理定时器，旧请求不覆盖新会话。
A3：原助手与定向前端测试通过，前端构建通过。
A4：助手更新启动并 health UP；记录实际执行与未执行验证，不声称未执行的浏览器端到端通过。

## Plan
1. 检查 SDK 文字通知契约和已有测试。
2. 后端按稳定消息身份更新并处理终态；前端添加有界补拉/恢复。
3. 定向测试后完整助手回归和前端构建，更新已启动助手。

## Checklist
Spec: specs/opm-assistant-live-replies-fix.spec.md；边界确认完成。
- A1：57/57 后端测试通过。OPD/分析实时持久化、结束稳定身份、停止迟到通知拒绝、独立审查过滤均有覆盖；实际 GPT 隔离请求收到 8 个 text-delta 通知并正常结束。
- A2：24/24 AssistantPanel 定向测试通过，覆盖定时补拉、失败重试、空闲自动重连、旧 SSE 终态保护、切图/卸载清理和旧响应隔离。
- A3：Vite 最终构建通过；保留既有 opm-bootstrap.js 非 module 构建警告；git diff --check 通过，锁文件无变化。为验证恢复现有前端依赖到 node_modules，未引入新依赖或版本声明；runtime-data/npm-cache 为忽略的安装缓存。
- A4：确认无活动生成后重启本会话助手，SDK 子进程预检通过，health HTTP 200 UP/gpt-6.1-sol。浏览器页面实际生成/代理流式端到端未执行；请刷新现有项目页面验证，无需停止。
- 定向前端测试初次失败源于测试在 running 状态尝试发送下一轮及复用旧 runId，修正为 completed 后真实新 runId 后通过。沙箱 esbuild/SDK spawn EPERM 操作按原命令批准后执行。

## 回滚
恢复对应源码/文档并重新构建、重启助手；保留全部会话与模型数据。
