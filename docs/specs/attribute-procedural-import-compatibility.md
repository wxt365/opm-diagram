# 属性参与过程连线的导入兼容修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix.
Active Playbooks: none (primary，仓库引用的 .harness 文件不存在)；平台转换侧采用 backend-springboot (primary)、testing。

## 目标与范围

兼容以 characterization 表示属性、并以 instrument / effect 等过程连线引用这些属性的模型。保留属性身份、所属元素、状态及连线的原始含义；导入、生成 OPL、保存和重新读取应使用一致的端点类型。

允许修改 local-runtime 的文本生成、导入错误处理及相关测试，平台的 LegacyCanvasRuntimeMapper 及其测试，以及本说明。禁止修改数据库 schema、公共请求字段、依赖、用户 JSON 和现有业务数据；不涉及前端布局或属性重分类策略。

## 契约与取舍

沿用现有 FEATURE / ATTRIBUTE 和属性状态结构。过程角色仍要求 PROCESS；对象值角色兼容有合法所属元素的 ATTRIBUTE，拒绝 OPERATION、悬空归属等非法端点。追溯继续包含属性、状态、最终所属元素以及本图 occurrence。effect 按影响关系处理，不转换为结果生成。导入文本错误返回现有 TEXT_GENERATION_BLOCKED 业务错误，并携带子图与原始错误原因。

## 验收

- A1：属性参与工具、消耗、结果、影响关系及属性状态、受控关系时，可生成 OPL 并通过 ACTIVE 追溯验证。
- A2：非法属性归属、操作特征、错误过程端点和跨图缺失引用继续拒绝；原对象与状态 golden 回归保持通过。
- A3：平台将正反方向 effect 保留为影响关系，属性归属转换后端点仍指向同一属性。
- A4：V5 的 15 张子图、V3 的 8 张子图均完成转换、校验、OPL 与布局规范化的内存回放；原 JSON 和业务数据保持不变。
- A5：本地运行服务加载修复构建，健康检查与只读接口可用；导入失败返回可定位的业务错误。

## 计划与核对

1. 增加最小失败回归，覆盖 A1/A2/A3 及错误提示。
2. 复用现有归属解析、命名和追溯工具，补全属性端点，修正 effect 映射。
3. 定向测试后回放真实文件；构建并更新本地服务。

边界确认：只修改上述范围；不迁移数据库，不清空或重新导入用户主题。回滚方式：恢复本次改动文件及备份的本地运行 JAR，沿用原启动参数重启。

Checklist（引用本文件验收项）：

- [x] A1/A2：属性及状态的过程 OPL / ACTIVE 追溯与拒绝场景。
- [x] A3：effect 映射回归。
- [x] A4：真实 V5/V3 全子图回放。
- [x] A5：错误提示、构建与本地生效验证。

## 实施与验证结果（2026-10-28）

修改文件：

- 平台：`LegacyCanvasRuntimeMapper.java`、`RuntimeCanvasMigrationTest.java`。
- Runtime：`text/OplTextGenerationService.java`；`application/OpdJsonPackage.java`、`LocalCatalogService.java`、`OpdTransferService.java`。
- Runtime 测试：`text/OplAttributeProceduralTest.java`、`application/OpdImportTextValidationTest.java`、`api/EmbeddedWorkspaceControllerTest.java`。
- 本说明。

已先复现属性端点失败，再修复并验证：Runtime 定向 191 项、平台定向 36 项，共 227 项通过。Runtime 使用 Maven 3.6.3 / JDK 17，`-o -s .codex/pg-maven-settings.xml -pl services/local-runtime -Dopm.build.directory=.../target/attribute-procedural`；平台使用现有 `target/maven-local-cache-settings.xml` 和 `-pl opm-modeling/opm-business-service -am`。没有新增 Maven 配置或依赖。

真实文件内存回放：V5 为 15 张图、56 个属性、274 条事实及 274 条 OPL；V3 为 8 张图、32 个属性、122 条事实及 122 条 OPL；全部通过基础语义、ACTIVE 文本追溯及布局校验。

额外在随机生成的隔离 PostgreSQL 测试 schema 中执行实际 `ensureEmbeddedWorkspace`、草稿持久化、创建新 service 重新读取全部子图投影与 OPL、幂等重试，两份文件均通过。测试 schema 已清理；未修改用户业务模型或原始 JSON。

构建完成后已保留旧 Runtime JAR 备份，更新本地 Runtime，并重启 Runtime 与 01 后端；17850 和 8081 的各自 actuator health 均返回 200 / UP。未执行浏览器文件选择操作，未向用户主题再次写入模型；页面刷新后可重新导入原 V5 文件。部署到其他环境仍须发布这两项后端改动。
