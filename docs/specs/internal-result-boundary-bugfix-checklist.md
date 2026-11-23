# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/internal-result-boundary-bugfix-spec.md

边界确认：运行时抽象规则与测试文档；不改用户模型或标准审查。

- [x] INT-01：内部Result后续Instrument不派生父前置；原四个细节事实仍在子图。
- [x] INT-02：自然语言问题外部输入及条件/SQL输出保持，OPL验证父图不再requires结构化条件。
- [x] INT-03：草稿Controller全类55/55通过，原子/稳定/原模式回归包含其中；git diff --check通过。
- [x] INT-04：用户当前方案只读preview/finalize阻断0，报告四个误提升fact不在父图；草稿token一致，未提交用户方案。

服务已重启。实际预览：主图23节点47关系，查询子图18节点30关系、分析10节点13关系、公司2节点1关系。未运行真实标准审查，不宣称全部审查通过。修改范围仅DraftSubgraphReorganization.java、DraftWorkspaceControllerTest.java、本规格及清单；无数据库schema变化。
