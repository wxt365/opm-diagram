# GOLDEN-AUTHORING-03B Common Browser Capture Checklist

状态：`IN_PROGRESS`

关联规格：`specs/opm-dev-canvas-06-golden-authoring-common-browser-capture-implementation-task-spec.md`

## Spec Mapping

| ID | 规格映射 | 状态 | 验证 |
| --- | --- | --- | --- |
| CBC-01 | 4.1 Runtime 只读查询 | `DONE` | controller/service/repository tests |
| CBC-02 | 4.2 P03 受控交互 | `DONE` | Vue/Pinia tests |
| CBC-03 | 4.2 Projection normalizer | `DONE` | Node contract tests |
| CBC-04 | 4.3 真实 callback | `PENDING` | controlled browser test |
| CBC-05 | 4.3 Author 静态接入 | `PENDING` | Author tests |

## 边界

- 允许：规格第 3 节列出的 P03、Runtime query、OpenAPI、callback 与 Author 静态接入。
- 禁止：SQLite DDL、公共命令 payload、Candidate/Approval/Publisher/Visual Manifest、`.harness/**`。
- 非目标：不生成真实 Candidate/Approval/Gate/Capability/ISO 证据。

## 执行清单

- [x] C01 阅读 Visual Common 第 7、8 节和现有 03B/03C 接口。
- [x] C02 冻结 Common Browser Capture 实现规格。
- [x] C02A 冻结 Invocation `0.2` 显式 identity 闭包。
- [x] C02B 冻结 API-CTX-002 Projection 字段与 Common role 映射闭包。
- [x] C02C 冻结 API-CAT-001 Runtime Relation Catalog Query 闭包。
- [x] C02D 冻结 Common occurrence action anchor 闭包。
- [x] C02E 冻结 BLOCKED_FEEDBACK release-only 命令发现闭包。
- [x] C02F 冻结 P03 可观测视图状态闭包。
- [x] C02G 冻结生产 Geometry preimage、稳定窗口、focus 与 PNG 写入闭包。
- [x] C03 完成 API-VAL-003/004、API-VER-006 与 API-CAT-001 只读查询。
- [x] C04 完成 P03 candidate/catalog/Finding/History/feedback 受控状态。
- [x] C05 完成 Common Projection normalizer 与定向测试。
- [x] C06A 完成 callback、生产 Geometry/stability/focus/PNG 契约与 Author 静态接入。
- [ ] C06 完成真实 callback、双 attempt 隔离和 Author 接入。
- [x] C07A 执行 Node materializer/callback/Author、Web typecheck/Vue/X6 与 contract 定向验证。
- [ ] C07 执行 CBC-01 至 CBC-05 受控集成验证并记录未执行的 Runtime/Web/Chromium 边界。

## 当前验证边界

- 已执行：`node --test scripts/canvas06-common-visual-materialization.test.mjs scripts/canvas06-common-browser-capture.test.mjs scripts/release-canvas06-golden-author.test.mjs`（`18/18`）、`npm --workspace @opm/web run typecheck`、`npm --workspace @opm/web test -- WorkbenchView.spec.ts OpdCanvas.spec.ts`（`22/22`）、`npm run contract:validate`、`git diff --check`。
- 未执行：真实 Runtime + production Web + Chromium 的单 subject 双 attempt，以及完整 `72/144` Common 调度。事实原因是当前 source checkout 含未提交实现字节，Author 的冻结 preflight 会拒绝 dirty source；不得用本地 mock、route interception 或放宽 clean-source guard 代替。
