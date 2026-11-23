# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/subdiagram-reorganization-spec.md

边界确认：方案契约/运行时/助手/前端/相关测试与任务文档；不增代码编辑权限、依赖、DB schema或直接改用户数据。

- [x] SUB-01：真实 MVC 子图预览不写库，重复预览完整响应相同，子图/出现身份稳定。
- [x] SUB-02：语义 elements/facts 不变，内部关系下沉，跨边界 Effect/所属对象/状态仍可见且共享 target_id；父元素/外图/已有细化成员拒绝。
- [x] SUB-03：既有 draft journal 原子一次提交，重试正文不变、版本冲突拒绝；后置错误不部分提交。
- [x] SUB-04：受限 stage_subdiagram 及 SDK 建模允许列表，审查仅 read_review_model/submit_review；全部受影响图 CURRENT 并有对应 OPL，缺少任一图完整审查拒绝确认。
- [x] SUB-05：前端主图/子图选择预览，保留正式画布；一次“确认父子图重组”按钮复用原有确认与回执流程。
- [x] SUB-06：Skill 1.4.0 按运行时 affected_views 能力启用，旧运行时拒绝工具并只建议；不开放代码编辑。

验证：后端草稿53/53；前端预览及助手面板30/30；能力/审查20/20；注入模型工厂的服务定向11/11；契约18/18；HTTP/质量9项通过；typecheck、正式生成器--check、git diff --check通过。SDK真实权限运行测试及真实模型生成未执行，因npm镜像和官方域名DNS失败、对应SDK包未缓存。

运行：前期依赖恢复因服务占用和DNS失败受阻；后通过用户提供的内部源 http://192.168.137.26:8080/repository/npm-public/ 恢复854个锁定依赖，临时下载地址结束后还原，package.json/package-lock.json无变更。2026-10-10恢复SDK及harness模块加载成功，SDK权限/子图确认定向7/7，harness及审查19/19，前端30/30、typecheck、正式生成器检查通过。服务已启动，两个LAN页面及Runtime/助手健康200。缺SDK阻碍已解除；未调用用户真实模型或完成其方案审查/确认，不把健康检查当实际生成完成。

完整变更范围：scripts/generate-draft-workspace-contract.mjs、scripts/draft-workspace-contract.test.mjs；docs/contracts/{schemas/opm-draft-workspace-v02.schema.json,openapi/opm-draft-workspace-v02.json}；services/local-runtime/src/main/{java/org/opm/localruntime/application/{DraftModelPlan.java,DraftSubgraphReorganization.java,DraftWorkspaceService.java},java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java,resources/draftsave/draft-workspace-v02.schema.json}；services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java；apps/assistant/src/{modeling-context,harness-plugin,harness-sdk,service,tools,plan-finalizer,proposal-application,review-scope,review}.mjs；apps/assistant/test/{modeling-context,review-scope,service}.test.mjs；两份Skill及其版本参考文件；apps/web/src/modules/workbench/{AssistantPanel.vue,WorkbenchView.vue,assistantPreview.ts,assistantPreview.spec.ts}；apps/web/src/shared/api/{assistantApi.ts,generated/draftWorkspaceContract.ts}；本规格/清单。前序Skill逻辑对齐新增文件保留。
