# 助手添加附件

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature; Active Playbooks: none (primary).

## 目标和边界

在发送左侧增加截图样式的圆形回形针按钮，名称为“添加附件”。用户选择文档、移除待发送附件、随问题发送，助手获得正文并可在同会话追问中复用。

允许：apps/web 助手面板和 API 类型、apps/assistant 服务及测试、tests/e2e 定向测试、当前规格/检查清单、两个文档解析依赖（pdfjs-dist、mammoth）及 package-lock.json。允许对助手 prompt JSON 增加可选 attachments 字段及消息附件元数据，保持旧调用兼容。禁止：数据库 schema、Runtime 公共契约、其他业务模块、部署配置、大范围重构。.harness 下不新增内容。repo-profile、task-types 和 playbooks 当前不存在。

非目标：OCR、旧 DOC、图片理解、向量检索、独立文件管理、模型自动应用。文件随消息上传并解析，不增加独立上传接口。文档只作为数据，不改变工具权限；原文件不留存，仅保存提取文本用于多轮阅读。

## 契约和限制

prompt 可选 attachments: [{name, contentBase64}]；最多 3 个文件，单文件 5 MiB、合计 10 MiB。支持 UTF-8 TXT/MD/CSV/JSON、DOCX、文字 PDF。解析正文每轮和同会话合计上限 60000 字，超出明确拒绝，不静默截断。无文字、加密/损坏文件、格式不支持均明确报错。正文内部持久化，不在 watch/get 返回；消息返回 name/size 元数据。prompt 请求体独立放宽到 15 MiB，其他接口保持 256 KiB。

## 验收

- A1: 发送左侧圆形回形针按钮可通过“添加附件”访问，选择后列出文件名并可移除。
- A2: 附件可独立发送（默认“请阅读附件并总结主要内容”）；发送失败保留附件和输入，成功清空；上传读取中/运行中/只读禁用，切换作用域不泄露附件。
- A3: 后端验证文件和大小、解析文字；OPD 和脑图助手均接收正文，多轮复用，不影响现有会话。
- A4: 非法、空白、过大文件明确拒绝；文档只能在原会话作用域内使用，响应不暴露内部正文。
- A5: 定向前后端回归与 TypeScript 检查实际执行，记录结果。

## Plan

先实现受限解析和附件上下文函数，再扩展现有 prompt 路径及两种生成入口；面板使用现有 Lucide Paperclip，与发送同排，原生 file input 隐藏并呈现附件列表。通过现有 request 注入通道传送 base64，兼容嵌入宿主。最后验证文件错误、生成上下文、UI 状态和原功能回归。

## 验证和回滚

运行助手 node:test、面板 Vitest、web typecheck 和定向 lint；新增解析测试覆盖真实文本/PDF/DOCX 和边界，生成测试验证正文实际传给 harness。回滚仅撤销本次文件差异和新增依赖；旧会话无附件字段仍可读取，新消息附件为可选字段。
