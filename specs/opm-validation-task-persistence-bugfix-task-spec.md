# 固定版本校验任务持久化修复

## 执行元数据与边界

- Work Mode：change；Risk Level：L3；Task Type：bugfix。
- Active Playbooks：backend-springboot（primary）、testing。
- 允许：LocalApiService 的校验任务、任务读取及基线证据门禁；模型清理时对应任务删除；对应后端与真实浏览器回归；本规格和已有设计说明。
- 禁止：API/schema 结构变化、数据库迁移、依赖/配置改动、Profile/Grammar 资产变化、其他功能重构、修改既有案例内容、`.harness` 修改。
- 保留当前所有既有 dirty/untracked 改动。repo-profile 是模板，实际运行命令按当前 Maven/npm 配置执行。

## 目标与非目标

修复固定输入版本的 validation-tasks 在混合保存模式下的持久化失败，保证任务、幂等收据和操作记录原子提交，重启后读取相同输入版本。复用现有模型检查并保留 INCOMPLETE，部分覆盖的结果不允许创建基线。

本轮不实现完整 ISO 规则引擎、不新增任务结果接口、不改变历史工作台的运行按钮、不将任务登记成功解释为完整标准符合性。

## 复现与根因

2026-10-03，本地 NEG 已保存版本 `revision.5c5fe60712e14bb19d5a46d8a0b8cd0f` 的 validation-tasks 返回 HTTP 500 PERSISTENCE_FAILED。对原库只读备份到内存后确认：版本在 draft_savepoint 中，revision_document 中不存在；按原 SQL 插入 background_task 触发 FOREIGN KEY constraint failed。operation_record.input_revision_id 也仅接受旧 revision_document。

原 MVC 覆盖使用旧保存模式，版本均存在于 revision_document，因此没有发现混合保存兼容问题。另有独立问题：校验只数基础结构错误，把零问题写成 COMPLETE，基线门禁只检查零阻断而未检查覆盖完整度。

## 契约影响与实现决策

保留现有请求与 TaskDescriptor 结构。旧版本继续写入旧外键；经现有历史读取验证的新保存版本，外键列使用允许的 NULL，精确 input_revision 和服务端 project/model 身份保存在既有 request_json 中。任务读取从该记录恢复输入身份。不得伪造旧修订、禁用外键或复制语义内容。模型永久清理同时删除这些归属明确的任务。

校验使用既有 DraftModelValidation，持久化实际问题和有限覆盖汇总；任务 COMPLETED 表示执行完成，coverage_state 保持 INCOMPLETE。基线必须同时满足零阻断、COMPLETE 和问题明细，旧的仅有汇总的错误 COMPLETE 证据不能通过。新任务摘要排除 request_id，旧收据支持原请求重放。

## 验收

- A1：旧版本和混合保存版本均可登记任务；重建服务后 TaskDescriptor.input_revision 与查询 meta.read_revision 保持原身份，不修改草稿、历史内容或版本头。
- A2：同命令重试返回同任务，不同输入的相同命令拒绝；失败事务不留下任务/收据/操作的部分提交。
- A3：固定版本使用已有全模型规则识别状态归属问题；零问题仍为 INCOMPLETE；基线拒绝部分覆盖和阻断证据。
- A4：历史任务兼容读取；永久删除模型不遗留新增任务、不影响其他模型任务。
- A5：真实浏览器保存画布后调用固定版本任务、重试和读取，服务重启后再次读取；原案例校验保留原语义与草稿身份。

## Plan

1. 补混合保存任务失败和覆盖/门禁回归，先观察失败。
2. 修正版本引用存储和读取，复用现有检查；补对应模型任务清理。
3. 定向后端回归、构建、真实画布保存流程及重启读取；记录实际证据。

## Checklist

- Spec：`specs/opm-validation-task-persistence-bugfix-task-spec.md`。
- 边界已确认：无 schema、API 结构、迁移、依赖或规则资产改动。
- [x] A1
- [x] A2
- [x] A3
- [x] A4
- [x] A5

## 验证与回滚

先执行新增失败测试，再执行 LocalApiController、DraftModelValidation 和模型生命周期定向回归及 Playwright。回滚仅撤销本轮差异；新任务身份保存在兼容 JSON 字段，回滚旧实现后新保存版本任务需恢复本轮代码才能正确读取。原模型语义与历史内容不变。

## 实际验证结果（2026-10-03）

- 失败回归：新增测试在旧实现下 4 项失败，分别观察到混合保存任务持久化失败、OPL 问题漏报和不完整证据放行基线。日志 `/private/tmp/opm-validation-red.log`。
- A1/A2/A3/A4：后端 4 个定向测试类共 25 项通过，包含 5 项新增任务回归、7 项模型生命周期回归；模型检查器遍历 130 个有效黄金夹具、34 项能力及根图/子图。覆盖新保存版本、旧外键任务、服务重建、重试时 request_id 变化、相同命令不同输入拒绝、操作记录故障回滚、OPL 问题持久化、部分覆盖及旧错误 COMPLETE 证据拒绝基线、模型永久删除只清理对应任务。Maven package 成功；日志 `/private/tmp/opm-validation-package.log`。
- A5：真实 Playwright 2 项通过（12.0 秒）。在画布创建错误关系、校验定位、修复并保存重开后，使用实际保存版本登记任务、以不同 request_id 重试并读取；返回同一 task/input_revision，草稿 token 不变。日志 `/private/tmp/opm-validation-e2e.log`；输出 `/private/tmp/opm-validation-e2e/`，其中 saved-validation-task.json 保存重启复核身份。
- 原案例：对原五个案例最新保存版本分别登记、重试和读取任务，均 COMPLETED、blocking=0、coverage_state=INCOMPLETE；比较 model_head、revision_document、draft_stream、draft_journal、draft_savepoint、draft_content 中对应五模型的快照，确认语义、草稿和保存历史未变。日志 `/private/tmp/opm-validation-runtime-cases.log`，身份与快照摘要 `/private/tmp/opm-validation-runtime-cases.json`。
- 真实重启：停止并重启后端后，原五案例及画布隔离模型共 6 个任务的完整 TaskDescriptor 与 meta.read_revision 均与重启前一致；日志 `/private/tmp/opm-validation-restart.log`。服务运行于 17850，前端沿用 5177。
- `git diff --check` 通过。本轮未修改前端产品源码，未重复上一轮 typecheck/lint。完整 ISO 规则和任务结果新接口仍不在验收范围；历史工作台运行按钮继续禁用。

## 本轮完整修改清单

- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/ModelLifecycleRepository.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/ValidationTaskPersistenceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/ModelLifecycleControllerTest.java`
- `tests/e2e/workbench-findings.spec.ts`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `specs/opm-validation-task-persistence-bugfix-task-spec.md`
