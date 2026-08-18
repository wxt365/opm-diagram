# Spec: DEV-CANVAS-06 Common Visual JCS Owner 设计修正

文档状态：`FROZEN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

02B 实现规格要求复用仓库既有 RFC 8785 helper，但当前 Node Capture Planner、Intake 和其他 release scripts 各自定义局部 `jcs()`，不存在可由 02B Builder、Verifier 和 Planner 共同导入的 Node 模块。Java Runtime 只有 `Rfc8785JsonCanonicalizer`，不能直接作为 Node 模块使用。进一步对照两端实现后还确认，原设计的“Unicode code point排序”和无界`integer`会分别偏离RFC 8785 UTF-16 key排序并导致Node/Java大整数bytes不一致。

Root Cause 是设计审查把“已有局部算法”误记为“已有共享 owner”，没有冻结 Node 生成的 fixture/Projection digest 与 Java 03C 复算结果的跨 Runtime parity 输入，也没有使用能区分UTF-16/code point和safe/unsafe integer的exact向量审查算法边界。

## 2. 目标

1. 冻结 02B 唯一共享 Node JCS 模块路径、导出函数和值域；
2. 冻结 Planner、Common Builder、Common Verifier 禁止保留局部 JCS 副本；
3. 冻结 Node/Java 共用的不可变 parity vector 文件、字段和正反测试；
4. 同步 02B、03C、Visual Common、Golden Authoring 和冻结基线；
5. 不改变 Common Fixture/Plan/Environment Schema、digest公式或任何 release bytes。

## 3. 修改边界

允许新增本规格和对应 checklist；允许同步 Visual Common 设计、02B/03C规格/checklist、Golden Authoring及其活动状态入口、测试策略、执行包、需求、DEV-CANVAS-06、冻结基线和索引。

禁止修改 `.harness/**`、Schema、Java、Node、Vue、SQLite、测试、`package.json`、Handoff/Intake、fixture/Catalog/Plan或其他release bytes。本轮不实现共享模块或测试向量。

## 4. Fix Strategy

1. 02B 新增唯一模块 `scripts/canvas06-rfc8785.mjs`，只导出 `canonicalizeJcs(value)` 和 `sha256Jcs(value)`；
2. 值域封闭为 `null/boolean/safe integer/string/array/object`，integer范围固定为`[-9007199254740991,9007199254740991]`；拒绝浮点、非有限数、越界整数、`undefined`、函数、symbol、bigint、lone surrogate和循环引用；对象 key 按 RFC 8785 UTF-16 code unit lexical order，字符串按 JSON escaping，digest为 canonical JSON text UTF-8 bytes 的小写 SHA-256；
3. 02B 修改 Planner，删除其局部 `jcs()` 并与Builder/Verifier共同导入该模块；其他不属于02B信任链的历史脚本不在本包迁移；
4. 共用向量固定为 `tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`，由 Node 02B 和 Java 03C 测试只读消费；
5. 每个向量封闭记录 `vector_id/input/canonical_utf8/sha256`，10项exact input/canonical/SHA由Visual Common设计`v1.1`第8.3节冻结；`OBJECT_KEY_ORDER`必须使用`U+1F600/U+E000`区分UTF-16与code point排序；另在各语言测试中覆盖非法值，不把非法值写入JSON向量；
6. Java 03C 继续复用现有 `Rfc8785JsonCanonicalizer`，不得新增第二个Java canonicalizer；两端必须对全部向量产生相同 canonical UTF-8和SHA。

## 5. 验收与验证

1. Visual Common设计升为`v1.1`并形成唯一JCS owner和parity章节；
2. 02B/03C规格具有exact模块/向量路径、值域、导出、迁移和测试责任；
3. 当前实现状态保持02B/03C=`NOT_STARTED`、03B=`BLOCKED_BY_DEPENDENCY`；
4. 冻结基线升版且仍满足`32=22+10`、`blocked/unresolved/conflict=0`、`READY_FOR_DEVELOPMENT`；
5. Golden Authoring与Visual/E2E Schema回归、Markdown链接/表格/围栏、状态扫描和`git diff --check`通过。

## 6. 回滚

回滚只删除本规格/checklist并恢复本轮文档指针。若恢复到JCS owner不唯一的状态，`DFR-021`和全局开发门必须重新标记为`BLOCKED_BY_DESIGN`；不删除任何代码、向量或release资产。

## 7. 事实与非结论

事实：当前 Planner 第177行附近存在局部`jcs()`；Java releaseauthoring package已有`Rfc8785JsonCanonicalizer`；共享Node模块和parity vector尚不存在。

本修正不构成02B/03C实现、fixture/SQLite/PNG/candidate、Gate READY、Capability启用、production release或ISO符合性证明。
