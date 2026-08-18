# Task Checklist: OPM 当前实现与冻结设计符合性验收

> 历史执行快照：本checklist记录2026-07-31原始验收命令与当时结果，不作为当前Handoff状态源。当前clean Handoff/Bundle与Intake以`docs/checklists/opm-dev-canvas-05-clean-handoff-rebuild-checklist.md`和符合性报告的2026-08-03输入刷新为准。

## Spec Mapping

- 当前任务规格：`specs/opm-implementation-design-conformance-test-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`testing (primary)`、`frontend-vue`、`backend-springboot`
- 目标：对当前候选实现执行设计符合性验收，输出可复核的 `PASS / FAIL / BLOCKED / NOT_RUN` 证据矩阵。
- 范围：冻结边界、页面与画布、State、16/8/10 关系、Control Modifier、API-EDT、Revision/SQLite、OPL/Trace/Golden、DEV-CANVAS-05 handoff、DEV-CANVAS-06 release、工程质量和 ISO 声明边界。
- 非目标：不修复业务实现，不补 fixture/runner/测试，不启用生产 Capability，不声明完整 ISO 符合性。
- 约束：静态文件存在不等于实现通过；局部自动化通过不等于浏览器、发布或 ISO 通过；保留用户全部既有改动。
- 验收标准：规格第 8 节。
- 验证方式：设计审计、CodeGraph 结构映射、根脚本、Maven、Playwright、受控浏览器、机器报告和摘要检查。
- 回滚：只删除本次新增规格、checklist 和报告，不回退实现或用户数据。

## 修改边界

- [x] 只允许新增本任务规格、checklist 和报告
- [x] 禁止修改 `.harness/**` 和业务源码、测试、契约、配置、依赖、Profile/Golden 资产
- [x] 允许测试命令产生可再生的 `target/**`、`dist/**` 和测试输出
- [x] 不回退或覆盖当前工作树中的用户改动

## Task 1 - 规格与基线

- [x] 创建当前任务规格并声明 `Task Type`
- [x] 声明 `Active Playbooks`
- [x] 阅读 `feature` task type、`testing`、`frontend-vue`、`backend-springboot` playbook
- [x] 定位全量冻结基线、开发执行包和测试策略
- [x] 明确只测试、不修复边界
- [x] 建立 20 项 `FROZEN_INCLUDED` 责任到实现/测试的完整矩阵
- [x] 审计 `FROZEN_DEFERRED` 未被越界实现或错误宣称

## Task 2 - 结构与契约审计

- [x] 检查 CodeGraph 索引和关键实现入口
- [x] 映射 P03 工作台、State、关系工具链与 command adapter
- [x] 映射 API-EDT handler、候选、commit、Revision reader/writer 与 SQLite repository
- [x] 映射 OPL planner/generator、Token/Trace、Profile 资产加载和 Golden replay
- [x] 核对 OpenAPI、generated DTO、Revision 0.1/0.2 Schema 与实际 reader/writer 一致性
- [x] 核对 DEV-CANVAS-05/06 所需机器 Schema、runner、manifest、report；DEV-CANVAS-06 可执行闭包缺失

## Task 3 - 契约、Golden 与兼容

- [x] `npm run contract:validate`：PASS
- [x] `npm run golden:contract:test`：25/25 PASS
- [x] `npm run golden:check`：178 cases PASS
- [x] `npm run golden:coverage`：178 cases EXACT
- [x] `npm run golden:replay`：130 PASS + 48 预期 BLOCKED，失败 0
- [x] `npm run compatibility:replay`：6 PASS + 7 预期 BLOCKED，失败 0
- [x] `npm run handoff:evidence`：GATE-05-01/04 MATCHED；现有 handoff Schema/16 refs 校验通过但状态为 BLOCKED
- [x] 未运行会重写用户 Profile handoff 资产的 `npm run handoff:check`，改为只读验证当前 handoff
- [x] 记录 fixture/capability/coverage/compatibility/handoff 计数和失败详情

## Task 4 - 前端工程验证

- [x] `npm run lint`：PASS
- [x] `npm run typecheck`：PASS
- [x] `npm run test --workspace=@opm/web`：7 files、38/38 PASS
- [x] `npm run build`：PASS，保留 bundle 与 bootstrap script 警告
- [x] 记录 suite、case、失败、跳过和构建输出
- [x] 核对 State、16/8/10、候选、Control、Structural fan、OPL/Trace 对应测试覆盖；组件/单测存在但发布覆盖不足

## Task 5 - 后端工程验证

- [x] `npm run backend:verify`：21 files、231/231 PASS
- [x] 记录 Maven 模块、test、failure、error 和 skipped 数
- [x] 核对 API、资产加载、Revision compatibility、SQLite 原子提交、Golden replay、OPL/Trace 覆盖
- [x] 核对异常路径没有 partial Revision/Head/Text/Trace/Operation 增量

## Task 6 - E2E 与浏览器

- [x] `npm run test:e2e`：已执行，8/8 FAIL
- [x] 记录 Chromium、8 cases、8 failures、0 retry 和错误上下文
- [x] 核对 `E2E-001~010` 与 `E2E-CANVAS-001~007` 覆盖；当前仅 8 个聚合场景，不满足 release catalog
- [x] 浏览器验证画布与 Object/Process/State：FAIL，所有编辑被 Profile 版本冲突阻断
- [x] 浏览器验证工具链图标、16/8/10 关系入口：静态入口可见，语义入口 disabled，FAIL
- [x] 浏览器验证候选、提交、Control Modifier、Structural fan：被前置版本冲突阻断
- [x] 浏览器验证 OPL/Trace：空 Revision 可读，语义变更后闭环被前置版本冲突阻断
- [x] 浏览器验证缩放：100% -> 90% 且 Revision 不变；25%/400% release visual 未执行
- [x] 浏览器验证窄视口：390x844 无全局横向溢出；错误/重开完整矩阵未执行

## Task 7 - DEV-CANVAS Gate

- [x] DEV-CANVAS-00：机器契约/DTO/Revision compatibility PASS；前端 binding 集成 FAIL
- [x] DEV-CANVAS-01：后端/组件证据存在，在线 State 端到端 FAIL
- [x] DEV-CANVAS-02：Golden PASS，在线 16 类 Procedural 端到端 FAIL
- [x] DEV-CANVAS-03：Golden/Modifier PASS，在线 8 类 Control 端到端 FAIL
- [x] DEV-CANVAS-04：Golden/fan PASS，在线 Structural 端到端 FAIL
- [x] DEV-CANVAS-05：GATE-05-01~06 evidence MATCHED，handoff `BLOCKED`，34 Capability `BLOCKED`
- [x] DEV-CANVAS-06：runner/catalog/report/activation 可执行闭包缺失，FAIL
- [x] production enablement 为 `DISABLED + []`，未以 eligibility 代替 enabled

## Task 8 - 报告与交付

- [x] 新增 `docs/reports/opm-implementation-design-conformance-test-report.md`
- [x] 对每项输出 `PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE`
- [x] 每个 FAIL/BLOCKED 给出设计引用、直接证据、影响和建议优先级
- [x] 区分设计符合、实现通过、浏览器通过、发布就绪和 ISO 符合性
- [x] 对新增验收文档执行 `git diff --check` 和独立 whitespace 检查
- [x] 复核业务实现未被本任务修改；仅产生 Playwright/Maven/Vite 可再生测试输出
- [x] 输出 `Task Type`、`Active Playbooks`、修改文件、验证结果、风险与遗留项

## 初始风险台账

| Risk ID | 风险 | 验证动作 | 当前状态 |
| --- | --- | --- | --- |
| `TEST-RISK-001` | `.harness/repo-profile.md` 与真实工程不一致 | 以根构建文件和实际命令为准 | `MITIGATED` |
| `TEST-RISK-002` | 未提交工作树导致证据归属混淆 | 测试前后记录 `git status`，只新增验收文档 | `MITIGATED` |
| `TEST-RISK-003` | Golden 局部通过被误报为 16/8/10 全覆盖 | 已实跑 178-case coverage/replay 和 19-case Atomic | `MITIGATED` |
| `TEST-RISK-004` | 普通 E2E 通过被误报为 DEV-CANVAS-06 发布通过 | 当前 E2E 8/8 FAIL，且发布机器闭包缺失 | `CONFIRMED` |
| `TEST-RISK-005` | 开发机环境不满足发布性能矩阵 | 未形成冻结的 performance raw sample/report，保持 `NOT_RUN` | `CONFIRMED` |
| `TEST-RISK-006` | 草案 Profile 被误报为完整 ISO 符合性 | 保持 `EVIDENCE_MISSING/无法判断` | `MITIGATED` |
