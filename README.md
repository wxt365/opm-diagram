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
| 图文联动 | OPL 文本生成，以及通过 Trace 追踪模型来源 |
| 编辑与版本 | 草稿编辑、手动和自动保存、Revision 与只读永久链接 |
| 规则资产 | Profile binding，以及规则、符号和文本资产加载 |

已有实现不等于全部验收完成。完整规则校验、发布级验证和交付仍在推进；多人实时协作、动画仿真不是当前已交付能力。ISO 19450:2024 是设计参考和验证目标，当前不宣称完整标准符合性。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、Element Plus |
| 图形编辑 | AntV X6，自定义 OPM 节点与关系渲染 |
| 后端 | Java 21、Spring Boot 3、Maven Wrapper |
| 本地存储 | SQLite、Flyway |
| 验证 | Vitest、JUnit、Playwright、契约与发布验证脚本 |

## 本地开发

准备 **Node.js 22 LTS、npm 10 和 JDK 21**。仓库提供 Maven Wrapper，无需另外安装 Maven。以下命令以 macOS/Linux 为例，均在仓库根目录执行。

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

模型数据默认写入根目录的 `runtime-data/`，该目录不提交到 Git。`packages/profiles/` 是运行所需的规则资产，请保留。停止服务时，在两个终端分别按 `Ctrl+C`。

上述流程用于本地开发体验。正式发布还需要满足冻结的依赖输入和验证要求，不能以开发服务启动成功代替发布验收。

## 仓库结构

```text
apps/web/                 前端页面与建模工作台
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
