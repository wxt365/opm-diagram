# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: `specs/opm-p03-element-placement-feature-expansion-bugfix-task-spec.md`

- [x] 已确认允许文件与禁止边界，无公共 API、数据库、依赖变更。
- [x] PLACE-01 实现及验证。
- [x] FEATURE-01 / FEATURE-02 实现及验证。
- [x] 定向验证、类型检查、lint、构建、差异检查并记录实际结果。

验证结果（2026-10-20）：

- 使用本机 Node 24.21.0 执行 3 个定向测试文件，137 项通过；Node 20.14.0 不满足现有 jsdom 的 ESM 运行要求，未修改项目依赖。
- 画布 vue-tsc、定向 ESLint、独立前端 Vite 构建、嵌入组件构建/声明生成均通过。
- 既有组件浏览器回归 2 项通过。
- Chrome 实际加载新构建的 X6 工作台，以内存 DraftSession 隔离业务数据：100%、50%、150% 缩放并平移后新增对象/过程，节点中心与可见区域中心偏差均为 0；连续新增 3 个属性保持可见，手动折叠后再新增属性自动展开；无 pageerror。该检查验证界面和命令编排，不代表真实后端持久化集成测试。
- 平台 vendor 组件升级到 0.2.2-platform.4，本地离线安装通过；平台 vue-tsc、Vite 构建通过。平台锁文件按原有规则保持忽略，不添加无关配置。
- 本地 3000 Vite 已重新启动并强制优化，HTTP 200 返回组件包含 getElementPosition；不需要重启后端。线上需构建并部署新的平台前端镜像。
- 两仓库 git diff --check 通过。助手既有改动及 .idea 未触碰，数据库无变更。
