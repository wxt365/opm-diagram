# GOLDEN-AUTHORING-03C/03B Adapter Readiness 依赖环闭包修正规格

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 问题

03C 第3节要求 03B 在 03C checklist 全部完成前保持阻断；但 03C checklist 又把真实 Common UI setup、一次性 `BLOCKED_FEEDBACK` 提交、第二次正常提交、PNG 与 capture 证据明确交给 03B。两者同时成立时，03B 无法合法启动，03C 也无法完成其最后一组验收。

## 2. 唯一修正

03C 分为两个不可混淆的状态：

1. `ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`：02B 的受控输入、Adapter Request `0.2` preflight、Base/Clone/Web 协议、Clone Result/Runtime Ready、默认 NOOP 与受控 `BLOCKED_FEEDBACK` 装配、静态 ESM adapter、固定 callback 的 `8 base/144 attempt`、关闭与 raw-ref 基线已通过。该状态只授权 03B 实现受控 Common capture。
2. `IMPLEMENTED/INTEGRATION_COMPLETE`：除上述条件外，03B 已在受控环境中用真实 Playwright UI/API 执行八个 subject 的 setup、一次性 fault、第二次正常提交、normalized result、PNG 与双 attempt 边界，并将其作为 03C 的 integration evidence 回填。本状态不等于 production authoring。

03B 的唯一前置由“03C checklist 全部完成”修正为：

```text
02B = IMPLEMENTED/CONTROLLED_TEST_PASS
AND 03C = ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION
AND 03A = --require-materialized 的 exact input 可用
AND Golden Environment 0.2 离线 verifier 可用
```

03B 仍必须在其受控测试中验证实际 UI/fault/capture；不得用固定 callback、schema 或设计冻结代替。

## 3. 边界

本修正只更新 03C/03B 的依赖语义、状态与验收归属。不修改 Adapter Request、Callback、Clone Result、Runtime Ready、Common Fixture、Capture Plan、fault 注入点、Schema、公共 API、SQLite、Profile、Candidate/Approval/Manifest 字节或任何生产 Gate。

03B 因此只从 `BLOCKED_BY_03C_CHECKLIST_CYCLE` 恢复为 `READY_FOR_CONTROLLED_IMPLEMENTATION`；真实 candidate、Approval、Visual Manifest、GATE-06-03、Activation、Capability 与 ISO 状态继续保持未生成或未运行。

## 4. 验收

1. 03C checklist 明确区分 Adapter Readiness 与最终 integration evidence；
2. 03B spec/checklist 仅依赖 Adapter Readiness，不再要求不可能的“03C 全部完成”；
3. 03B 的真实 UI/fault/capture 验收仍是 03B 必做项，并是 03C 完成的唯一 integration evidence；
4. 文档不再出现将固定 callback 误称为真实 UI/candidate 的表述；
5. Markdown 链接与 `git diff --check` 通过。

## 5. 回滚

回滚必须同时恢复 03B 的阻断状态及 03C 原状态，并重新标记为 `BLOCKED_BY_03C_CHECKLIST_CYCLE`。不得单独放宽 03B 前置或将 03C 受控 callback 结果升格为 integration/production 证据。
