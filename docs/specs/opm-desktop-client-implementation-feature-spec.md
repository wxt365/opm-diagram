# 桌面客户端实现规格

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

日期：2026-11-16。Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：backend-springboot (primary)、frontend-vue、testing。

## 目标与非目标

实现[桌面需求](../requirements/opm-desktop-client-requirements.md)和[设计](../design/opm-desktop-client-design.md)的可运行主路径、数据与生命周期、可选 AI 及三平台构建入口。复用现有 Web、Java Runtime、SQLite 和助手，不复制业务规则。

本轮不签名发布、不覆盖真实本机数据库、不将开发者 Key 打包、不升级 schema、不实现自动更新或云同步。先验证源代码和开发态桌面，不将未执行的安装包、Windows 或 Intel Mac 测试标为通过。安装器脚本可交付；签名、公证及最终安装器构建在发布环境执行。

## 允许与禁止范围

允许新增 `apps/desktop/**`，修改根 `package.json/package-lock.json` 和忽略规则以增加 Electron 及 Forge 工具；允许后端新增受桌面开关控制的启动握手/父进程监护、相关测试；允许助手随机端口修正和桌面入口；允许 Web 新增桌面设置与退出桥接、窄类型声明及测试；允许同步桌面文档与清单。新增依赖限 Electron、Forge CLI 与 macOS/Windows maker，准确版本通过官方 npm 元数据锁定。

禁止改 `.harness`、HTTP 建模/交换 schema、数据库 schema/migration、OPM 领域规则、原有 Web/K8s 部署行为、其他模块、真实数据或现有服务进程。前序助手和 Skill 改动原样保留；修改同一文件时仅叠加桌面需要的变化。

## 决策和契约影响

- Electron 45.3.2、Forge 8.0.1（2026-11-16 官方 npm 元数据），使用现有 Node 22.22.0 工程环境；后端保持 Java 17 编译，不调整语言版本。
- 新增桌面专用 ready-file 协议 v1（component/nonce/pid/port/protocol）及 stdin 心跳/退出；未启用桌面参数时不产生副作用。不新增公开关闭 HTTP API。
- 网关首次随机分配端口并持久保存，使重开时 IndexedDB 恢复信息的 origin 稳定；后端与助手每次随机端口。入口冲突安全失败，不改端口隐藏恢复信息、不抢其他进程。现有 HTTP/SSE、会话、幂等和 DraftToken 保留。
- SQLite 使用独立用户目录；备份只在所有受管服务已关闭后执行，升级前备份发生在启动新 Runtime 前。恢复用同一文件系统 staging 与回退日志。
- 新增 preload 窄桥接，不暴露任意进程、路径、数据库或请求代理；Web 无桥接时行为不变。

## 验收

- A1：桌面窗口可从构建后的 Web 和资源包运行，无 Vite/全局 Java/Node 依赖；资源缺失明确失败，不附着用户已有服务。
- A2：网关路径/同源/SSE/取消/错误透传受测试保护；不开放未知路由、目录穿越和任意目标代理。
- A3：随机端口 ready 协议校验身份，父进程断开回收服务；无桌面参数时现有运行不变；重复启动/退出协调不静默丢弃编辑或应用 AI 提案。
- A4：SQLite 隔离目录、重开持久化、一致性备份/恢复、坏备份拒绝和升级前备份；不改真实数据。
- A5：设置显示版本/数据目录，安全保存/清除 Key；未配置和 AI 失败不阻断核心；独立 Node 可启动助手/Harness，保留原模型权限。
- A6：macOS arm64/x64、Windows x64 构建配置及资源装配有锁定清单、版本/哈希、架构检查与敏感文件排除；本轮不声称签名发布通过。
- A7：定向单元、后端、Web 类型/构建与本机真实 Electron smoke；记录不能运行的平台、证书和环境限制，验收项不虚报完成。

## Plan / 边界确认

1. 保存变更基线，先实现可独立测试的网关、进程握手/监护、设置、锁和备份。
2. 接入 Electron 窗口、设置/退出窄桥与 Web 复用；加入后端及助手条件启动适配。
3. 装配随包资源，提供 Forge 配置与命令；以隔离工作区执行本机 Electron/SQLite 主路径。
4. 运行相关回归，更新说明、需求状态、清单和未验证项。

用户已要求根据既定设计开始实现。边界确认：可新增上述依赖与桌面配置、内部启动协议及窄桥，不修改公共建模 API/schema、真实数据或当前服务。

## 验证与回滚

Node test 覆盖网关、安全边界、握手、备份/恢复与凭证；JUnit 覆盖桌面监护/ready；Vitest/类型检查覆盖 Web 桥和退出协调。真实 Electron 使用临时用户数据，创建和编辑模型并重启核对；真实 AI 调用仅使用隔离测试内容且密钥不输出。安装器、Windows、Intel Mac、签名/公证未执行时如实记录。

回滚仅撤销本轮文件/补丁及依赖锁增量，保留前序未提交修改。桌面数据与开发数据库隔离；schema 未变，不回写或清理任何用户数据。

## 本轮文件清单

下列为桌面实现涉及的完整文件清单；前序脑图与 Skill 修改不属于本轮，保持原有内容。桌面需求/设计文档沿用并更新，原设计规格/清单保留。

- `apps/assistant/src/desktop-entry.mjs`
- `apps/assistant/src/server.mjs`
- `apps/desktop/.gitignore`
- `apps/desktop/README.md`
- `apps/desktop/forge.config.cjs`
- `apps/desktop/package.json`
- `apps/desktop/scripts/prepare-resources.mjs`
- `apps/desktop/scripts/smoke.mjs`
- `apps/desktop/src/files.mjs`
- `apps/desktop/src/gateway.mjs`
- `apps/desktop/src/main.mjs`
- `apps/desktop/src/managed-process.mjs`
- `apps/desktop/src/preload.cjs`
- `apps/desktop/src/resources.mjs`
- `apps/desktop/src/runtime.mjs`
- `apps/desktop/src/settings.mjs`
- `apps/desktop/src/squirrel.mjs`
- `apps/desktop/src/workspace.mjs`
- `apps/desktop/test/assistant.test.mjs`
- `apps/desktop/test/gateway.test.mjs`
- `apps/desktop/test/process.test.mjs`
- `apps/desktop/test/resources.test.mjs`
- `apps/desktop/test/settings.test.mjs`
- `apps/desktop/test/upgrade.test.mjs`
- `apps/desktop/test/workspace.test.mjs`
- `apps/desktop/ui/settings.css`
- `apps/desktop/ui/settings.html`
- `apps/desktop/ui/settings.js`
- `apps/desktop/ui/startup.html`
- `apps/web/src/app/App.vue`
- `apps/web/src/env.d.ts`
- `apps/web/src/layout/AppLayout.vue`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/shared/desktop.spec.ts`
- `apps/web/src/shared/desktop.ts`
- `docs/README.md`
- `docs/checklists/opm-desktop-client-implementation-feature-checklist.md`
- `docs/design/opm-desktop-client-design.md`
- `docs/requirements/opm-desktop-client-requirements.md`
- `docs/specs/opm-desktop-client-implementation-feature-spec.md`
- `package-lock.json`
- `package.json`
- `services/local-runtime/src/main/java/org/opm/localruntime/desktop/DesktopBackupVerifier.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/desktop/DesktopLifecycle.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/desktop/DesktopProcessProtocol.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/desktop/DesktopProcessProtocolTest.java`
