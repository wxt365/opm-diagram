# 智能助手局域网模型连接修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## 元数据
Work Mode: change；Risk Level: L3；Task Type: bugfix；Active Playbooks: none (primary)。.harness 规则目录不存在，不创建该目录。

## 目标与证据
当前助手依赖缺失，17860 未启动。用户配置的 HTTP 私有地址被 HTTPS 默认策略拒绝。远端 /v1/models 包含 gpt-6.1-sol，/v1/chat/completions 非流式测试返回 200 OK；/v1/anthropic/v1/messages 返回 404，/v1/messages 返回 403。因此应使用 SDK 已有 OpenAI 兼容适配，而非强行追加 Anthropic 路径。

## 非目标
不更换模型或密钥，不取消 Host/Origin/会话校验，不修改模型数据、前端公共接口、数据库、领域规则或 DSH 安装本体。不新增依赖版本；仅安装 lock 中已声明依赖。

## 允许与禁止范围
允许安装现有 npm workspace 依赖（node_modules；使用锁文件，不更新依赖版本），修改 apps/assistant/src/server.mjs、src/harness.mjs 及必要的新增配置辅助模块，apps/assistant/test/http.test.mjs、test/harness.test.mjs 及连接定向测试，apps/assistant/.env.example、.env.local、README.md，以及本规格文档。SDK 适配方式若确需额外范围，应先更新边界说明。
禁止修改其他源码、package.json/锁文件依赖版本、API/schema、用户数据或 .harness。

## 安全及契约
默认仍使用 DeepSeek HTTPS；显式 provider 可选择 OpenAI 兼容服务，保留原配置兼容，包括原有 localhost/127.0.0.1 HTTP 许可（不扩大该许可）。HTTP 例外需精确匹配配置的 origin 且只允许 RFC1918 IPv4；不允许公开 HTTP、URL 用户信息、query/hash 或通配符。不在日志、返回、patch 中写入 Key。局域网 HTTP 明文传输仍有风险，生产建议 HTTPS。重定向风险需按所用 SDK 能力检查并记录。

## 验收
A1：所有原助手测试及新配置边界测试通过。
A2：当前本地配置通过，默认 HTTPS 仍保持，非显式/公开 HTTP 被拒绝。
A3：OpenAI 路径不追加 /anthropic，模型/Key 正确通过 SDK 传递且 patch 不含秘密。
A4：助手 17860 健康检查 UP；隔离临时 Harness 会话实际调用 gpt-6.1-sol 成功，验证流式和工具能力；不写用户模型。
A5：文档同步配置与 Windows 启动步骤；git 差异仅在边界内。

## 验证与回滚
先运行定向配置/patch 测试，再运行完整 assistant:test，真实远端最小请求与隔离 Harness 验证。无浏览器验证不得声称页面聊天已验证。
回滚恢复变更源码、配置、文档并停止本次启动服务，保留用户数据；依赖安装仅影响 node_modules。

## Plan
1. 安装锁定的助手依赖，检查 SDK 内置模型适配配置。
2. 增加精确私网 HTTP 许可与显式协议配置；同步测试和文档。
3. 运行测试和隔离模型请求，启动助手并读取 health。

## Checklist
Spec: specs/opm-assistant-connectivity-fix.spec.md。边界已确认。
- A1：55/55 助手测试通过（node --test --test-isolation=none test/*.test.mjs）。
- A2：当前配置通过；私网 origin/公开 HTTP/非法协议/认证信息/query/hash 边界测试通过。
- A3：OpenAI patch、密钥不入 patch 和原 DeepSeek 路径测试通过；实际 Harness 使用 opm-openai、openai-completions、gpt-6.1-sol。
- A4：真实远端普通请求返回 OK，流式 SSE/DONE 与工具调用成功；隔离临时 Harness session 返回 OK、completed，临时目录已清理。助手 HTTP 200 UP。浏览器聊天与真实模型写入未执行。Windows 沙箱禁止 SDK 管道子进程，已批准的真实 Harness 测试成功；常驻服务使用同样权限并通过子进程预检。
- A5：配置示例及 README 已同步，git diff --check 通过，锁文件未修改；原有资产换行修复保持不动。
- 重定向：专用 Harness 通过 NODE_OPTIONS 加载 model-fetch-guard.mjs，模型来源请求强制 redirect=error；mock 与真实 HTTP 307 测试均通过，不影响本地工具请求。
安装说明：npm ci 尝试删除前端正在使用的 esbuild.exe 时遭遇 Windows 文件锁；不停止用户前端，改用 npm install --package-lock=false 定向补齐依赖。允许仓库 .npm-cache 作为安装缓存（不含 API Key），禁止更改锁文件版本。
