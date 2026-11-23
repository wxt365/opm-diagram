# 检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/assistant-store-retry-spec.md

边界已确认：只修改存储实现、存储测试及本任务文档；禁止依赖/schema/安全/模型数据/其他模块变化。

- [x] STORE-01：短暂 EPERM/EBUSY 测试成功，中文 JSON 完整保存。
- [x] STORE-02：持续 EPERM 六次失败保留原记录且清理临时文件；ENOSPC 不重试。
- [x] STORE-03：503/CONVERSATION_SAVE_FAILED 提示不含路径，cause 保留底层错误；日志仅记录错误码和尝试次数。
- [x] STORE-04：失败后同会话下一次更新成功。

存储定向测试 3/3 通过；HTTP 4 项与实时回复 2 项用例通过。git diff --check 通过（现有换行转换提示）。

助手全套回归未通过：脑图“用户明确排除”用例 mindmap.test.mjs:61 出现 undefined.includes，单独复查可复现，尚未证明与本改动无关；全套及包含 service.test.mjs 的定向测试长时间无新输出未结束，已中止，不报告整体通过。不扩大修复范围。

已通过统一脚本重启，后台/助手健康与两个 LAN IP 页面返回 200。未调用真实大模型或修改用户模型；外部电脑重新生成及确认仍需使用者复测。未解决独立的 Bootstrap 会话未就绪问题。
