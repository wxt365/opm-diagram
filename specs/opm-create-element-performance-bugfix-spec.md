# 画布创建元素显示延迟修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## 目标与范围

- Work Mode: change；Risk Level: L3；Task Type: bugfix。
- Active Playbooks: backend-springboot (primary)、frontend-vue、testing（沿用宿主仓库规范）。
- 允许修改画布 draft session/store、Runtime 查询实现、宿主工作台代理及相应测试、工作台打包依赖和本说明。
- 允许新增兼容旧调用的只读 `draft/canvas`、`draft/details` 聚合查询；请求沿用严格 DraftQueryRequest，各子结果沿用原有 schema 和 exact token 校验。禁止修改既有 API/schema、数据库 schema、依赖集合、业务模型数据及无关模块。
- 保留 Runtime 的持久化确认、exact-token 校验、写入锁、模型校验、幂等交付；不做无确认的乐观创建。

## 已复现问题

宿主对所有 POST 代理请求持有主题行锁，包含只读草稿查询。每次编辑后重新 open 并等待八项读取才更新画布。多个草稿查询还重复装配 Profile 和解析语义；文本查询重复装配资源。

## 验收

- A1：只读草稿 POST 不争抢主题写锁，修改和未知 POST 保守保留锁与作用域校验。
- A2：编辑确认后优先更新对应 token 的画布；慢文本、校验、目录不阻塞新元素显示。
- A3：切图、连续编辑、重新加载后，过期辅助查询不能覆盖新 token/context 的状态；失败有可见提示且不伪装成功。
- A4：草稿查询减少重复计算；保留完整校验和文件资产有效性检查，不引入无边界或跨版本缓存。
- A5：对象、过程、属性创建、布局编辑、草稿保存与重载通过回归；宿主使用新版工作台包。
- A6：普通编辑不再逐一请求 open/text/navigation/findings/relation-catalog；使用同快照 canvas/details 聚合读取，连续编辑合并辅助刷新；同 token/context 的相同目录或候选查询复用，旧 token 不复用。

## 实现计划与边界确认

1. 增补查询/修改锁分类及慢查询、过期响应回归测试，修复宿主代理锁。
2. 复用原快照校验，拆分关键画布读取与辅助刷新；每次编辑推进 token 并以 token/context/会话序号防止竞态。
3. 消除查询中不需要的资产装配和重复语义处理，必要的重计算按同版本复用。
4. 定向 Java/Vitest/类型检查、隔离数据浏览器验证，更新工作台包并重启本地有关进程，复测接口和实际创建显示耗时。

Checklist：边界已确认；按 A1–A5 验证并在下方记录实际结果。

## 第二轮实施

用户反馈提升不明显，确认第一轮没有减少创建后的请求数量。本轮边界已确认：增加两个只读聚合查询，保留原接口、模型校验、交付幂等和精确版本检查；前端减少重复目录及候选查询。验证实际请求数量、连续操作和保存重载，不以小模型计时推断大模型性能。

第二轮 Checklist：边界已确认；A6 与 A1–A5 一并验证。无数据库迁移；发布顺序 Runtime/业务代理 → 工作台包。

## 回滚

仅回退本次代码和工作台包引用，恢复原有代理及刷新流程；无需数据库迁移。

## 验证结果

- A1：宿主 Service/Controller 共 13 项测试通过；草稿只读请求不取主题行锁，修改/未知 POST 保留锁，取锁后重新核对绑定。
- A2/A3：5 个前端文件共 219 项测试通过；慢辅助查询不阻塞下一次创建，排队的过期刷新跳过，迟到响应不覆盖新 token，辅助查询失败保留已确认画布并提示。
- A4：Runtime Controller/模型校验共 64 项测试通过；包括投影重复读取不改变布局、编辑后读取新 token、旧 token 冲突，以及 130 个黄金夹具的关系和控制校验。每次查询仍验证数据库快照、token、活动 Profile 和资产；仅缓存最近四个模型的完全相同文档解析结果。
- A5：Vue 类型检查及工作台库构建通过；宿主更新 `0.2.2-platform.19`。隔离 PostgreSQL 模型浏览器验证对象、属性、过程和连续创建，约 379–406 ms 显示；文本请求人为延迟 2.5 s 时创建不等待，手动保存/重载节点一致，无页面异常。
- 用户主题 31 只读复测：同样五项并行查询从约 2.2 s 降到 1.16–1.32 s；未修改用户模型。该计时为查询批次，与隔离小模型创建计时不同。
- 已更新并重启本地 Runtime 17850、业务服务 8081、宿主前端 3000。宿主 Java 采用编译后的 `target/classes` 运行；定向 Maven 测试/编译通过。宿主完整 package 受本机缺失 `maven-jar-plugin:3.4.1` 缓存限制；Runtime jar 和工作台包已成功构建。

## 第二轮验证结果

- 请求实测：原普通创建为 capabilities → commands → open → projection，再请求 CREATE_STATE 候选和四项辅助查询，共9个；新版为 capabilities → commands → canvas，以及延后的 details，共4个。定时 save-state 轮询独立于创建，未计入上述数量。连续编辑期间跳过尚未发送的旧版辅助刷新。
- 规模验证：在独立 PostgreSQL 工具 schema 内追加180个元素和57条关系，画布约200节点。改前创建显示约1.9–3.0秒；新版三次测得1264/1567/1832ms。新版用 DOM MutationObserver 记录出现时刻，旧版为轮询计时，属于开发机观察范围，不能视作严格吞吐基准或所有模型的性能保证。单次 commands 仍需约0.65–0.91秒，完整校验和持久交付保留。
- 前端5文件226项回归通过、完整 Vue 类型检查通过，工作台库构建及 `0.2.2-platform.20` 打包成功。覆盖同token重复查询复用、失败重试、新token重新查询、聚合子结果身份不一致拒绝、旧辅助响应防覆盖。
- Runtime Controller 60项、模型校验5项通过；随后为文本生成异常处理补充断言并定向复测聚合一致性/坏文本2项通过。原接口保留，新接口覆盖旧token冲突、未知字段拒绝、画布/保存状态一致及无效OPL已有诊断时text=null。
- 宿主 Service/Controller 13项通过，新聚合查询无主题写锁，写请求继续保留锁。Runtime jar最终重新构建成功；宿主运行target/classes，未重新声称完整宿主package成功。
- 新隔离模型浏览器：对象、状态、属性、过程创建；将details延迟12秒，属性与后续两次创建均提前显示；手动保存并重载10个画布cell一致，无页面异常。较大模型测试中“创建状态”因重复测试节点堆叠而被安全空间检查拒绝，已换全新隔离模型验证状态创建，未移除布局保护。
- 本地 Runtime17850、业务8081和前端3000已更新。发现宿主Vite优化缓存仍引用旧工作台代码，使用--force重新生成；实际访问主题31页面（只读业务内容）确认新details与canvas经宿主返回200、token一致、无页面异常。仅重启前端或更新node_modules不足以保证缓存失效。
- 剩余限制：未在用户业务模型执行创建，不以隔离模型速度承诺其所有子图耗时；命令全模型校验、日志重放及复杂画布渲染仍可能随规模增长。后续应继续用实际模型规模和慢请求证据定位。

## 修改文件清单（含两轮）

opm-diagram：

- `apps/web/src/shared/api/draftWorkbenchSession.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.spec.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/WorkbenchSurface.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/scripts/package-workbench.mjs`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `docs/contracts/draft-workbench-aggregate-queries.md`
- `specs/opm-create-element-performance-bugfix-spec.md`

opm-platform：

- `services/opm-modeling/opm-business-service/src/main/java/com/opm/platform/opmmodeling/business/service/OpmWorkbenchService.java`
- `services/opm-modeling/opm-business-service/src/test/java/com/opm/platform/opmmodeling/business/service/OpmWorkbenchServiceTest.java`
- `apps/web-console/package.json`
- `apps/web-console/vendor/opm-workbench-0.2.2-platform.20.tgz`（本轮）；`.19.tgz`（第一轮）

隔离验证脚本、日志、运行jar备份均位于既有ignored目录，未改动用户业务模型内容。
宿主既有ignored的package-lock.json已同步至.20，并校验包路径和SHA-512完整性；没有执行全量依赖升级。
