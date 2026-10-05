# Checklist: OPD 节点定义与渲染注册架构设计

## Spec Mapping

- 规格：`specs/opm-opd-node-renderer-registry-design-task-spec.md`
- 验收：`OPD-REG-01` 至 `OPD-REG-08`
- 边界：仅修改设计、索引和本 checklist；不修改产品代码、API、Schema、配置、依赖、数据或发布工件。
- 后继修正：关系的初始三 production 文件粒度已由 `specs/opm-opd-capability-definition-granularity-design-bugfix-task-spec.md` 取代；节点和共享 adapter 结论继续有效。

## Design

- [x] `OPD-REG-01` 分层、目录、接口、注册和禁止边界已冻结。
- [x] `OPD-REG-02` 五种内置节点和三族关系目录责任已冻结；16/8/10 文件粒度由后继修正承接。
- [x] `OPD-REG-03` Node Definition、RenderSpec、X6 adapter、Editor、Command owner 已分离。
- [x] `OPD-REG-04` 实例、类型、共享核心和 Symbol Catalog 的影响范围已冻结。
- [x] `OPD-REG-05` 注册完整性、隔离、anchor、交互、visual/E2E 和性能验收已冻结。
- [x] `OPD-REG-06` 后继迁移、禁止双实现和回滚边界已冻结。
- [x] `OPD-REG-07` 权威设计入口、索引和全局基线已同步。

## Verify

- [x] 新增及受影响 Markdown 相对链接有效。
- [x] `OpdNodeDefinition`、`NodeDefinitionRegistry`、`NodeRenderSpec` 和 `X6 adapter` 术语唯一一致。
- [x] 文档未把定义注册表描述为第三方插件 API，未把本设计描述为已实现。
- [x] `git diff --check` 通过。

## Verify Record

1. 检查 10 份新增或受影响 Markdown，全部相对链接指向现存文件。
2. 旧 `OpdElementDefinition/ElementDefinitionRegistry/ElementRenderSpec` 和旧文件路径零残留；Node 表现层术语与领域 Element/State/Feature 分类已明确分离。
3. 本轮最初冻结五个 Node Definition、三个 family renderer 和六个诊断码；后继 Capability 粒度修正将关系替换为 16/8/10 独立 Definition/Decorator，并补充 Control 诊断，初始三 renderer 不再是活动实现目标。
4. Control Definition 明确复用同一个基础 Fact/occurrence/relation group，不形成第二语义身份。
5. `git diff --check` 通过。本任务未运行前端测试、构建、浏览器 E2E 或性能测试，因为没有修改产品实现。
