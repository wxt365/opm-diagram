# 两种建模方式共享业务目标并接入助手

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L3；Task Type: feature；Active Playbooks: frontend-vue（primary）、backend-springboot、testing。

## 目标与边界

G1：创建业务语义或 OPM 模型均可填写业务目标与范围，切换方式保留输入，目标实际保存。
G2：OPM 助手每轮从受保护的运行时读取当前模型目标，建模、脑图分析和转换使用同一背景；空目标不阻断。目标是业务背景，不是权限、工具指令或新增事实依据。
G3：创建弹框、模型卡片及业务工作台标题不直接展示业务语言版本号。内部协商及显式升级操作保留版本信息。

允许：项目创建 UI／store／API 封装与测试，业务工作台标题，OPM workspace-session 响应和 OpenAPI，助手运行时与提示上下文及测试，规格／设计／验证文档。禁止：数据库 schema、依赖、鉴权、业务语义和 OPM 形式化模型契约、无关弹框／功能重构、现有用户模型修改。

## 契约与兼容

复用 OPM createModel 已支持的 description，SQLite model_catalog 已有列；无迁移。workspace-session 的 model 增加可选 description（服务返回空串兼容旧模型），列表和其他响应无需新增必填字段。前端 createModel 增加可选描述参数；旧两参数调用继续有效。助手从 workspace-session 获取背景，每轮 snapshot 重读并验证模型身份，不从浏览器历史消息猜测目标；失败明确报错，不静默丢目标。业务助手沿用 header.description 链路。

OPM 目标当前保存在模型目录元数据，不改变图语义、历史修订或 OPL；本轮不新建 OPM 目标编辑入口及跨环境交换协议。业务目标不授权重画、扩展范围、编造关系，冲突须澄清。版本隐藏仅影响常规标签，技术详情／升级仍可显示版本。

## Plan / Checklist

- [x] 已读创建链路、workspace 服务和助手 snapshot／提示链；允许与禁止边界确认。
- [x] G1：共用输入及实际传参，两种模式保存、切换保留通过回归与浏览器验证。
- [x] G2：响应契约、后端和助手接入；空值、最新值、跨模型身份、旧运行时提示及两种助手模式测试通过。
- [x] G3：隐藏常规标签技术版本，保留升级路径。
- [x] 上游历史记录声明已完成自动化与隔离验证；原混合产品报告未迁入。目标端 OPM 验证见[选择性迁移报告](../reports/opm-selective-source-migration-20261123-report.md)，不继承业务建模验收状态。

## 验证与回滚

Web 项目、store、API 和业务工作台定向测试；Java LocalApiService／相关边界；助手全回归及本机模拟模型请求核对。浏览器检查两模式输入、隐藏版本及 OPM 创建。禁止外发内部模型内容，外部模型理解质量不作为本轮已通过结论。
回滚仅撤回本轮前后端与提示改动，已保存 description 保留；旧代码忽略新响应字段，无需删除数据。运行时先更新再重启助手，避免新助手读取旧接口静默漏目标。
