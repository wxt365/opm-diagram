# 桌面局域网 HTTP 网关检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[修复规格](../specs/desktop-lan-http-bugfix-spec.md)。

- [x] 边界确认：仅私网 HTTP 配置与桌面助手启动适配，不使用真实 Key 或调用用户网关。
- [x] H1：配置及边界回归。
- [x] H2：真实助手启动握手。
- [x] H3：设置提示、回归和新包。

## 证据

- 修复前新增设置测试稳定复现 HTTPS 限制（`/tmp/opm-lan-http-before.log`，2 项中 1 项失败）；修复后 `desktop:test` 12 项全部通过（`/tmp/opm-lan-http-test.log`）。覆盖三个 RFC1918 范围、边界外 HTTP 拒绝、路径/端口重读与 URL 认证/查询拒绝。
- 真实桌面助手使用假 Key 和私网 HTTP 配置启动握手成功；通过 `OPM_MODEL_HTTP_ORIGIN` 精确传递用户保存的来源，不改助手服务原来的默认限制。
- 最终 macOS 0.1.1 `.app` 在隔离系统主目录中测试：使用真实设置表单保存 `http://10.20.30.40:33000/v1`，选择 OpenAI 兼容服务，保存成功且助手“已就绪”；清除 Key、画布编辑保存、SQLite 重开、备份恢复和退出前保存均通过。该假地址未发模型请求，不能据此声称用户实际网关连通。
- 首次最终应用检查的默认 5 秒设置状态等待超时；将测试等待延长为 30 秒后完成，未调整产品校验或吞错误。测试运行中未替换 safeStorage；系统凭证持久化不是本轮验收项。
- 实际结果与截图：`/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-EMmRjP`，运行日志 `/tmp/opm-v011-smoke.log`。通过 `CFFIXED_USER_HOME` 隔离正式包数据，未操作用户客户端目录。
- 新包 `apps/desktop/out/0.1.1/make/dmg/arm64/OPM Studio-0.1.1-arm64.dmg`，395,726,349 字节，SHA-256 `48e67d82736904ceff1f146c4f01e4753ac97c4ee159c7befa8a68fc7e60839a`。DMG 验证、只读挂载、版本/图标/应用归档对照通过并已卸载；旧 0.1.0 DMG 保留。

仍为未签名、未公证的 Apple Silicon 测试包；Windows/Intel Mac、真实网关连通与在线多轮未验证。
