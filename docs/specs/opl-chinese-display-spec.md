# OPL 中文显示

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: feature; Active Playbooks: none (primary).

目标：底部 OPL 面板固定关系词显示对应中文，导出与显示一致。允许修改 WorkbenchBottomPanel.vue 及对应测试、新增同目录中文显示函数与测试、本规格/清单。允许显示层文案和导出内容变化；禁止后端/API/schema/依赖/资产/模型数据/.harness 修改。非目标：翻译用户模型名称、改变标准原始 OPL 生成或提供全部自然语言语法翻译。

验收：ZH-01 invokes/requires/yields 等常见固定关系词显示中文；ZH-02 模型名称与用户关系标签原文保留，定位身份不变；ZH-03 导出与面板中文文本一致；ZH-04 未识别内容保留原文。

计划：独立显示函数保护模型名称与标签后转换已知词组，仅面板使用，定位仍传原始行。定向 Vitest 加类型检查。回滚：恢复面板改动与删除新显示函数，原始后端文本及模型数据不变。
