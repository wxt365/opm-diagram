# DEV-CANVAS-06 Performance Schema 实现 Checklist

## 任务声明

- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 当前任务规格：[Performance Schema 实现](../../specs/opm-dev-canvas-06-performance-schema-implementation-task-spec.md)

## Spec Mapping

| 规格 | 范围 | 非目标 | 验收 | 回滚 |
| --- | --- | --- | --- | --- |
| §1~2 | 三个 Schema、AJV 正反例、npm 入口 | 不运行性能测量 | 定向 Schema 测试 | §6 |
| §4 | 固定 catalog、samples、失败码、READY 结构 | 不手写统计值或伪造样本 | 正例和关键反例 | 不产生证据文件 |
| §5 | 仅 contract/script/package/spec/checklist | 禁改应用、Runtime、性能 factory | 范围审查与 diff check | 回退新增文件 |

## 实施

- [x] 新建 Performance Manifest Schema，固定 4 fixture、7 scenario、11 metric instance 与统计策略。
- [x] 新建 Performance Samples Schema，固定单调时间、sample status、series digest 与完整性字段。
- [x] 新建 Performance Report Schema，固定环境、7 raw set、失败码、summary 与 READY 形状。
- [x] 新增 AJV 正反例和 npm 入口。

## 验证

- [x] `npm run release:canvas06:performance-schema:test`
- [x] `npm run contract:validate`
- [x] `git diff --check`

## 事实与遗留

- 事实：设计已冻结，仓库当前没有 Performance Schema、factory、runner、raw sample 或 Report。
- 风险：Schema 不能代替真实硬件/浏览器/Runtime 性能验证。
- 遗留：后续实现 fixtures、manifest builder、runner、reporter 与 verifier，并在 exact release build 执行 `7/7` scenario。
