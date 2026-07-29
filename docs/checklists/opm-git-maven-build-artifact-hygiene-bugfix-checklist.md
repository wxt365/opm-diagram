# Task Checklist: Maven 构建产物版本库治理修复

## Spec Mapping

- 规格：`specs/opm-git-maven-build-artifact-hygiene-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`none (primary)`
- 目标：忽略 Maven `target/` 并取消已提交构建产物的 Git 跟踪。
- 范围：`.gitignore`、本规格/checklist、`services/local-runtime/target/**` 索引状态。
- 非目标：业务代码、测试代码、设计、API、schema、配置和历史重写。
- 验收：规格第 5 节。
- 验证：Git 索引、忽略规则、磁盘文件、staged diff 和 whitespace 检查。
- 回滚：恢复忽略规则并从已有提交恢复目标路径。

## Build

- [x] 增加 `**/target/` 忽略规则
- [x] 从 Git 索引移除 `services/local-runtime/target/**`
- [x] 保留磁盘上的 Maven 构建文件

## Verify

- [x] `git ls-files services/local-runtime/target` 返回空
- [x] `git check-ignore` 命中目标 JAR
- [x] 目标 JAR 在磁盘上仍然存在
- [x] staged diff 范围符合规格
- [x] `git diff --cached --check` 通过

## Summary

- [x] 形成独立修复提交
- [x] 明确不涉及代码测试、构建或运行行为变更

## Verify Record

1. 从 Git 索引移除 `182` 个 `services/local-runtime/target/**` 路径；
2. `.gitignore:45` 的 `**/target/` 命中目标 JAR；
3. 本地 JAR 仍存在，大小为 `39,085,124` 字节；
4. staged diff 仅包含 `.gitignore`、本规格、checklist 和 `target/**` 删除记录；
5. `git diff --cached --check` 通过；本任务不涉及代码测试、构建或运行行为验证。
