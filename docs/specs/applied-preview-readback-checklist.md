# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/applied-preview-readback-spec.md

边界：仅前端生命周期/提示与测试文档；不改正式数据和确认契约。

- [x] READ-01：面板应用状态事件保护receive/token watcher清理；正式模型读回前保留预览。
- [x] READ-02：成功读取当前选择子图后清理预览；确认成功保留新视口，取消恢复旧视口。
- [x] READ-03：load返回false或异常提示读取失败并保留预览；按钮只重试load不重复apply。
- [x] READ-04：回读完成核对项目/模型及预览引用，离开不改新页面预览。

工作台/面板/视口121/121通过；typecheck及git diff --check通过。包含延迟load保留子图、失败重试无重复apply、成功/取消视口。Vite热更新提供新模块，未实测用户真实方案确认，不改变后端保存逻辑。
