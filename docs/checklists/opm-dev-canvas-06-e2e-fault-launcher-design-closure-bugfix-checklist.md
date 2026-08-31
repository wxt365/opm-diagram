# DEV-CANVAS-06 E2E Fault Launcher 设计闭包 Checklist

状态：`COMPLETE/DESIGN_FROZEN/SOURCE_CHAIN_SUPERSEDED`

后继实现入口：产品语义由原实现规格承接，source identity与Build准入统一转到`specs/opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`。旧base intake状态不再可消费。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-fault-launcher-design-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 问题与目标：规格第 1、2 节。
- 非目标与修改边界：规格第 3、4 节。
- 权威输入与兼容：规格第 5 节。
- 配置、握手、故障语义：规格第 6 节。
- 验收、回滚、非结论：规格第 7 至 9 节。

## Plan

1. 冻结 test-only 启动参数、默认拒绝和 Spring 装配条件；
2. 冻结 parent nonce/challenge raw bytes、HMAC和常量时间校验；
3. 冻结 Plan path/link/raw SHA/Schema/payload/semantic/identity校验顺序；
4. 冻结三类故障注入点、一次性状态机和稳定错误码；
5. 冻结 INITIAL/REOPEN、普通启动和正反例矩阵；
6. 同步 Runner、测试策略、执行包、冻结基线和文档入口；
7. 执行契约测试和文档一致性验证。

## Boundary

- [x] 只修改规格授权的设计、规格、checklist和状态入口。
- [x] 不修改 `services/**`、`scripts/**`、`tests/**`、`packages/**`。
- [x] 不修改活动 Fault Plan/Attempt Artifact/Manifest/Report Schema、OpenAPI或SQLite DDL。
- [x] 不生成 Report、Gate、Candidate、Activation、Capability或ISO证据。

## Build

- [x] 新增 E2E Fault Launcher 详细设计。
- [x] 冻结profile与九项test-only配置只来自command line、`EnvironmentPostProcessor` guard、零配置正常启动、partial/unknown/production配置拒绝。
- [x] 冻结 32-byte parent nonce、32-byte raw challenge和HMAC challenge response。
- [x] 冻结 Plan固定路径、single-link regular file、raw SHA及验证首错顺序。
- [x] 冻结 `ASSET_MISSING/PERSISTENCE_FAILED/READONLY` 唯一注入层、时机和一次性状态机。
- [x] 冻结产品错误码与 launcher 协议错误码。
- [x] 冻结 INITIAL/REOPEN启动命令和正反例矩阵。
- [x] 同步 Attempt Artifact、Runner、测试策略、执行包、冻结基线和 `docs/README.md`。

## Verify

- [x] 活动文档不再允许普通 `java -jar`携带 fault 配置或装配 fault port。
- [x] 活动文档不再允许删除任意资产、Controller短路、文件权限chmod或SQLite schema/data篡改作为三类故障实现。
- [x] 三类现有fixture的`DOMAIN_REJECTED`漂移已明确列为后继实现必须修正，不被误报为设计通过。
- [x] `npm run release:canvas06:visual-e2e-schema:test`通过：`19/19`。
- [x] `npm run contract:validate`通过。
- [x] `git diff --check`通过。
- [x] 本轮未执行或宣称 Fault Launcher、Spring、UI/API、`194/388`或production集成测试通过。

## Rollback

- [x] 只回退本设计包和跨文档指针。
- [x] 不覆盖现有用户改动、Schema、fixture、Runtime、Handoff、Manifest或evidence root。
