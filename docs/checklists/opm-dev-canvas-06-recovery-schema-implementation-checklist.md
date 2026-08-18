# DEV-CANVAS-06 Recovery Schema 实现 Checklist

## 任务声明

- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 当前任务规格：[Recovery Schema 实现](../../specs/opm-dev-canvas-06-recovery-schema-implementation-task-spec.md)

## Spec Mapping

| 规格 | 范围 | 非目标 | 验收 | 回滚 |
| --- | --- | --- | --- | --- |
| §1~2 | 三份 Schema、AJV、npm 入口 | 不执行 recovery fault | 定向 Schema 测试 | §6 |
| §4 | 固定 28/56、gate 边界、失败码与 READY | 不伪造真实恢复证据 | 正反例覆盖 | 不写 production gate |
| §5 | 仅 contract/script/package/spec/checklist | 禁改应用、Runtime、factory、runner | 范围审查和 diff check | 回退本切片 |

## 实施

- [x] 新建 Recovery Manifest Schema，固定 `2/28/8/7/4/3/6/56` 与 case catalog 结构。
- [x] 新建 test-only Gate Fixture Schema，锁定 production loader `REJECTED` 边界。
- [x] 新建 Recovery Report Schema，锁定 fixture/case/attempt/snapshot、失败码与 READY 形状。
- [x] 新增 AJV 正反例和 npm 入口。

## 验证

- [x] `npm run release:canvas06:recovery-schema:test`
- [x] `npm run contract:validate`
- [x] `git diff --check`

## 事实与遗留

- 事实：设计输入已冻结，仓库当前没有 Recovery release Schema、factory、fault runner、Report 或真实恢复证据。
- 风险：Schema 无法证明强停、SQLite 原子性、重开、幂等或回退行为。
- 遗留：后续实现 fixture factory、fault runner、rollback evaluator adapter、reporter 与 verifier，并在 exact release build 执行 `28/28` case。
