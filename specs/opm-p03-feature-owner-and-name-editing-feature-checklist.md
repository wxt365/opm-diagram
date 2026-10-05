# Checklist: OPM P03 Feature Owner 与名称编辑

- Spec：`specs/opm-p03-feature-owner-and-name-editing-feature-task-spec.md`
- 验收项：`FEATURE-NAME-01` 至 `FEATURE-NAME-03`、`FEATURE-UI-01` 至 `FEATURE-UI-02`、`FEATURE-OWNER-01` 至 `FEATURE-OWNER-02`、`FEATURE-VERIFY-01`
- 边界确认：只修改 Spec 第 3 节允许文件；允许扩展现有 OpenAPI 字段及对应生成物，禁止修改数据库、依赖、路由、配置、Profile/Golden/Release 与范围外模块。
- [x] 已核对 Attribute owner 投影/折叠、Element 名称编辑与 Feature 创建的现有复用点。
- [x] `UPDATE_PROPERTY` 契约、Runtime 能力和 Draft Feature 改名完成。
- [x] 右侧面板、画布双击、Feature 所属连接和 owner 折叠完成。
- [x] 契约、Java、Vue、typecheck/build、Playwright 与静态检查证据完成；`git diff --check` 因当前目录 Git 元数据不可用，以 28 个变更文件的冲突标记/行尾空白扫描替代。
