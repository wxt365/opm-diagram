# 地址与宿主关联清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec：docs/specs/workbench-address-binding-spec.md
边界确认：允许前后端新增嵌入契约及实例传输、配置、相关验证/文档；禁止 schema/迁移、资产、依赖、.harness。

计划：幂等关联编排 → JSON 会话/远程防护/CORS → 实例 API 与助手客户端 → 组件自动接入/SDK → 原兼容回归与跨源真实浏览器 → 文档与安装包。
不确定项：复用现有 Maven 缓存并使用已安装 Java 21；端到端测试采用隔离临时存储，不操作原数据。远程认证是部署级接入凭证，保留现有共享 Runtime 权限模型，多租户授权不在范围。

- [x] A1：Java 验证重试、改名、服务重启、并发、相同项目不同模型（含同名）、不同 systemId；模型永久删除后关联墓碑保留，不重建。
- [x] A2：binding 直接解析；归档/缺失报错；宿主数字开头身份可创建。
- [x] A3：自动 session/ensure/加载、bound 回传、父页面回传 binding 不重复连接、地址/身份切换迟到响应拒绝、名称更新不重建；原宿主 99 项通过。
- [x] A4：客户端及助手地址/会话隔离，绝对地址/根路径/前缀、原始提交字节及 SSE 解析测试通过；恢复队列按 Runtime 地址命名。
- [x] A5：远程 JSON 会话接入凭证/来源、域名、路径前缀 CORS、读取会话防护、旧 bootstrap 远程拒绝、默认本机防护和助手 HTTP 测试通过。
- [x] A6：前端全量、后端相关回归、浏览器、构建与包检查完成；既有业务失败已用 Git 原实现复现，详见下方。

## 实际验证

- `npm run test --workspace=@opm/web -- --silent`：54 个文件、455 项通过。最终地址校验调整后再定向运行 client/connection，7 项通过。
- `npm run typecheck --workspace=@opm/web` / `npm run lint --workspace=@opm/web`：通过。
- `npm run build --workspace=@opm/web` / `npm run build:workbench --workspace=@opm/web`：通过。原 bootstrap 外部脚本构建提示保留。
- `npx tsc -p apps/web/tsconfig.workbench-consumer.json`：公共包类型严格编译通过。
- `npx vue-tsc -p apps/web/node_modules/.tmp/opm-host-example-check/tsconfig.json`：简化 Vue 示例严格编译通过，临时检查配置被忽略。
- Java 21 Maven 使用现有 `.codex/runtime-maven-settings.xml` 与本机 Maven 缓存；相关测试初次扩大 123 项中 2 项失败。其中 Spring 配置测试的新依赖问题已修正并回归通过；旧 LocalApiService 基线用例用 Git HEAD 原实现独立编译复现同一失败。排除这一既有用例后 122 项全部通过。最终域名/路径前缀检查再定向运行 EmbeddedWorkspaceControllerTest，2 项通过。
- `node --test apps/assistant/test/http.test.mjs apps/assistant/test/runtime.test.mjs`：7 项通过。助手全量 108 项中 107 项通过，`用户明确排除的内容进入独立语义审查需求，不能被当作漏建` 在未修改的脑图逻辑中失败；用 Git HEAD 原 AssistantService 复现同一 `request.includes` TypeError。本次没有修改该业务或测试，不能声称助手全量通过。
- `npx playwright test --config=tests/e2e/playwright.workbench-connected.config.ts`：Chrome 1 项通过。浏览器直接连接 `192.168.31.167:17862` / `:17863`，实际验证 JSON 会话/CORS、首次关联、编辑、保存、校验、助手列表与 SSE、同 source 恢复及 binding 再次打开。隔离临时存储，不使用生产数据，不调用外部 AI 提供商。
- `npx playwright test --config=tests/e2e/playwright.workbench-component.config.ts`：Chrome 1 项通过，独立只读、多实例、样式和头部参数仍兼容。
- Runtime jar 构建通过：services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar。已安装 Java 21；构建插件缺少时经授权下载，没有新增项目依赖。
- `npm pack ./apps/web/dist-workbench --ignore-scripts --offline --json`：生成 opm-workbench-0.2.0.tgz，380157 字节、133 项；保留 0.1.0/0.1.1 包。
- `git diff --check`：通过。依赖锁、Profile、数据库 migration 和 .harness 没有修改。

限制：公网 HTTPS 证书、实际网关与宿主认证系统由部署环境验收；这里只做域名防护/HTTPS 地址规则测试和实际局域网 IP+端口联调。远程接入需要更新 Runtime/助手并一次性配置来源与接入凭证；默认本机模式不受影响。共享 Runtime 权限模型不等于多租户权限。根目录构建的既有生成文件换行检查问题未在本任务处理。

## 本任务完整清单

新增：
- apps/web/src/workbench/client.ts、client.spec.ts、connection.spec.ts
- apps/web/examples/workbench-connected.html
- services/local-runtime/src/main/java/org/opm/localruntime/api/EmbeddedAccessPolicy.java、EmbeddedCorsConfiguration.java、EmbeddedWorkspaceController.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/EmbeddedWorkspaceService.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/EmbeddedWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/EmbeddedWorkspaceServiceTest.java
- tests/e2e/drivers/workbench-connected-services.mjs
- tests/e2e/playwright.workbench-connected.config.ts、workbench-connected.spec.ts
- docs/contracts/opm-embedded-workspace.md
- docs/specs/workbench-address-binding-spec.md、workbench-address-binding-checklist.md

修改：
- apps/web/src/workbench/OpmWorkbench.vue、contracts.ts、index.ts、mount.ts、localRuntimeServices.ts
- apps/web/src/shared/api/localRuntimeApi.ts、assistantApi.ts、draftPendingStore.ts
- apps/web/scripts/package-workbench.mjs
- apps/web/examples/workbench-consumer.ts
- apps/assistant/src/server.mjs、runtime.mjs、service.mjs
- apps/assistant/test/http.test.mjs
- services/local-runtime/src/main/java/org/opm/localruntime/api/ApiWebConfiguration.java、LocalWriteRequestGuard.java、DraftWriteRequestGuard.java、LocalRuntimeBootstrapController.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/LocalApiRepository.java
- services/local-runtime/src/main/resources/application.yml
- tests/e2e/playwright.config.ts
- docs/integration/opm-workbench.md、examples/OpmWorkbenchHost.vue

生成且忽略：apps/web/dist-workbench、services/local-runtime/target、根目录 opm-workbench-0.2.0.tgz。验证期间在 test-results 生成过日志/临时基线，后续 Playwright 按默认行为清理该目录；验证结果以上述实际工具输出为准。
