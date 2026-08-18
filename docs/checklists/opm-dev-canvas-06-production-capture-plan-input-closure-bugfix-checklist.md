# Checklist: DEV-CANVAS-06 Production Capture Plan 输入闭环修复

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-production-capture-plan-input-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/Root Cause/冻结修复：规格第1至3章。
- 修改边界：规格第4章。
- 执行顺序/验收：规格第5、6章。
- 非目标/兼容/回滚：规格第7、8章。

## Plan

- [x] 复现Common Catalog drift与Planner版本化Bundle路径失败。
- [x] 确认旧clean source commit缺Planner/Schema/Common资产。
- [x] 冻结Catalog binding域身份和Handoff Bundle/Runtime artifact路径规则。
- [x] 冻结`${JAVA_HOME}/bin/jar` Java 21唯一archive tool与零输出拒绝规则。
- [x] 修复实现并完成定向正反测试。
- [x] 建立包含完整Planner输入的clean source commit。
- [x] 重建Handoff/Bundle/Runtime/Intake并执行production Plan。
- [x] 同步状态文档和不可变产物。

## Build

- [x] Common Catalog ID由binding digest前12位确定。
- [x] Planner测试从Handoff artifact解析Bundle与Runtime path。
- [x] Planner使用同一受控Java 21 executable完成版本校验、列表和解包。
- [x] 新clean source含Planner、Schema、author、Catalog/factory/fixtures和命令。
- [x] 新版本化release root排他生成，历史root未覆盖。
- [x] production Web dist由同一clean source生成。
- [x] production Capture Plan写入版本化change root。

## Verify

- [x] Common Fixture test `2/2`通过。
- [x] Planner test `3/3`通过，包含非Java 21零输出反例。
- [x] Handoff validator通过，6/6 Gate、34/34 Capability。
- [x] Intake为8/8、34/34、零blocker。
- [x] Plan Schema、1242/9、130/8及全部exact refs闭合。
- [x] Bundle/Runtime/descriptor/Handoff/Intake/Plan SHA已冻结。
- [x] archive完整、目标replay entry唯一且raw SHA闭合。
- [x] Markdown结构、链接和`git diff --check`通过。

## Release Boundary

- [x] 未执行Materializer或生成130份SQLite/Report。
- [x] 未生成PNG、Approval、Authoring Report或Visual/E2E/Performance/Recovery READY Report。
- [x] 未生成Candidate/Activation，production gate保持`DISABLED + []`。
- [x] 未启用Capability，未声明ISO符合性。

## Frozen Artifact Set

| 资产 | SHA-256 |
| --- | --- |
| Evidence Bundle | `84e41e5e4c9edab98aa72cd209da49726df96436c9d0ae8a50fc2895f375cabe` |
| Runtime JAR | `0cfe0f14f2190e64e4cbc39b8a8bfbb8c9a5b733607cb24c4801c872f87b3f49` |
| Release Build descriptor | `89a4047ec2d27f057d4b14c5417fa1e1074c069cdb42804ff0a2c9832aff2fd3` |
| Handoff | `0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326` |
| Intake Report | `54d56bab7792122781bc2b8b785c3488a4bd1d4f7ecc741845ecbcccdb2d85ee` |
| Common Fixture Catalog | `9133096ad601b223b1e42112631acfff5506e80c403e4d9f529a1f398439f8ea` |
| Capture Plan | `8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9` |
