# 生成指导 Skill 与建模质量诊断

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：将参考平台的过程中心、概念复用、对象/过程/状态选择及可读性方法转化为本平台生成指导 Skill；在整图最终审查流程提供可定位、可保存的建模质量建议。实时预览与一次确认继续使用当前 Runtime 契约。

非目标：跨图自动生成、语义合并/删除、细化深度强制要求、标准全文扩展、CWOPM 格式导入、平台数据库及草稿 API 变更、新依赖、自动提交代码。

允许：apps/assistant 的项目内 Skill、生成/诊断编排、助手测试和说明；apps/web 的助手 API 类型、面板与组件测试；tests/e2e 独立测试模型用例；本规格及对话式助手设计。禁止修改其他平台 Skill、`.harness/`、数据库 schema、Java Runtime、依赖、密钥与用户已有模型；保留全部已有未提交变更。助手 HTTP 提案新增可选 quality 字段，旧历史缺字段仍可读取和确认，不新增工具写入权限。

契约：生成指导随建模轮和修正轮注入，审查轮继续独立只读。质量建议与 ISO 报告分开，不伪造条款；确定性诊断针对当前图投影，绑定方案摘要、指导 Skill/策略版本与来源摘要。命名、同名不同身份、孤立/无变换过程、节点密度、节点间距与长连线为非阻断建议，不自动合并元素、不因建议强制修正或拒绝确认。方案变化后清除旧诊断，最终重新计算；取消/停止/失败及真值提交边界保持既有行为。质量阈值由服务端版本化策略文件配置，不接受模型更改安全边界。

验收：GQ-01 生成和修正实际加载独立指导 Skill，读模型工具返回当前质量策略；GQ-02 当前图诊断覆盖命名/身份/关系与可读性，合法同名/复合关系不被误判为平台错误；GQ-03 面板区分质量建议和标准错误，旧历史兼容，持久化/修正后重算；GQ-04 真实 deepseek-flash 画布流程、一次确认、刷新恢复通过，质量警告不阻断合法方案。

验证：指导 Skill frontmatter/链接与加载检查、质量规则与生命周期测试、助手 HTTP/审查边界回归、Vue 组件与工作台回归、typecheck/lint/build；在独立项目进行真实生成及质量警告浏览器验证，保存诊断证据与截图并检查实际渲染。无法执行项如实记录。

回滚：撤销本轮助手和前端修改。旧历史及已应用模型保留，新增可选 quality 字段可被旧面板忽略，不需要数据迁移。

## Plan

复用现有 Skill 固定注入、ModelPlan 预览和最终报告存储扩展点。独立质量模块加载指导与策略，基于模型投影生成建议，不将显示偏好加入标准错误。先完成诊断和服务端集成，再扩展面板与真实画布测试，最后同步文档。

## Checklist

引用本文件 Spec，允许/禁止边界、可选 HTTP 字段兼容、无跨图写入和建议不阻断已确认。

- [x] GQ-01：建模与修正轮加载生成指导，read_model 返回版本化策略；独立标准审查不加载生成指导。
- [x] GQ-02：规则测试覆盖身份、命名、过程关系、密度、间距和跨度；合法同名、多条事实及对象内部状态不被误判为阻断错误。
- [x] GQ-03：组件和服务测试覆盖旧历史兼容、建议不阻断、标准错误阻断、保存恢复与修改后重新绑定方案摘要。
- [x] GQ-04：真实 deepseek-flash 完整咖啡建模及同名/指定重叠布局验证通过，确认、刷新和服务重启恢复通过。

## 验证记录

2026-10-05 实际验证：

- `npm run assistant:test`：33 项通过。日志 `/private/tmp/opm-quality-assistant-test.log`。
- 前端定向测试：AssistantPanel 12 项、assistantPreview 3 项、WorkbenchView 92 项，共 107 项通过。日志 `/private/tmp/opm-quality-web-test.log`。
- Web typecheck、lint、production build 通过；构建保留既有 `/opm-bootstrap.js` 非 module 提示。
- Skill frontmatter、名称、描述、占位与引用检查通过，采用现有 Node yaml 检查。原 quick_validate.py 所需 PyYAML 不可用，未安装依赖，未宣称该脚本通过。
- 真实浏览器主验证：2 项通过，耗时 2.3 分钟。咖啡流程覆盖实时预览、平台诊断和独立标准审查、确认前续聊重算、稳定身份、一次提交、刷新保存、取消、停止及冲突拒绝；质量用例保留两个不同身份的同名设备及用户指定重叠坐标，报告身份与间距建议且允许确认，保存刷新后保留报告，窄屏无页面错误。日志 `/private/tmp/opm-quality-e2e.log`。
- 实际重启助手后浏览器恢复验证：1 项通过，耗时 7.5 秒。恢复同一会话及已应用方案的质量/标准报告，摘要绑定正确；调用真实 DeepSeek 只读解释磨豆和冲泡，不更改模型。日志 `/private/tmp/opm-quality-resume-e2e.log`。
- 已查看咖啡标准审查、质量建议桌面和 390px 窄屏截图。故意重叠的设备保持重叠，面板说明核对身份和可读性建议；窄屏报告可读。
- 本轮 14 个文件的本地 Markdown 引用与疑似密钥扫描通过；`git diff --check` 通过。Java Runtime、草稿公共契约及数据库未在本轮修改，未重复其测试；不将此前其他任务的测试计入本轮。

浏览器命令使用外部已运行服务：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/private/tmp/opm-assistant-proof.json \
  npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-assistant-live-plan.spec.ts tests/e2e/workbench-assistant-quality.spec.ts \
  --grep '一次需求|真实助手保留' --output=/private/tmp/opm-assistant-generation-quality-e2e

OPM_E2E_EXTERNAL_SERVERS=true \
  OPM_ASSISTANT_LIVE_RESUME_PROOF='/private/tmp/opm-assistant-generation-quality-e2e/workbench-assistant-live-p-dfeb5-实时生成完整咖啡图，结束统一确认，取消零写入并保存恢复/assistant-scope.json' \
  npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-assistant-live-plan.spec.ts --grep '服务重启后' \
  --output=/private/tmp/opm-assistant-generation-quality-resume-e2e
```

证据目录 `/private/tmp/opm-assistant-generation-quality-e2e` 包含 `assistant-scope.json`、`quality-proof.json` 与桌面/窄屏截图；恢复用例使用独立输出目录以保留主验证身份文件。验证只证明上述本机业务流程、部分标准审查及质量建议行为，不代表完整 ISO 19450 符合性或跨图自动生成已实现。

## 本轮文件清单

以下清单仅记录本轮目标文件，保留仓库此前已有未提交修改，不代表整个工作区差异均属于本轮：

- `apps/assistant/skills/opm-modeling-guide/SKILL.md`
- `apps/assistant/skills/opm-modeling-guide/references/quality-policy.json`
- `apps/assistant/src/quality.mjs`
- `apps/assistant/src/service.mjs`
- `apps/assistant/test/quality.test.mjs`
- `apps/assistant/test/service.test.mjs`
- `apps/assistant/README.md`
- `apps/web/src/shared/api/assistantApi.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `tests/e2e/workbench-assistant-live-plan.spec.ts`
- `tests/e2e/workbench-assistant-quality.spec.ts`
- `docs/design/opm-conversational-modeling-design.md`
- `specs/opm-assistant-generation-quality-task-spec.md`
