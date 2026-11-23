# 智能助手 Jenkins 容器构建补全

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

- Work Mode: change
- Risk Level: L2
- Task Type: bugfix
- Active Playbooks: none (primary)。本地没有 `.harness` 规则目录。

## 目标与边界

补齐现有助手 Jenkins 流水线引用但缺失的 Dockerfile，使用已在 Harbor 核实的 Node 22.22.0 镜像和内网 npm 仓库；提供可复制的流水线。

允许维护 `apps/assistant/Dockerfile`、根 `.dockerignore`、`Jenkinsfile.assistant`、本规格，并更新助手 README。不修改 API、数据库、模型配置、依赖清单、锁文件或已有业务代码；不读取/复制本地密钥，不修改 Jenkins、Harbor、Nacos 或 K8s，不提交或推送 Git，不触发构建。保留其他未提交变更。

## 验收

- A1：流水线通过 `inheritFrom` 复用构建日志已确认的 `node20` Pod 模板，镜像基础运行时固定为 `192.168.137.27/infra/node:22.22.0-bookworm-slim`；仍使用用户现有 Git、Harbor 和凭据配置。
- A2：从仓库根目录构建，只安装锁文件中的助手生产依赖，镜像包括源码、技能和源码引用的 schema，端口为 17860，默认监听 0.0.0.0，数据目录为 `/data/assistant`。
- A3：构建上下文不包含 `.env.local`、node_modules、运行数据或其他本地文件；镜像不包含模型密钥，密钥在部署时注入。
- A4：记录实际检查结果，明确本机没有 Docker，未执行 Linux 镜像构建和线上助手验证。
- A5：安装前仅将镜像中锁文件副本的 `registry.npmmirror.com` 地址定向到内网 npm 仓库，保留仓库路径、已有内网 URL、版本和 integrity，项目锁文件不变；输出下载/安装脚本日志，限制网络请求等待时间。失败时请求保留构建 Pod，节点丢失后的清理不覆盖原始构建结果。不能把该修复描述为已确定或解决 Pod 终止原因。

## 计划

1. 核实 Harbor 标签、现有锁文件及助手相对资源路径。
2. 用根锁文件和助手工作区清单执行定向 `npm ci`，新增所需构建文件，更新运行说明。
3. 执行 npm 安装计划检查、资源/构建上下文检查、助手健康接口检查及 diff 检查。
4. 针对 Jenkins 第4/5次构建反馈，修正已确认的公网下载地址和诊断配置；Pod 终止原因仍需 `devops` 下实际 Pod 事件确认。

## Checklist

- 边界确认：仅上述文件，不改既有工作。
- [x] A1：流水线与实际镜像核对。
- [x] A2：锁文件安装计划及资源、健康接口核对。
- [x] A3：构建上下文与部署配置分离检查。
- [x] A4：验证范围及未执行事项说明。
- [x] A5：内网地址替换与安装计划验证通过；失败诊断配置完成静态检查，实际 Pod 保留行为及终止原因须在线确认。

## 实际验证

- Harbor API 确认 `infra/node:22.22.0-bookworm-slim` 存在，镜像环境为 Node 22.22.0、Linux/amd64；内网 npm 仓库可返回 `@deepseek-ai/dsh@0.2.0-rc.2` 元数据。
- 在独立临时目录只复制根 package/lock 和助手 workspace 清单，执行 `npm ci --dry-run --offline --ignore-scripts --workspace=@opm/assistant --include-workspace-root=false --omit=dev --no-audit --no-fund` 成功，计划包含 605 个包，没有重装开发目录依赖。
- 检查镜像所需入口、技能及 schema 存在且构建上下文包含它们；本地环境文件、node_modules、运行数据、IDE/Git 文件和 JAR 均被排除。
- 使用已有本地依赖和独立临时会话目录启动助手，`GET /health` 返回 HTTP 200、`status=UP`；使用占位 Key，未请求模型或 Runtime。
- `git diff --check` 通过。本机没有 Docker/Podman/Groovy，未执行实际 Linux 镜像构建、Jenkins Pipeline 校验和 K8s/模型联调；内网是否缓存了所有 Linux 依赖仍以实际构建为准。
- 第4/5次构建均在 npm 安装期间丢失 `devops/node20-*` 构建 Pod，日志没有终止 reason/message；137 不能单独证明 OOM。与 `opm-dev` 下应用 PVC 未绑定问题分别处理。
- 本地 npm 实测：`--replace-registry-host=registry.npmmirror.com` 会丢失内网仓库路径，因此未采用该方案。改为执行 Dockerfile 中的实际 Node 脚本，仅改写临时锁文件副本：575 个公网下载地址转换正确，400 个已有内网地址不变，所有其他元数据（包括版本、integrity）不变，项目锁文件不变；`--replace-registry-host=never` 保留完整路径。
- 使用 Node 24 在隔离临时目录执行修改后的安装参数，`npm ci --dry-run --offline --ignore-scripts` 成功，计划包含 605 个包；没有进行实际依赖安装或 Linux 安装脚本验证。
- 从内网实际下载 `@deepseek-ai/dsh`、`dsh-tools`、`dsh-sdk-client` 的 0.2.0-rc.2 压缩包，均 HTTP 200，内容匹配项目锁文件的 integrity；这不代表所有 Linux 依赖及其安装脚本均可用。
- 已静态核对 `inheritFrom 'node20'`、`podRetention onFailure()` 和 post 清理异常处理。未连接 Jenkins/K8s，未执行线上配置修改或重新构建，Pod 被终止的原因仍待 `devops` 下实际事件确认。

## 回滚

撤回本次 Dockerfile 下载地址处理与诊断参数、Jenkins 模板继承/失败保留/清理处理及对应文档改动，保留此前构建文件和其他用户改动；不更改线上服务或数据。
