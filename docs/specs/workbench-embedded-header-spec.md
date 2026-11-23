# 嵌入工作台头部

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

执行：change / L3 / feature / none (primary)。当前 repo-profile、Task Type 和 playbook 文件缺失，遵循 AGENTS.md。

## 目标与非目标
嵌入页面复用现有工作台头部，显示宿主传入的项目名称和模型名称；默认隐藏 Profile 版本标签、草稿版本身份和版本选择器。原项目页面保持这些区域可见。
不修改宿主其他项目的文件，不改变版本/保存/校验语义，不修改后端协议、数据库或依赖。

## 边界与契约
允许修改 apps/web/src/workbench 的组件、SDK 参数、测试；WorkbenchSurface.vue、WorkbenchView.vue；组件打包脚本、示例与类型消费验证；相关 Playwright 测试、docs/specs 与 docs/integration。允许生成 dist-workbench 和根目录 opm-workbench-0.1.1.tgz。
禁止修改 services、profiles、.harness、公共后端 API/schema、依赖及无关文件。
新增可选 showProfile、showVersionControls 参数，嵌入默认 false，原宿主显式 true。showHeader 默认仍 false，宿主需启用后显示组件头部。项目导航禁用时仍显示项目名但不可点击。
context.project.name/model.name 为展示名称，宿主提供后优先于后端回读，不改变持久化名称；未提供名称仍使用后端或默认名称。构建包版本升为 0.1.1，保留原 0.1.0 安装包。

## 验收
- H1：嵌入启用头部后显示外部项目/模型名称及保存状态、校验入口，隐藏 Profile、版本身份与选择器。
- H2：原宿主保留 Profile 和版本区域及原有版本切换。
- H3：外部名称动态更新并在内部编辑回读后仍保持；未提供名称继续显示内部名称。
- H4：开关可显式启用，两种使用入口（Vue 与 JS SDK）及类型声明一致。
- H5：构建、相关回归、真实画布浏览器测试、公共类型检查通过，生成并核对 0.1.1 安装包。

## 验证与回滚
运行工作台组件及原宿主定向 Vitest、lint、typecheck、应用/组件构建、外部类型消费检查与独立 Playwright。原服务端联调环境不足时明确记录，不声称运行通过。
回滚本任务关联的参数/模板/文档与版本调整，外部项目重新安装 0.1.0 即可；无数据迁移。
