# 工作台 0.2.1 本地打包

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: feature; Active Playbooks: none (primary)。仓库无 repo-profile 或对应 task-type/playbook。

## Spec

目标：生成包含当前源码（含草稿状态轮询优化）的 @opm/workbench 0.2.1 安装包，供宿主安装或后续发布。

非目标：不上传 npm/Nexus、不修改业务源码/API/schema/依赖、不构建部署后端、不重启服务、不修改运行数据。

允许范围：apps/web/scripts/package-workbench.mjs 的组件版本；apps/web/dist-workbench 构建产物；仓库根 opm-workbench-0.2.1.tgz；docs/integration 中相关版本和安装说明；本规格。验证允许临时目录和忽略的测试报告。不修改旧 tgz、.harness、依赖锁文件或其他文件。

契约影响：打包已有源码，无额外 API 变化。相对 0.2.0，已有优化要求自定义 WorkbenchRuntimeApi 提供 draftSaveState；默认地址/services 模式不需新增参数。

验收：A1 新包名称/版本正确且旧包保留；A2 ESM、runtime、CSS、声明入口齐全，声明不残留 @/ 别名，真实入口可加载；A3 同步安装与版本说明，明确后端仍需单独部署。

验证：执行 build:workbench（含声明编译）；npm pack；检查 tgz 内容、导出入口、声明路径和 SHA256；执行使用当前组件产物的浏览器组件测试（环境允许时）。本次仅版本/打包变化，不重跑已通过且源码未变的业务单元测试。

回滚：还原本次版本及文档修改；新 tgz 可由用户删除或继续使用旧 0.2.0；无需数据回滚。

## Plan

1. 将打包脚本版本设置为 0.2.1，修订当前版本说明。
2. 使用既有 library 构建和 npm pack 流程生成新包。
3. 验证发布内容及浏览器组件加载，记录结果。

## Checklist

边界确认：仅上述文件与产物，发布/部署/业务和数据修改均不执行。

- [x] A1（本文件#Spec）
- [x] A2（本文件#Spec）
- [x] A3（本文件#Spec）

## 实际验证结果

- `npm run build:workbench --workspace=@opm/web` 通过（包含 vue-tsc 声明编译）；沙箱阻止 esbuild 后经提权重试成功。
- `npm pack ./apps/web/dist-workbench --ignore-scripts --json` 成功：opm-workbench-0.2.1.tgz，380936 字节，134 个文件。旧版本包保留。
- Node 内置 zlib 解析归档验证通过：名称/版本、全部 exports 路径、129 个类型声明无 @/ 别名；归档内每个文件与构建目录逐字节一致；包含 save-state 实现。
- SHA256：`10a86899011cee800c0324af2962b8943a159015b1aeb5687cff2b512c456101`。
- `npx playwright test --config=tests/e2e/playwright.workbench-component.config.ts`：1 项通过，真实 X6 画布、多实例隔离、样式边界、切图/更新/卸载、只读无 API 请求验证。沙箱阻止浏览器进程后经提权重试成功。
- 未运行连接后端的浏览器测试，本任务未构建/部署后端；无业务源码变更，不重复业务单元回归。未上传仓库或重启已有服务。
