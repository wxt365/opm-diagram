# Checklist: GOLDEN-AUTHORING-03C Common Visual Materializer 实现

状态：`IN_PROGRESS`。仅共享 JCS parity 前置已完成；SQLite materializer 仍等待完整02B fixture/Catalog。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md`。
- Task Type：`feature`。
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`。
- 目标/设计输入/依赖：规格第 1 至 3 节。
- 允许/禁止修改：规格第 4 节。
- Runtime/SQLite/attestation/clone/fault/03B adapter：规格第 5 至 8 节。
- 错误/测试/验收：规格第 9 至 12 节。
- 回滚与 release boundary：规格第 13、14 节。

## Input Gate

- [ ] 02B checklist 全部通过，新 fixture/Catalog 通过只读 verifier。
- [ ] 全局开发门为 `READY_FOR_DEVELOPMENT`。
- [ ] exact Java 21 Runtime JAR、active binding 和 fresh work root 可用。
- [x] 02B共用JCS parity vector存在且通过Node verifier。
- [x] Visual Common`v1.4`已冻结五类index逐列映射、固定ID/时间/状态/null、Revision到SQLite唯一编码和活动43文件输入root。
- [ ] 受控输入与 production authoring root 已隔离。

## Build

- [ ] release-only/non-web 条件装配与 command-line source guard 完成。
- [ ] 8 subject SQLite V1 transaction seed、rollback、reopen verifier 完成。
- [ ] attestation atomic writer 与只读 semantic verifier 完成。
- [ ] 8 immutable base、72 capture x 2 attempt 的 144 fresh clone完成。
- [ ] 默认 no-op commit hook 和 `BLOCKED_FEEDBACK` 一次性 release-only hook 完成。
- [ ] 03B Common adapter、固定顺序和禁止 override 守卫完成。
- [ ] default Runtime、公共 API、03A Family、SQLite V1 和产品配置保持不变。

## Verify

- [ ] guard 缺失/冲突/来源/Web/default/03A 反例全部通过。
- [ ] 8 fixture identity、Revision JCS/raw digest、固定时间、五类index逐列/顺序/null、Projection、integrity/FK/sidecar闭合。
- [x] Java现有canonicalizer对10项共用vector的canonical JSON text/SHA与Node完全相等，safe integer边界、UTF-16 key排序、lone surrogate及其他非法值拒绝。
- [ ] migration/seed/commit/reopen/attestation/clone 故障稳定 rollback 且不触碰已有资产。
- [ ] `8/72/144`、顺序、路径、base digest 和 attempt 隔离通过。
- [ ] fault hook 只对 exact subject/command 首次触发，第二次及其他模式为正常/no-op。
- [ ] exact packaged JAR integration 通过，不使用 exploded classpath。
- [ ] P95/总时长/RSS 满足 `5 s/30 s/1 s/512 MiB`。
- [ ] Maven、Node 定向命令、contract/backend 和 `git diff --check` 通过。

## Risks And Residuals

- [ ] 03C 完成只恢复 03B 实现依赖，不生成 production candidate。
- [ ] 真实 UI setup、144 次浏览器 capture、PNG determinism 和 Authoring Report 由 03B 承接。
- [ ] production 8 base/144 clone、GATE-06-03、Candidate、Activation、Capability 和 ISO 状态不得提升。

## Rollback

- [ ] 只回退 03C package、adapter、test/command 和窄 injection point。
- [ ] 不修改 SQLite V1，不删除 03A、历史、approved 或用户数据。
