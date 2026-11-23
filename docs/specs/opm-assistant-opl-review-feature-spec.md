# 助手预览 OPL 审查接入

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: none (primary)、testing。

## 目标与非目标

最终预览同时提供平台根据同一候选模型生成的 OPL 和句子追踪，独立审查可核对本图图文一致性。保持整图预览、统一确认和本图写入边界。

非目标：改写 OPL 语法或生成器、直接编辑 OPL、新增建模工具、跨图写入、完整 ISO 合规认证、大模型费用调用及真实业务数据修改。

## 允许与禁止范围

允许修改 DraftWorkspaceService 及相应 Java API 测试、草稿协议生成脚本/测试及其生成文件；助手最终审查、范围构造和报告绑定模块及相关测试；两个 Skill/规则版本、助手 README、会话建模设计、本规格与对应清单。禁止数据库 schema、依赖、模型数据、`.harness`、不相关模块、Git 提交和服务重启。

## 契约与兼容

DraftModelPlanPreviewResult 增加可选 nullable `text`，复用 DraftTextData。新后端普通预览和阻断预览返回 null；最终无阻断预览从同一内存候选 revision 生成 text，复用已有草稿文本序列化。旧响应仍可解码；旧后端缺 text 时 OPL 只能 NEEDS_INPUT，不能 PASS。不得随后读取真实草稿 text 冒充暂存方案文本。

审查快照在本图挂载 OPL、句子与事实/occurrence/target 映射；关联图维持裁剪且不附完整 OPL，禁止通过文本扩张子图审查范围。预览 meta 必须与任务 base token、context 匹配，OPL 与投影及方案一并进入冻结快照 digest；trace 引用必须能在本图投影定位。不改变提交正文或现有 API 路径。

两份 Skill 指导及规则版本升级到 1.3.0，旧未应用报告需重新审查；历史记录保留，质量策略数值/policy_version 不变。缺少 OPL 时服务端拒绝宣称 PASS/ISSUE/NOT_APPLICABLE 的 OPM-OPL 检查，只允许 NEEDS_INPUT；有 OPL 时由独立审查判断语义，不把结构校验称作语义证明。

## 验收

- OR-01：最终预览 OPL 与候选图匹配，普通/阻断预览无文本，预览与取消零持久写入；确认后的 text 与预览句子和追踪一致。
- OR-02：冻结审查快照包含当前图 OPL 及可定位映射，父/相关图不泄漏无关文本；后续输入变动不改变已构造快照。
- OR-03：错误 token/context、缺 trace、错图引用不进入审查；缺文本只能待确认，文本改变导致旧 digest 失效。
- OR-04：生成、自动修正、重新审查均使用最新候选文本；旧版本报告零提交；原子确认与取消边界保留。
- OR-05：版本、Skill、设计与契约同步；协议、Java 定向 API、助手定向/全量回归及前端类型验证执行，明确真实 LLM 语义验证边界。

## Plan 与边界确认

已读取预览、草稿 text、审查快照、报告绑定及提交守卫。公共响应是新增可选字段，权限和持久化不扩张。先抽出既有 text 序列化并在 finalize 复用，再把同一响应挂入审查快照和证据守卫，更新 Skill/版本/测试及说明。父图不新增 OPL 查询；本图无文本时保持待确认，不把旧后端当成语义错误。

## 验证与回滚

执行协议生成一致性及协议测试、DraftWorkspaceControllerTest/ContractTest、review-scope/review/quality 和 service 定向及助手全量测试、web typecheck、Skill 格式与 git diff --check。已存在脑图排除 request 未定义和生成超时挂起回归，若重复不得为消除失败顺手修改无关代码。Java 使用 JDK21 离线 Maven，测试数据隔离临时目录，不启动用户服务。

回滚本任务模块和契约变更、恢复 Skill 版本并重启助手/后端；无数据迁移。不能使用整体 git reset 覆盖此前未提交 Skill 工作。

## 本任务实际修改文件

- `apps/assistant/src/plan-finalizer.mjs`
- `apps/assistant/src/review-scope.mjs`
- `apps/assistant/src/review.mjs`
- `apps/assistant/test/review-scope.test.mjs`
- `apps/assistant/test/review.test.mjs`
- `apps/assistant/test/service.test.mjs`
- `apps/assistant/skills/opm-modeling-guide/SKILL.md`
- `apps/assistant/skills/opm-modeling-guide/references/quality-policy.json`
- `apps/assistant/skills/opm-standard-review/SKILL.md`
- `apps/assistant/skills/opm-standard-review/references/rules.json`
- `apps/assistant/README.md`
- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/specs/opm-assistant-opl-review-feature-spec.md`
- `docs/checklists/opm-assistant-opl-review-feature-checklist.md`

生成的 OpenAPI 和 Java 包装文件内容未改变。保留此前复杂图 Skill 的未提交工作，完整验证记录见[检查清单](../checklists/opm-assistant-opl-review-feature-checklist.md)。
