# 创建属性时的草稿冲突恢复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

## 目标与边界

修复平台代理包装导致 Draft 错误丢失，以及创建属性时草稿过期只能手动刷新的问题。
仅修改 apps/web 的错误解析、草稿读取恢复、创建 Feature 流程及回归测试；不改公共 API、数据库、依赖或其他编辑命令，不自动重发写命令。

## 验收与验证

- A1：识别平台包装的 Runtime 错误，保留 code/message/reason/retryable。
- A2：创建 Feature 的能力查询冲突时读取最新快照，重新查询一次，再按最新授权提交。
- A3：未保存布局、待确认提交、并发编辑或页面/选择变化时不覆盖本地状态、不提交原操作。
- A4：轮询发现远端草稿推进时，安全条件满足则同步快照，否则明确提示冲突。
- A5：通过定向 Vitest 回归、类型检查与组件构建。

## 实现顺序与清单

边界已确认；错误解析 → 安全快照同步 → 单次能力重试 → 回归验证。
验收引用：本文件 A1–A5。验证结果完成后记录。

## 验证结果

- localRuntimeApi.spec.ts 与 WorkbenchView.spec.ts：120/120 通过，覆盖代理错误解包、旧 token 0 → 新 token 1 的单次重试、持续冲突零写入、轮询同步、未保存布局保护及卸载竞态。
- vue-tsc -b、四个修改源码/测试文件的 ESLint：通过。
- build:workbench：通过，生成 0.2.2-platform.3。
- 本地平台依赖及 vendor 包更新为 0.2.2-platform.3；重启 3000 Vite 强制更新缓存，HTTP 200 返回的新优化组件包含错误解包和恢复逻辑。
- 未在主题 34 执行实际创建或写入操作；真实用户点击路径仍需在加载新版组件后确认。

平台接入范围：仅 apps/web-console/package.json、vendor/opm-workbench-0.2.2-platform.3.tgz 及本地安装/锁文件；Task Type: bugfix；Active Playbooks: frontend-vue (primary)。保留原有 platform.2 包及其他未提交修改。

## 回滚

撤回本次上述文件的差异并重新构建组件；不回滚其他已有修改，不涉及数据回滚。
