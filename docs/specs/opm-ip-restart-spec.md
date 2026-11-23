# IP 访问重启修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: bugfix; Active Playbooks: none (primary).

## 目标与边界
通过统一重启入口保留当前本机 IPv4 + 前端端口的受信任来源，避免重启后写操作失败。允许新增 scripts/restart-local.ps1、本规格与清单；允许启动配置和文档变化。禁止修改 API、schema、依赖、安全守卫、业务代码、模型数据、.harness 及其他文件。不处理公网、多用户认证或防火墙策略。

沿用 OPM_TRUSTED_WEB_ORIGINS 精确来源契约，后台仅监听回环地址。默认前端端口 5173，可指定其他端口；自动枚举本机 IPv4，包含 localhost 来源以兼容代理 Host。

## 验收与验证
- IP-01：统一脚本配置两个后台相同的来源，并用 strictPort 启动前端。
- IP-02：本机 IP 页面、bootstrap、读接口返回成功；带有效会话的 v1/v2/助手请求不再返回 LOCAL_SESSION_INVALID。
- IP-03：未配置来源和伪造令牌仍被拒绝。
- IP-04：日志不打印密钥或会话；重启不改变数据。

执行脚本语法解析、真实重启与代理请求正反例；跨设备连通性需另设备验证，不据本机请求推断。

## 实施计划
复用现有守卫配置，新增脚本枚举 IPv4 并限制停止范围为当前项目启动树；后台日志写临时目录。完成真实代理验证后记录结果。

## 回滚
停止脚本启动的服务，按原 npm/Maven 命令启动，不传额外来源；前端可用 --host 127.0.0.1 限制访问。不删除数据。

## 使用
在仓库根目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/restart-local.ps1`。指定旧端口可追加 `-Port 5177`。每次重启重新识别本机 IPv4，IP 变化后再次执行；浏览器强制刷新以更新会话。需要本机进程管理权限、npm、Maven 和 JDK，Maven 优先从 PATH 查找，当前机器使用 IDEA 自带 Maven。日志写入系统临时目录。
