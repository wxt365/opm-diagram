# 脑图入口不可用的日常服务恢复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：恢复日常 17850 Runtime 与 17860 助手，验证工作台 5177 的已有模型、新建模型可以进入脑图并保存重开。

非目标：更改脑图禁用条件、建模语义、公共接口、schema 或依赖；删除/重置模型、修改密钥配置、提交 Git。

允许：本规格、助手启动说明；本机服务进程、独立 JAR 副本、SQLite 一致备份及独立验证模型。禁止：用户模型正文、既有迁移、`.harness/`、无关代码。

事实：截图有 PERSISTENCE_FAILED、图列表为空；脑图按钮依赖 draftToken。17850 进程从 10:58 启动并直接使用 target JAR，磁盘 JAR 16:56 被重新构建。日志有 ThrowableProxy 类加载失败；项目恢复标记报告 UncheckedIOException / EOFException；本机请求超时。

原因判断：运行中的构建产物被替换，导致旧进程延迟读取 JAR 失败。原实施只用隔离服务验证并未恢复日常服务，不能据此认为日常入口可用。恢复后继续检查实际读取，不以该判断代替验证。

契约影响：不更改契约；最新构建包含已实施的 V8，原库升级由现有 migrator 检查与备份，不能绕过 recovery marker 或修改 Flyway 记录。

验收：MR-01 保留原存储路径，停止旧进程并生成 SQLite 一致备份，启动独立不可覆盖的最新 JAR；MR-02 截图模型草稿和图列表正常读取，脑图可打开；MR-03 独立新建模型可进入脑图，编辑、保存、刷新恢复，正式模型 token 不变；MR-04 启动文档明确稳定副本与数据备份，不直接运行可被构建覆盖的 JAR。

验证：先本机健康与已有模型只读 API，再真实浏览器新建独立模型、脑图编辑和刷新；检查迁移标记/版本与保存结果；git diff --check。

回滚：保留新表和资料，停止故障进程后从独立 JAR 重启；若需要恢复迁移前数据库，先停止写入并明确恢复点后的数据损失，不能直接换旧 JAR 降级 V8。

## Plan

1. 核对进程/日志/资源与存储，保留失败证据。
2. 停止旧服务，备份数据库，复制最新 JAR 到独立启动路径并启动助手。
3. 只读检查截图模型，再用独立验证模型执行浏览器流程。
4. 同步启动说明和实际验证证据。

## Checklist

引用：本文件 Spec；边界确认完成，保留当前未提交的脑图实现。

- [x] MR-01
- [x] MR-02
- [x] MR-03
- [x] MR-04

## 验证记录

2026-10-05：原 Runtime PID 48627 直接引用 target JAR，启动时间 10:58，JAR 修改时间 16:56；日志为 `/private/tmp/opm-review-runtime.log`。只读 GET 项目列表在 10 秒后超时；项目 recovery marker 明确报告 EOFException。恢复没有更改按钮禁用逻辑。

- MR-01：停止旧 Runtime/助手；四个项目停机后均无 WAL，使用 SQLite backup API 生成一致备份，integrity_check 全部为 ok、迁移版本均为 V7。只读 WAL 打开失败后使用已停机且无 WAL 的 immutable 连接；未修改原库。备份与 SHA256 一致的独立 JAR 位于 `/private/tmp/opm-mindmap-recovery-20261005/`。Runtime PID 54332 从该副本运行，存储仍为 `/private/tmp/opm-diagram-preview-runtime`；助手使用绝对路径 Node 22.22 启动，沿用原配置。默认 shell 的 node 在升级权限环境中不支持 env-file 参数，改用已安装的 Node 22，未改配置。
- MR-02：actuator health 为 UP，项目及模型列表成功。真实浏览器打开截图模型 `model.617b0ea3d00c492eb87c7874eeede3b4`，根图恢复、正式编辑序号仍为 1，脑图按钮可用且分析树实际可见。原项目由既有 migrator 完成 V7→V8，自动生成迁移前一致备份并解除 recovery marker，未手动修改迁移记录。截图 `original-model-mindmap.jpg`。
- MR-03：真实浏览器从项目详情创建独立模型“脑图入口恢复验证-20261005”（`model.270d06da069644a695208ff24a6ec725`），进入脑图，在“对象”分支添加“咖啡豆”，设置对象类型，自动保存显示“分析已保存”；刷新后节点名称和类型恢复，正式编辑序号仍为 0。截图 `new-model-mindmap.jpg`。没有在用户原模型生成/确认建模修改。验证模型保留为记录。
- MR-04：助手 README 新增独立启动副本、服务更新加载方式、原存储及恢复标记说明。未修改产品代码/API/schema/依赖或密钥配置。

浏览器操作使用 Codex in-app browser；最初全局浏览器清单有 Chrome 授权错误，独立 in-app 标签可以正常使用。直接 curl 调用受保护的 draft/open 返回 LOCAL_SESSION_INVALID，改用正常浏览器会话执行，未绕过会话校验。没有发送新的 DeepSeek 请求，本轮只验入口及保存恢复。

截图和备份均在 `/private/tmp/opm-mindmap-recovery-20261005/`；服务日志为 `/private/tmp/opm-mindmap-recovered-runtime.log`、`/private/tmp/opm-mindmap-recovered-assistant.log`。前端 5177 原进程保留；Runtime 17850 与助手 17860 已加载最新代码。浏览器最终留在截图原模型的脑图页面。

最终验证：git diff --check；仅文档与进程恢复，本轮无需重跑前轮完整产品测试。
