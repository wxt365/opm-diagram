# opm-diagram

一个基于 **OPM（Object-Process Methodology，对象—过程方法论）** 的开源系统建模工具。

项目目标是做一个 [OPCloud](https://opcloud-sandbox.web.app/) 的开源替代实现：让大家能够在浏览器中建立 OPM 模型，同时查看图形和自然语言描述，并将工具部署在自己的环境中，按需要扩展规则、符号和功能。

本项目以 OPCloud 的建模体验为参考，独立实现，非 OPCloud 官方项目，也不是其源码分支。当前优先建设单用户、本地运行的建模工作台。

## OPM 是什么？

OPM 用对象、过程及其关系描述一个系统：系统中有什么，这些事物处于什么状态，以及过程如何创建、消耗或改变它们。

- **对象（Object）**：用矩形表示，例如订单、产品、原料。
- **过程（Process）**：用椭圆表示，例如生产、审核、运输。
- **状态（State）**：描述对象的状态，例如订单的“待审核”和“已通过”。

同一个模型有两种表达：**OPD（Object-Process Diagram）图形**和 **OPL（Object-Process Language）自然语言文本**。例如，图中“生产消耗原料”的关系会对应一条文本描述；文本的来源可以追踪到具体模型元素。

这使它适合用来描述业务流程、产品结构、系统行为，以及这些内容之间的联系。图形编辑、关系语义和文本生成都围绕同一份语义模型工作。

## 我们想做什么？

让 OPM 建模工具能够被学习、使用和持续改进：

- **可本地部署**：模型数据保存在自己的环境中。
- **图文一致**：通过图形建立模型，生成可追踪的 OPL 文本。
- **可扩展**：通过 Profile 管理规则、符号和文本生成资产。
- **可验证**：为建模、保存、重开和发布建立自动化验证证据。

长期目标是逐步完善面向系统建模的开源工具，而当前开发重点是把基础建模和本地数据保存做好。

## 当前能力与状态

项目处于持续开发阶段，已经具备本地前后端工作台。当前代码包含：

| 领域 | 已有实现 |
| --- | --- |
| 项目与模型 | 创建、打开项目和模型，本地存储与重开 |
| 元素编辑 | 对象、过程、状态、属性和操作的建模，以及名称、位置和删除操作 |
| 关系建模 | 程序关系、控制装饰和结构关系；源到目标连线、关系参数编辑与删除 |
| 画布交互 | 元素选择、拖动、画布平移与缩放 |
| 展示与分析 | 元素配色与外观、手工关系路由、图谱分析与图形导出 |
| 图文联动 | OPL 文本生成，以及通过 Trace 追踪模型来源 |
| 编辑与版本 | 草稿编辑、手动和自动保存、Revision 与只读永久链接 |
| 规则资产 | Profile binding，以及规则、符号和文本资产加载 |
| 智能助手 | 基于 DeepSeek 的多轮建模对话、实时预览、诊断与确认后提交 |
| 脑图分析 | 模型级脑图编辑、独立保存、JSON 交换与单 OPD 转换 |
| 桌面客户端 | Electron 壳、受管本地服务、设置、工作区与备份恢复；尚未发布签名安装包 |

已有实现不等于全部验收完成。完整规则校验、发布级验证和交付仍在推进；多人实时协作、动画仿真不是当前已交付能力。ISO 19450:2024 是设计参考和验证目标，当前不宣称完整标准符合性。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、Element Plus |
| 图形编辑 | AntV X6，自定义 OPM 节点与关系渲染 |
| 后端 | Java 17 及以上、Spring Boot 3、Maven Wrapper |
| 本地存储 | SQLite、Flyway |
| 验证 | Vitest、JUnit、Playwright、契约与发布验证脚本 |

## 本地开发

准备 **Node.js 24 LTS（至少 24.9）和 JDK 17 或以上版本**；有 nvm 时先执行 `nvm use`。桌面资源按来源契约使用 Java 17 和 Node 24。仓库提供 Maven Wrapper，无需另外安装 Maven。以下命令以 macOS/Linux 为例，均在仓库根目录执行。

```bash
git clone https://github.com/wxt365/opm-diagram.git
cd opm-diagram
npm install
```

在第一个终端启动后端：

```bash
./mvnw -pl services/local-runtime spring-boot:run \
  -Dspring-boot.run.main-class=org.opm.localruntime.LocalRuntimeApplication \
  -Dspring-boot.run.workingDirectory="$PWD"
```

在第二个终端启动前端：

```bash
npm run dev --workspace=@opm/web -- --host 127.0.0.1 --port 5173 --strictPort
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。后端默认监听 `127.0.0.1:17850`，前端开发服务代理 API 和启动配置请求，因此需要同时启动前后端。

模型数据默认写入根目录的 `runtime-data/`，该目录不提交到 Git。SQLite 是本仓库唯一存储实现，不需要外部数据库。`packages/profiles/` 是运行所需的规则资产，请保留。停止服务时，在两个终端分别按 `Ctrl+C`。

本次来源采用 SQLite 2.0 存储基线，旧 V1～V8 项目不能直接套用新 Flyway 基线。新版本会拒绝直接升级旧库；先停机备份，再按 [SQLite 升级说明](docs/integration/sqlite-storage-upgrade.md)显式转换到全新目录，原库保留不动。迁移代码不会读取或升级你的真实数据。

上述流程用于本地开发体验。正式发布还需要满足冻结的依赖输入和验证要求，不能以开发服务启动成功代替发布验收。

### 可选：启动智能助手

在第三个终端配置并启动助手服务：

```bash
cp apps/assistant/.env.example apps/assistant/.env.local
chmod 600 apps/assistant/.env.local
# 在 .env.local 中填写自己的 DEEPSEEK_API_KEY，再启动服务。
npm run assistant:dev
```

助手默认监听 `127.0.0.1:17860`，使用 `deepseek-flash`。真实生成会调用 DeepSeek API；密钥仅放在服务端本地文件，`.env.local` 已被 Git 忽略，不要写入前端代码或提交。无密钥仍可使用基础建模工作台与手工脑图编辑。助手会话与模型数据库需共同备份；生成和标准审查结果仍需用户核对。

更多说明见[智能助手文档](apps/assistant/README.md)，包括服务更新、数据恢复和能力边界。桌面开发、资源准备和验证边界见[桌面客户端说明](apps/desktop/README.md)。不要删除恢复标记或用旧程序直接打开新数据库。

## 上游功能迁移策略

本仓库只维护 OPM 建模工具。同步本地上游时，以文件及依赖闭包为单位迁移，禁止直接覆盖整个仓库：

- 迁入 OPM 的对象、过程、状态、关系、OPD/OPL、Trace、脑图、OPM 助手及其测试和设计契约；图谱分析、共享交互和 Electron 桌面能力属于可迁移范围。
- 存储只保留 SQLite 的项目隔离、事务、历史、保存与备份能力。混合文件须去除 PostgreSQL 分支；不引入 PostgreSQL 驱动、Nacos、Jenkins 内网配置或私有镜像地址。
- 不迁移独立业务语义建模模式、业务语言与业务助手、本体生成与治理、业务专用布局包，以及它们的路由、API、表结构和资源。OPM 模型中的业务场景名称或建模目标不属于被排除的独立产品功能。
- 共享组件只有在 OPM 确实依赖时才迁入；去掉对业务模块的反向依赖，并补充业务入口不可用的回归。来源已提交和未提交内容都先记录文件摘要；来源测试报告只作历史参考。
- 本仓库的项目介绍、Maven Wrapper、忽略策略和既有修复独立保留。`AGENTS.md` 和 `package-lock.json` 按仓库现行约定仅在本地保留。
- `.env.local`、API key、证书、用户数据库、助手会话、构建产物及安装包不进入版本库。提交前扫描实际密钥和暂存文件，迁移和测试仅操作隔离数据。

迁移结束须在本仓库重新运行前后端、助手和桌面相关验证；开发测试通过不代表签名发布、跨平台安装验收或完整标准符合性。

## 仓库结构

```text
apps/web/                 前端页面与建模工作台
apps/assistant/           智能建模与脑图分析助手服务
apps/desktop/             Electron 桌面壳、本地服务管理与工作区备份
services/local-runtime/  后端 API、语义编辑、文本生成与本地存储
packages/profiles/       Profile、规则、符号、文本和 Golden 资产
docs/                    需求、设计、契约、检查清单与验证报告
specs/                   开发任务规格
scripts/                 契约检查、构建与发布工具
tests/                   端到端及发布验证用例
```

## 设计文档与参与方式

- [文档索引](docs/README.md)
- [需求说明](docs/requirements/opm-online-modeling-tool-requirements.md)
- [模块设计](docs/design/opm-modeling-tool-module-design.md)
- [开发技术基线](docs/design/opm-development-technology-baseline.md)
- [OPD 渲染架构](docs/design/opm-opd-node-renderer-architecture.md)

欢迎通过 [Issues](https://github.com/wxt365/opm-diagram/issues) 提交使用问题、建模案例和功能建议，或通过 Pull Request 参与开发。涉及模型语义、关系规则或数据格式的修改，请先对照现有设计与契约，并补充相应验证。
