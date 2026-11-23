# Harness 0.2.2-rc.5 升级验证

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

验证日期：2026-11-20。规格：[Harness 升级](../specs/harness-0.2.2-upgrade-spec.md)。分支：`codex/harness-0-2-2-rc5`。保留升级前工作区的 259 项已有修改／新文件，未提交、合并或发布。

## 实现与兼容性

三个直接依赖 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-sdk-client`、`@deepseek-ai/dsh-tools` 均精确锁定为 `0.2.2-rc.5`，`npm ls --workspace @opm/assistant --depth=0` 已确认实际安装版本。

使用用户已通过 nvm 安装的 `/Users/xiaotaowang/.nvm/versions/node/v24.22.3/bin/node`，没有新装 Node 或更改默认别名；`~/.nvm/alias/default` 仍为 `22`。根 `.nvmrc` 声明项目版本，助手启动与 Harness 初始化要求至少 Node 24.9。桌面资源要求同平台、同架构的 Node 24 LTS，容器和 Jenkins 默认镜像调整为 `node:24.22.3-bookworm-slim`。

首次测试发现旧 `tools.config.mode: native` 已失效，现显式禁用 PTC executor、启用 native executor。继续禁用通用 shell、文件、搜索、代理等工具，保留各会话专用工具白名单及原模型请求防重定向边界。SDK 父类新增 Cordis 注入依赖，两个测试本项目 `createSession` 的单元测试改为显式构造最小实例；新增真实 SDK 测试覆盖实际父类初始化，未靠扩大 mock 掩盖接入失败。

## 实际验证

| 验证 | 结果与边界 |
| --- | --- |
| 助手全量回归 | Node 24 下 175 项通过，0 失败、0 跳过，含真实 SDK 及 DeepSeek 协议测试 |
| 相关前端回归 | 41 个文件、320 项通过，覆盖项目创建、目标、业务工作台、API 和编辑流程 |
| 桌面回归 | 12 项通过，覆盖生命周期、资源清单、配置与恢复；未生成安装包 |
| Web 构建 | 成功，保留既有 bundle 大于 500 kB 提示 |
| 真实 SDK 场景 | OPM、独立标准审查、OPM 脑图、业务建模、业务脑图、需求分析均验证精确工具集、工具回调、文本流、多轮及关闭重开 |
| 权限与中止 | 模型请求未授权 bash 不转发本地回调；关闭中止挂起请求并释放进程 |
| DeepSeek adapter | 实际 adapter 连接本机 Messages SSE，验证 `/anthropic/v1/messages`、禁用 thinking、工具调用及文本流 |
| 旧会话兼容 | 旧 0.2.0-rc.2 真实 SDK 创建的四种会话副本在新版恢复，多轮请求保留旧用户及助手历史，不暴露通用工具 |
| SQLite 集成 | 真实 Java、SQLite 与 SDK 验证目标传入模型上下文、脑图多轮、预览取消零写入、确认与来源一同保存 |
| 浏览器 OPM | 隔离模型中生成登记单，完成平台诊断与本机模拟标准审查、确认应用、保存、刷新恢复；最终修订 3、编辑序号 1 |
| 浏览器业务模型 | 隔离模型中生成登记单，正式结构核对、确认保存到修订 2；刷新后画布元素和“已保存”会话状态保留 |

所有模型响应均由本机模拟服务提供，使用真实 Harness SDK 和实际工具／持久链路。这些证据证明接入与状态流程，不证明外部模型理解或生成质量。外部模型实测此前因自动审批拒绝发送内部指引／Schema 而未执行，本轮未重试该传输。

最后一轮助手测试最初因沙箱禁止监听 127.0.0.1 报 EPERM，在获准的本机端口执行环境中重跑后 175 项全部通过。

复现命令（先在根目录 `nvm use`）：

```sh
npm test --workspace @opm/assistant
node node_modules/vitest/vitest.mjs run --root apps/web src/modules/projects src/stores/projectModel.spec.ts src/shared/api/localRuntimeApi.spec.ts src/modules/business
npm test --workspace @opm/desktop
npm run build --workspace @opm/web
npm ls --workspace @opm/assistant --depth=0
git diff --check
```

本机证据保留在 `/private/tmp/opm-harness-rc5-final-tests.log`、`/private/tmp/opm-harness-rc5-final-web-tests.log`、`/private/tmp/opm-harness-rc5-desktop-tests.log`、`/private/tmp/opm-harness-rc5-web-build.log`。浏览器截图为 `/private/tmp/harness-rc5-opm-saved.jpg` 和 `/private/tmp/harness-rc5-business-saved.jpg`。临时证据不作为永久交付资产提交。

## 服务与恢复

临时验收助手 17861 和前端 5181 已停止。常用助手 17860 已用 Node 24.22.3 重启，沿用原 `.env.local`、Runtime 17870 和 `/private/tmp/opm-business-assistant-conversations-20261119` 会话目录。最终健康检查：助手 `/health` 为 HTTP 200、UP、deepseek-flash；Java `/actuator/health` 为 HTTP 200、UP；常用前端 5180 `/projects` 为 HTTP 200。健康检查不调用外部模型。

升级前文件、依赖和用户会话备份在 `/private/tmp/opm-harness-rc5-baseline`；旧会话兼容仅对副本验证。回滚先停新版，只恢复升级差异与原依赖，使用 Node22 和升级前会话副本；保留原业务数据库，不覆盖前序未提交内容。备份路径位于临时目录，重启／清理前如需长期保留应另行归档。

未执行 Docker/Jenkins 构建或镜像推送，未验证内网 Node24 镜像，未重打 macOS／Windows 安装包。历史安装包仍包含原运行时。

## 本轮文件清单

- `.nvmrc`、`package-lock.json`、`Jenkinsfile.assistant`
- `apps/assistant/package.json`、`Dockerfile`、`README.md`
- `apps/assistant/src/harness.mjs`、`server.mjs`、`node-version.mjs`
- `apps/assistant/test/harness.test.mjs`、`service.test.mjs`、`mindmap.test.mjs`、`node-version.test.mjs`、`harness-sdk.test.mjs`、`harness-deepseek.test.mjs`
- `apps/desktop/scripts/prepare-resources.mjs`、`apps/desktop/README.md`
- `docs/specs/harness-0.2.2-upgrade-spec.md`、本验证报告

上述部分文件原本已有业务目标等未提交修改，升级只追加运行时、依赖和必要接入适配，未把已有业务改动重新归为本轮开发。
