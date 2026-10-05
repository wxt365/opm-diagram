# HS-03A 浏览器草稿传输与待确认恢复

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：frontend-vue (primary)、testing。
状态：设计冻结，实施与实际证据见 [Checklist](../docs/checklists/opm-hybrid-save-browser-delivery-checklist.md)。

## 1. 目标与边界

为 [HS-03](opm-hybrid-save-strategy-implementation-task-spec.md) 先实现可独立验证的浏览器传输基础。V2 生成类型已有，当前工作台仍是 V1；不能把保存按钮接到与画布不同的草稿。本包不切换工作台、不增加保存按钮、不激活或迁移用户模型，不宣称完成 HS-03。

Git 基线：2180f3823a547878f15c6dd2d2b11030718a0efa。直接当前目录，保留所有前序差异，不创建 worktree、不提交。

精确允许文件（12 项）：

1. 本规格。
2. `docs/checklists/opm-hybrid-save-browser-delivery-checklist.md`。
3. `docs/checklists/opm-hybrid-save-implementation-checklist.md`。
4. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`。
5. `apps/web/src/shared/api/localRuntimeApi.ts`。
6. `apps/web/src/shared/api/localRuntimeApi.spec.ts`。
7. `apps/web/src/shared/api/draftDelivery.ts`。
8. `apps/web/src/shared/api/draftDelivery.spec.ts`。
9. `apps/web/src/shared/api/draftPendingStore.ts`。
10. `apps/web/src/shared/api/draftRequestIdentity.ts`。
11. `apps/web/vite.config.ts`。
12. `tests/e2e/draft-browser-delivery.spec.ts`。

允许上述前端 API 内部接口、Vite V2 同源代理、测试和文档；禁止公共 HTTP/Schema/生成类型、Runtime、数据库、依赖、Profile、生产证据和无关 UI 改动。测试使用已有 Playwright、Vitest，独立浏览器 Context；真实 IndexedDB 配合受控 HTTP 替身，只证明浏览器恢复链路，不冒充 Runtime/SQLite 端到端。

## 2. 唯一协议

### 2.1 API 与原始请求

复用 localRuntimeApi 的 fetch/session owner，新增封闭的 V2 operation 映射，全部使用生成类型。查询固定 open/projection/text/navigation/findings/relation-catalog/capabilities/receipts；变更固定 commands/save/pin。V2 错误解析顶层 code/message/retryable/reason_code，V1 继续解析 error envelope；空响应、非 JSON、非对象的 V2 2xx 必须拒绝，不能作成功确认。增加 `/api/v2` 同源代理。查询不产生待确认条目。

请求只生成一次 raw JSON，先落 IndexedDB，再逐字符发送同一字符串。数字保留 IEEE754 binary64，特别是 -0，不允许 JSON.stringify 隐式变为 0；拒绝非有限数、undefined、空洞数组、循环、非普通对象、孤立代理项。禁止重新生成 ID、重算候选、替换 payload 或回退 V1。HTTP token 取当前 bootstrap，不落本地队列。

浏览器请求摘要复用现有 DraftEditRequest/1、DraftSaveRequest/1、DraftPinRequest/1 公式：EDIT 排除 request_id，其余字段及 project/model 加入 preimage；SAVE/PIN 使用各自冻结字段。所有数字编码为 `{binary64: 大端16位小写hex}`，按 UTF-16 键顺序 canonical JSON，UTF-8 SHA-256。与既有 Node/Java 向量一致，不修改共享整数 JCS owner。额外 raw_sha256 仅用于检查本地字节损坏，不代替请求身份。

### 2.2 IndexedDB 条目 1

数据库 `opm-draft-delivery`，version=1，store=`pending`，keyPath=`[project_id,model_id,lane]`。封闭字段：version=1、project_id、model_id、lane、operation、idempotency_id、raw、raw_sha256、request_digest。lane 仅 EDIT/EXPLICIT；EDIT 对应 EDIT，EXPLICIT 对应 SAVE/PIN。每个模型每 lane 至多一个未确认条目，以同一 readwrite 事务检查/新增，不能覆盖。保留原 raw，token 只从 raw 读取，不重复存另一份身份。

EDIT 与 EXPLICIT 分 lane，手动保存等待捕获边界由后续 UI owner 管理；保存发送期间不阻塞另一 lane 的新编辑。相同 lane 的并发申请返回 DRAFT_PENDING_EXISTS，跨标签页同样由 IDB 原子 add 保证。重复投递同一条目的最终幂等由 Runtime 控制。

所有写事务明确要求 strict durability，收到 transaction.complete 才可发送/报告删除完成。open、blocked、配额、abort、strict 不可用都报 DRAFT_LOCAL_PROTECTION_UNAVAILABLE，不回退内存。连接按操作关闭并响应 versionchange；不依赖 unload flush，不自动清库。

### 2.3 确认与恢复

`DraftDelivery.submit(project,model,mutation)` 持久化后发送；`pending(project,model)` 只读两 lane；`recover(project,model,lane)` 先读取并复核封闭条目、raw SHA/请求摘要/ID/lane，打开 Runtime 草稿，再查询同 operation/id 收据。

FOUND 必须匹配 request_id、operation、idempotency_id、request_digest，再验证结果 ID、捕获 token 和 EDIT 状态/序号。校验失败返回 DRAFT_RESPONSE_INVALID 并保留原条目。NOT_FOUND 必须明确 result/request_digest=null；EDIT 只在当前 token 完全等于原 base 时重发，SAVE/PIN 允许同 draft/binding 且当前序号不小于捕获序号，过期捕获是否可物化仍由 Runtime 拒绝。不同身份返回 DRAFT_CONFLICT，保留输入，不重新解释。

直接响应也必须通过同样结果身份守卫：EDIT DURABLE 恰好 +1，UNCHANGED 不前进；SAVE 为 SAVED/UNCHANGED 且有真实 checkpoint/revision，head 与捕获同身份且序号不倒退；PIN 有真实 revision。不能把 HTTP 2xx、ACCEPTED 或缺字段对象当成功。最终通过 ID/原始 SHA 的同事务 compare-and-delete 删除条目，绝不删除另一条待确认操作。

网络失败、Runtime 拒绝、错误响应、冲突、本地删除失败均保留条目。首发不自动丢弃确定失败；后续 UI 提供查看/修正/显式放弃流程前，保留的条目阻断该 lane 新请求。此边界不能静默清除输入。该 owner 不负责 UI 队列捕获、离线建模、页面重绘、自动保存计时或本地数据库被人为清除后的恢复。

## 3. Plan

1. API typed 映射及 raw body 发送、错误兼容，增加 V2 proxy。
2. 浏览器 binary64 请求身份 owner，再实现 strict IDB 两 lane 及确认 CAS。
3. delivery 封装提交/收据恢复；浏览器重新加载后导入相同 owner 验证原始请求仍在。
4. 先定向 Vitest/浏览器，再 Web 全量测试、typecheck/lint/build；同步实际证据。

不新增 SaveState GET 调用：现有守卫要求 Origin，同源浏览器 GET 不保证携带；后续状态查询使用既有 OpenDraft POST 的 save_state，不能伪造 Origin 或放宽守卫。

## 4. 验收与回滚

- HS-B01：全部查询/变更路径、session、顶层 V2 错误和 V1 回归；-0 raw 逐字节不变。
- HS-B02：浏览器 EDIT 摘要与全部冻结 Node/Java identity 向量一致，Pin 固定向量、Save 公式对照；非法 JSON 值零发送。
- HS-B03：真实 Chromium IndexedDB strict commit 后发送；刷新保留、两个页面竞争不覆盖、配额/不可用零发送、CAS 不误删。
- HS-B04：丢响应 FOUND 不重执行；NOT_FOUND exact raw 重试；token/摘要/错误结果阻断并保留；Save/Pin 恢复不新增 ID；不同 lane 可以并行。
- HS-B05：Web 全量回归、类型、lint、Node22 build 和差异检查通过。UI/真实 SQLite 联调、用户库切换不在本包完成声明内。

回滚仅移除本包代码调用与代理增量，保留已有差异以及 IndexedDB 待确认数据，不自动删除或改写本地队列。未来恢复仍用同名 version=1 owner；不把待确认编辑转交 V1。
