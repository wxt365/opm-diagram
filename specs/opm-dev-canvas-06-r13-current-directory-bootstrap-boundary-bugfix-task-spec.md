# Spec: DEV-CANVAS-06 R13 Current-Directory Bootstrap Boundary Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

在用户明确要求直接使用当前目录、不得使用 `git worktree` 的条件下，修正 Bootstrap Build Closure 对仓库根级本地治理/参考资产的错误纳入，同时保持 production source 的 fail-closed 语义与 R12 历史链不变。

## 2. 已复现事实

1. `rebuild-canvas06-unified-production-inputs.mjs` 在 Node 22、JDK 21 和 R12 source-chain 已通过后，于 Bootstrap `SOURCE` inventory 被拒绝。
2. 首个稳定错误为 `BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID/INVENTORY`，对象为当前目录 `.DS_Store`；移除该 Finder 元数据后，首个稳定错误变为 `.codegraph/codegraph.db`。
3. 当前仓库的 `.codegraph`、`.codex`、`.harness` 和 `reference` 均为根级 ignored 本地工具、治理或参考资产，均不参与 `npm run build`、Runtime JAR 或 Web dist 的 source identity。
4. 现有 verifier 只排除 `.git` 和派生产物，递归把上述根纳入“所有非 tracked 文件必须拒绝”的 inventory，与当前目录开发约束不可同时满足。

## 3. 冻结语义

### 3.1 非构建根

Bootstrap inventory 仅跳过以下四个精确根路径及其后代：

```text
.codegraph
.codex
.harness
reference
```

它们不进入 Bootstrap source inventory、dist inventory、Runtime JAR 输入、Web tree、Handoff、Intake、Common fixture、Manifest 或 Report identity。verifier 不读取、摘要、复制或基于其中任何文件回退。

除此之外，原有规则不变：

- Git tracked/untracked clean 检查仍完整执行；
- 根目录 `.DS_Store`、任意其他 ignored/untracked 普通文件、符号链接、硬链接和 path escape 仍须拒绝；
- `node_modules`、`apps/web/dist`、`services/*/target` 仍仅按既有派生产物规则处理；
- 不修改 `.gitignore`，不增加目录扫描 fallback，不把任意 basename 或点目录作为通配排除。

### 3.2 Source-chain

新增唯一 target：`DIRECT_MAIN_R12`。

```text
44d8bdaa6c6de66de7447604deaaf1578c1cc146 (fixed R11 integration merge)
  -> 8608f05b1a397270d2f14152159019e1bf96e3b1 (R12)
  -> R13 candidate
```

`DIRECT_MAIN_R12` 必须先复核 R11 fixed merge 的精确双 parent 顺序、R12 的唯一 parent 与 R12 六路径 delta；再要求 R13 candidate 是 R12 的唯一 child，且其 delta 精确等于本规格第 4 节八路径。`DIRECT_MAIN_R11` 的语义及其历史 source commit 不变。

## 4. 精确修改边界

R13 的唯一 parent 为 R12 `8608f05b1a397270d2f14152159019e1bf96e3b1`，source delta 必须精确为：

```text
A docs/checklists/opm-dev-canvas-06-r13-current-directory-bootstrap-boundary-bugfix-checklist.md
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/rebuild-canvas06-manifest-v02-production.mjs
M scripts/rebuild-canvas06-manifest-v02-production.test.mjs
M scripts/verify-opm-bootstrap-build-closure.mjs
M scripts/verify-opm-bootstrap-build-closure.test.mjs
A specs/opm-dev-canvas-06-r13-current-directory-bootstrap-boundary-bugfix-task-spec.md
```

禁止修改 Schema、公共 HTTP API、SQLite DDL、Profile/fixture bytes、Runner/Driver、生产配置、`.gitignore`、Capability 状态及任何历史 source-chain 常量。

## 5. 验收

1. Bootstrap unit test 接受四个精确非构建根，拒绝根级 `.DS_Store` 及未知 ignored 文件。
2. Node 22 定向 source-chain/Manifest 参数测试接受 `DIRECT_MAIN_R12`，保留错误 target 或错误 source/runner join 的拒绝。
3. R13 仅有 R12 一个 parent，且 name-status 精确等于第 4 节八路径；`git diff --check` 通过。
4. R13 source-chain guard 通过后，才可重试外置 release store 的统一 input 重建；不得生成 E2E Report、Candidate、Activation 或启用 Capability。

## 6. 回滚

回退 R13 单一 child commit 即可恢复 `DIRECT_MAIN_R12` 的拒绝。R12、fixed merge、已有 release store、备份目录和历史 evidence 均不得覆盖。
