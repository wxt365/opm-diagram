# 助手预览 OPL 审查检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[opm-assistant-opl-review-feature-spec.md](../specs/opm-assistant-opl-review-feature-spec.md)。

- [x] 边界已确认：可选响应字段、候选文本读取和只读审查；禁止数据/schema/依赖/权限扩张。
- [x] OR-01：Java API/SQLite 定向测试确认候选 OPL 与确认后文本及追踪完全一致，普通/阻断预览 text 为 null，预览无 Journal/回执写入。
- [x] OR-02：审查范围测试核对本图逐句映射、输入后续变动不影响快照、父图裁剪；真实子图预览只生成本图事实，父图文本保持一致。
- [x] OR-03：错误令牌/context/投影、缺追踪/重复句子/跨图引用拒绝；缺 OPL 只能 NEEDS_INPUT，文本变化使旧快照摘要失效。
- [x] OR-04：生成、自动修正及重新审查读取各轮候选 OPL，确认前零写入；旧 1.2.0 报告保留且不能提交。
- [x] OR-05：协议、Skill 1.3.0、设计/运行说明同步；验证及未覆盖范围如下。

## 实际验证（2026-10-09）

- review-scope/review/quality 与草稿协议定向测试：38/38 通过，包含生成文件一致性、旧响应兼容、错误引用、摘要与缺证据边界。
- service 主路径、新增 OPL 两个用例及旧版本守卫：4/4 通过；全量中被前序取消的冻结脑图重审、修正阶段超时两项单独 2/2 通过。
- JDK21 + 本地 Maven 3.9.10 离线执行 DraftWorkspaceControllerTest、DraftWorkspaceContractTest：54/54 通过，日志 `/private/tmp/opm-opl-preview-java-tests.log`。随后新增真实子图用例单独 1/1 通过，日志 `/private/tmp/opm-opl-child-java-test.log`。使用临时 SQLite 和 MockMvc，不访问用户库。仓库 mvnw 无执行权限且缺 wrapper 配置，改用已安装 Maven，没有修改构建配置。
- 助手全量：78 项中 74 通过、1 失败、3 取消，退出 1；日志 `/private/tmp/opm-opl-assistant-tests.log`。重复此前已在 HEAD 基线核对的脑图排除用例 request 未定义及生成阶段超时挂起，导致后两项取消，不宣称全量通过，不修无关实现。
- web typecheck 通过，日志 `/private/tmp/opm-opl-web-typecheck.log`；两份 Skill 格式校验通过；本地链接、版本与十五项目录核对及 git diff --check 通过。质量策略阈值/policy_version 不变。

未启动或重启服务、未调用真实大模型、未进行浏览器验收。本次验证证明候选文本/追踪接入、模型版本及范围绑定、持久化边界，不证明真实 LLM 语义判断通过或完整 ISO 符合性。后端与助手下次启动加载新版契约及 Skill；旧未应用方案需重新审查。
