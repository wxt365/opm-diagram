# Spec: Maven 构建产物版本库治理修复

## Task Type

`bugfix`

## Active Playbooks

- `none (primary)`：Git 与文档治理任务

## 1. 背景

提交 `de71b09` 误将 `services/local-runtime/target/**` 的 Maven 编译产物、测试报告和 JAR 纳入版本控制；根 `.gitignore` 尚未忽略 Maven `target/` 目录。

## 2. 目标与范围

1. 根 `.gitignore` 增加仓库级 `**/target/` 忽略规则；
2. 从 Git 索引移除已经跟踪的 `services/local-runtime/target/**`；
3. 保留本地构建文件，不删除源码、不重写提交历史；
4. 形成独立修复提交，避免把仓库卫生修复混入业务实现。

## 3. 非目标

- 不修改应用、服务、测试或设计内容；
- 不处理来源不明确的其他已跟踪文件；
- 不执行 `reset`、rebase、amend 或强制推送；
- 不清理本地 Maven 构建目录。

## 4. 修改边界

允许修改：

- `.gitignore`；
- 本规格与对应 checklist；
- Git 索引中的 `services/local-runtime/target/**` 跟踪状态。

禁止修改：

- `apps/**`、`services/**/src/**`、`tests/**`、`docs/design/**`、`docs/contracts/**`；
- schema、API、配置和运行逻辑。

## 5. 验收标准

1. `git ls-files services/local-runtime/target` 返回空；
2. `git check-ignore services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar` 命中 `**/target/`；
3. 磁盘上的目标 JAR 仍然存在；
4. staged diff 只包含 `.gitignore`、本规格、checklist 和 `target/**` 删除记录；
5. `git diff --cached --check` 通过。

## 6. 兼容性与回滚

- API、配置、schema、业务数据：无影响；
- 构建：Maven 可继续生成 `target/`，但产物不再进入 Git；
- 回滚：恢复 `.gitignore` 规则并从 `de71b09` 重新检出目标路径，不改写历史。

## 7. 事实与假设

### 7.1 事实

1. `de71b09` 跟踪了 `services/local-runtime/target/**`；
2. 其中包含约 39 MB 的可执行 JAR、`.class` 和 Surefire 报告；
3. 当前根 `.gitignore` 没有 Maven `target/` 规则。

### 7.2 假设

无。
