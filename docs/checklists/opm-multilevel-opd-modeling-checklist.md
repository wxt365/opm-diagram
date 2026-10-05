# ML-OPD-01 实施 Checklist

规格：[多层 OPD 建模](../../specs/opm-multilevel-opd-modeling-task-spec.md)。

边界：已确认版本化公共 API/JSON Schema、生成代码、文档和测试；不改 SQLite 表结构、旧迁移、依赖、配置、既有 Profile/Golden/发布工件、用户库及 `.harness/`。

- [x] ML-01：Object/Process 多层子图创建、重复候选拒绝、语义边校验及草稿重开已由定向测试覆盖。
- [ ] ML-02：草稿导航、前端父图返回和创建后跳转已验证；固定历史定位待保存链路打通。
- [ ] ML-03：子图元素、关系、State、名称、布局及 OPL 已验证；Digest/2 保存被现有 SQLite CHECK 阻断。
- [ ] ML-04：定向 Java、Node、Web 测试及生成、类型、lint、构建检查已运行；真实浏览器保存流程待数据库迁移决策。

当前阻塞：`draft_content.digest_version` 只接受 `SaveContentDigest/1`。规格禁止 SQLite schema 变更，已向用户申请是否允许新增最小迁移；未获答复前不修改数据库结构。
