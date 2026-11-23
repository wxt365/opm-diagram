# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/generation-progress-deadline-spec.md

边界确认：生成计时/信号/指导与测试文档；不改确认审查或运行时业务事实。

- [x] PROG-01：默认总600秒、无进展180秒；持久化成功且步骤变化后刷新；无变化重放不刷新；总上限仍独立测试通过。
- [x] PROG-02：显式generationTimeoutMs保持优先，generationIdleTimeoutMs独立配置；旧超时/恢复用例通过。
- [x] PROG-03：finish_generation先持久化submitted，再通知进入诊断审查；无方案/失败步骤拒绝，迟到工具和通知拒绝；指导1.4.3。
- [x] PROG-04：生成/服务/审查回归67/67，HTTP/质量9/9；真实父图三子图生成20步，追加父改名21步，两轮审查ready，确认edit_seq0→1，重复确认不变，保存SAVED，4图回读与预览一致。

真实验收仅project.1f62badea3074fa68c8c994fc7d9fce6/model.9d691fb4497c4921afd671788e07793d，模型实际调用finish_generation，未改业务模型。报告系统临时目录opm-progress-live-acceptance-report.json。服务已重启；git diff --check通过。

限制：本次成功样本不能保证所有请求不超时；完成信号后的后台模型流取消问题仍属前次审查发现，不扩大本任务修改。前端交互未实机验收，真实确认/保存通过HTTP执行。
