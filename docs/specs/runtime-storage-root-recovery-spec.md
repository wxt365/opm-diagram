# Runtime 存储路径恢复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

执行：change / L2 / bugfix / none (primary)。当前无 repo-profile、Task Type 或 playbook 文件。

目标：恢复 services/local-runtime/runtime-data 下原 16 个项目，同时保留重启后仓库根 runtime-data 新建的 1 个项目。根因：jar 在仓库根目录启动，默认相对 storage.root 改变。
非目标：删除数据、修改模型内容、数据库 schema、依赖或源码。
范围：允许以后台进程重启 Runtime，复制仓库根 runtime-data/projects 下唯一的新项目到原服务存储目录；写启动日志及本规格。禁止删除/移动原目录、覆盖同名项目、修改其他进程。
契约：API 不变，显式 --opm.storage.root 使用原目录绝对路径；项目/模型 ID 不变。
验收 R1：原 16 个项目可读；R2：新项目保留且无目录覆盖；R3：启动后项目 API 返回 17 项并包含智能仓储系统和新项目；R4：CORS/session 仍通过。
验证：停当前 Runtime 前确认身份与源/目标绝对路径；复制后 SQLite integrity_check 和项目/模型元数据一致；启动后验证健康/项目/模型及预检。核对原模型语义记录和草稿根图以必要只读查询完成。
回滚：保留源数据目录，后端可重新指向源路径；复制只增加不存在的项目，不执行删除。旧数据未迁移也未删除。

计划：明确源/目标与冲突检查 → 停止当前 Runtime → 复制单个新增项目 → 校验 → 显式旧绝对路径启动 → API 验收。
Checklist：Spec=docs/specs/runtime-storage-root-recovery-spec.md；边界已确认；R1/R2/R3/R4 全部通过。

## 实际验收
- R1：旧存储目录存在 16 个项目；智能仓储系统的原料加工模型和船舶1均由当前 API 返回 EDITABLE_DRAFT；原数据库 integrity_check=ok，历史修订及 draft_content/draft_stream 存在。
- R2：只复制不存在的 project.8e752b06fabf47f09a93c7ee4673a8d5 目录；源目录保留，新项目源/目标 integrity_check 均为 ok，项目与模型元数据一致。
- R3：恢复后项目 API HTTP 200，返回 17 项，包含智能仓储系统和刚新增的我的业务项目；新模型 ID 保持 model.a59e5a7635044fa2b28a53bd849e4ba1。
- R4：健康检查 UP；localhost:3000 与 127.0.0.1:3000 的预检 HTTP 200、Allow-Origin 正确，JSON session HTTP 200 且会话有效。
- 启动明确指定 --opm.storage.root=E:\00-ds-work-code\opm-diagram\services\local-runtime\runtime-data，日志位于 runtime-data/service-logs/backend-restored-20261014-095325.*.log；原前端、宿主前端及助手没有停止。
- 本次不删除任何数据库、不修改 schema、API 或源码。页面需刷新，旧会话在 Runtime 重启后会失效。
