# 检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/opm-ip-restart-spec.md

- 边界已确认：仅脚本与本任务文档；禁止 API/schema/依赖/业务/数据/.harness 变化。
- [x] IP-01：脚本语法解析成功；真实启动后 5173 监听 0.0.0.0，17850/17860 监听 127.0.0.1。
- [x] IP-02：192.168.31.167、192.168.137.167、localhost 的页面、Bootstrap、带 request_id 项目列表均成功；合法会话 v1 返回 INVALID_ARGUMENT，v2 返回 INPUT_INVALID，助手返回 NOT_FOUND（使用不存在模型）；均通过来源校验，无数据写入。
- [x] IP-03：三个来源的 v1/v2/助手未授权 Origin、伪造会话均返回 403。
- [x] IP-04：只输出地址与日志路径；未删除或修改模型数据。

未执行跨设备访问；本机真实 IP 请求已验证，外部路由及防火墙仍需目标设备实测。

助手 HTTP 定向测试：沙箱内 spawn EPERM，提权重跑后 4/4 通过。脚本语法解析及 git diff --check 通过。
