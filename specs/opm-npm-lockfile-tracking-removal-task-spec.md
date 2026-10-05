# npm 锁文件版本库跟踪移除

日期：2026-10-05。Work Mode：change；Risk Level：L3；Task Type：bugfix；Active Playbooks：none（primary）。

## 目标与边界

按用户要求，删除版本库中的根 `package-lock.json`，忽略本地安装重新生成的根锁文件。当前该文件已经在磁盘上缺失，但仍被 Git 跟踪；根 `.gitignore` 还有强制提交例外。

允许修改：根 `.gitignore`、本文，以及根 `package-lock.json` 的索引状态。非目标及禁止范围：修改依赖声明、安装其他依赖、改写公共 API/Schema 或冻结发布契约、调整发布 runner、清理数据、删除其他路径及修改 `.harness/`。本次不提交或推送。

## 契约影响

锁文件用于统一完整依赖解析；不同开发人员生成差异不代表它本应是机器私有文件。本次依据用户明确偏好取消跟踪。

现行发布链将受到影响：`specs/opm-dev-canvas-06-toolchain-release-task-spec.md` 要求 clean source checkout 包含锁文件，并执行 `npm ci --ignore-scripts && npm run build`；`scripts/release-canvas06-e2e-manifest-v01.mjs`、`scripts/verify-canvas06-e2e-manifest-v02.mjs`、`scripts/release-canvas06-recovery-manifest.mjs` 和 Golden Plan/DEV-CANVAS-05 Handoff 同时读取、复制或核验该文件及其 SHA-256。删除后，干净克隆的现行发布流程不能通过，不提升任何 Gate。

开发安装可执行 `npm install`，重新生成的锁文件将留在本地。若继续采用不提交锁文件的策略，发布设计需明确一个可复核、可获取的依赖解析输入及其冻结身份，再同步安装命令、Manifest 和 verifier；本次不临时生成随机依赖解析来替代发布输入。

## Plan

1. 将原 `!package-lock.json` 例外替换为根 `/package-lock.json` 忽略规则。
2. 仅从 Git 索引移除该文件。
3. 检查忽略规则、索引范围、依赖声明无差异和 whitespace。

## 验收与验证

- LF-01：根锁文件退出索引，重新生成后不会自动纳入提交。
- LF-02：唯一 staged 变更为根锁文件删除，不修改已有源码、依赖和冻结发布契约。
- LF-03：`git diff --check`、`git diff --cached --check` 通过；已记录现行发布阻断。

不运行应用测试或完整发布矩阵：本次仅改变版本库规则，且发布输入缺失已经由源码明确检查。验证不能表述为发布通过。

## Checklist

引用：本文 LF-01～LF-03。

- [x] 边界确认：用户明确要求移除锁文件；发布契约影响已核对并告知。
- [x] LF-01：`git check-ignore -v` 命中根忽略规则，`git ls-files -- package-lock.json` 为空。
- [x] LF-02：唯一 staged 变更为根锁文件删除；根与前端 `package.json` 均无差异。
- [x] LF-03：两项差异检查通过；现行发布输入缺失及后续设计调整要求已记录。

## 回滚

撤销本任务 `.gitignore` 修改，从 `HEAD:package-lock.json` 恢复锁文件及索引，或撤销后续对应提交；不修改其他文件或重置工作树。
