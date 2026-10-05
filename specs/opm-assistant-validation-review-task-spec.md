# 助手最终平台诊断与标准审查

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：实时整图生成后，使用平台模型级 Findings 诊断和独立的标准语义审查，通过后才允许一次确认。已核对的 ISO 19450:2024 条款摘要作为版本化 Skill 随助手发布；审查给出可定位的依据与业务假设。发现可修正的问题在预览中自主修正，再重新检查。

非目标：完整标准符合性声明、标准全文分发、跨图写入、删除真值图元、数据库迁移、新依赖、自动提交代码和生产发布。

允许：Runtime 方案预览/确认及测试、草稿协议生成器与生成产物/测试；助手生成/审查/修正流程、版本化 Skill 和测试；前端助手审查报告/测试；独立浏览器用例、相关设计和说明文档。本任务允许新增预览的诊断字段及可选最终校验参数，保持旧请求兼容。禁止 `.harness/`、数据库 schema、依赖、密钥、用户模型及无关文件；保留先前全部未提交改动。

契约：预览阶段保留实时投影；最终检查模型级 Findings，提交事务中再次检查并阻止存在平台阻断问题的方案。标准审查使用独立只读 Harness session、固定模型 deepseek-flash、受限专用工具和封闭结构化报告，绑定方案版本与投影摘要；审查失败/截断/未完成/证据无效不能标记已审查。标准问题作为语义诊断而非正式符合性判定。自动修正最多两轮，修正后重新校验与审查；仍有错误则阻断且不写真值。用户仍只确认一次，未知提交沿用既有回执恢复。

验收：VR-01 最终投影诊断与问题面板使用同一规则，阻断项提交零写入；VR-02 Skill 原文来源/条款核对与独立结构化审查；VR-03 有限自动修正、停止/失败/过期/版本绑定及恢复；VR-04 前端显示平台诊断和标准审查结果，真实 DeepSeek 画布生成与一次确认、保存重开通过。

验证：定向契约、Java MVC/SQLite事务、助手报告/生命周期/权限测试、前端组件和类型/lint/build；读取标准原文并查看关键页图形；隔离模型真实浏览器。无验证证据不结束。

回滚：撤销本轮源码与生成产物。既有提案和已提交模型保留；旧整图提案在再次确认前必须补做新诊断，不能绕过新增门槛。

## Plan

先核对原文，提炼少量有出处的审查规则。预览协议增加可选最终诊断模式，最终投影携带 Findings。新增只读审查工具，报告经过 schema、来源和图元引用校验后绑定方案摘要；生成服务编排最终诊断、审查及最多两轮修正。前端沿用现有提案卡片展示结果。验证定向规则及真实用户流程。

## Checklist

引用：本文件 Spec。允许/禁止目录、API影响、零真值写入、旧提案补检、原文不分发边界已确认。

- [x] VR-01
- [x] VR-02
- [x] VR-03
- [x] VR-04

## 验证记录

日期：2026-10-05。VR-01：Java `DraftWorkspaceControllerTest,DraftJournalRepositoryTest` 共 56 项通过，使用真实 SQLite Journal；跨对象状态作用关系在暂存预览可见，最终 Findings 返回 STATE_OWNER_MISMATCH，提交 422 且零写入，同对象正例通过。Maven 离线 package 通过。日志 `/private/tmp/opm-review-java-test.log`、`/private/tmp/opm-review-java-package.log`。

VR-02：读取 168 页本地原文，提取文本并核对 6.2.3、7.3.5.1/.2、9.1.2/.3/.4、9.3.3.1/.2、9.2.2/.3、14.2.3；实际查看 PDF 第 31、35、102 页渲染图，PDF 原文 SHA256 与 rules.json 一致。报告单元测试覆盖伪造出处、越界图元、遗漏/重复检查、快照过期及结论不一致。Skill 原生 quick_validate.py 因两套 Python 均无 PyYAML 未执行成功；未安装依赖，使用现有 Node yaml 完成 frontmatter、名称、描述与未完成占位检查通过。

VR-03：助手 27 项测试通过（含本机 HTTP 边界）；覆盖审查只读工具创建/恢复、审查期间拒绝生成者写入、有限修正、缺少报告、停止与迟到报告、方案摘要/规则版本/来源过期拒绝、旧方案门槛及未知提交回执恢复。日志 `/private/tmp/opm-review-assistant-test.log`。契约 16 项通过，覆盖 finalize 可选旧请求兼容、非法值、模型级 Findings、生成文件一致性与 OpenAPI。

VR-04：前端 AssistantPanel/assistantPreview/WorkbenchView 共 107 项通过；typecheck、lint 与生产 build 通过，build 保留既有 bootstrap script 提示。真实 DeepSeek deepseek-flash 主浏览器用例通过（2.0 分钟）：实时画布、完整咖啡流程与投入产出、平台 Findings、六项审查来源与摘要、确认前改名重新审查、稳定身份、一次 edit_seq、保存刷新报告保留、取消/停止零写入与冲突拒绝。助手重启后同一会话/模型/报告恢复及只读解释通过（6.3 秒）。首轮生成注入语义错误的隔离用例通过（1.3 分钟）：真实审查识别活动误建为对象，真实修正 1 轮，再次审查后一次提交，浏览器验证过程、两条关系与 OPL。已实际查看桌面审查、窄屏和修正画布截图。

证据：`/private/tmp/opm-assistant-review-e2e`、`/private/tmp/opm-assistant-review-resume-e2e`、`/private/tmp/opm-assistant-review-repair-e2e`（包含报告 JSON）；各输出目录与身份输入分离，不含会话凭据。隔离用例只使用独立测试项目，不修改用户既有模型。前端回归日志 `/private/tmp/opm-review-web-test.log`；重新确认自动修正后的回复不沿用修正前总结，助手 27 项回归通过。补测一度因仅允许“磨豆”而拒绝正确的“磨豆过程”命名；测试改为按稳定 local_id 检查过程类型及允许的业务名称，同时保留关系、事务和真实画布断言。最终补测通过（39.6 秒），确认修正回复、过程类型、投入产出、确认前零写入与一次提交；证据 `/private/tmp/opm-assistant-review-repair-final-e2e`。静态差异与新增文件凭据扫描通过，未变更依赖、数据库 schema 或 `.harness/`，未提交代码。

边界：审查使用同一模型的独立只读会话，仅覆盖已列明六组条款；并非完整 ISO 符合性、供应商所有网络故障验证或业务专家认可。旧整图提案须继续对话重新生成，旧单步及待核对回执兼容保留。

## 本轮完整文件清单

保留先前未提交的实时方案及助手实现。本轮涉及以下实现、验证及文档；协议生成产物由同一生成器更新或核对一致性：

- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `apps/assistant/src/service.mjs`
- `apps/assistant/src/review.mjs`
- `apps/assistant/src/harness-sdk.mjs`
- `apps/assistant/src/harness-plugin.mjs`
- `apps/assistant/src/harness.mjs`
- `apps/assistant/skills/opm-standard-review/SKILL.md`
- `apps/assistant/skills/opm-standard-review/references/rules.json`
- `apps/assistant/test/service.test.mjs`
- `apps/assistant/test/review.test.mjs`
- `apps/assistant/README.md`
- `apps/web/src/shared/api/assistantApi.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `tests/e2e/workbench-assistant-live-plan.spec.ts`
- `tests/e2e/workbench-assistant-review.spec.ts`
- `tests/e2e/drivers/assistant-review-fault.mjs`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `specs/opm-assistant-validation-review-task-spec.md`
