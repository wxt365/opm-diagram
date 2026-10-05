# 大文件职责拆分

状态：IMPLEMENTED_WITH_KNOWN_REGRESSION_GAPS（已实现；回归存在已记录的既有缺口）。Work Mode：change；Risk Level：L3；Task Type：refactor。
Active Playbooks：backend-springboot（primary）、frontend-vue、testing。

## 目标与非目标

依照现有模块设计，将运行时查询、OPL 生成、工作台状态、页面与画布、样式中的独立职责提取为可维护模块。保留用户当前未提交的 V2 草稿、布局和编辑功能。非目标：增加能力、改变交互、发布验证或提升 Gate 状态。

## 修改边界

允许：`services/local-runtime/src/main/java/org/opm/localruntime/application/`、`text/`，`apps/web/src/stores/`、`modules/workbench/`、`shared/styles/` 及必要的对应回归测试；本规格、对应 checklist 和模块说明。

禁止：改变公共 API、生成契约、数据库 Schema、依赖、配置、事务及错误语义；修改 `.harness/`；覆盖既有变更或用户数据。发布 runner 受冻结的 Runner Source Set 约束，不在本次普通模块提取中改变其源码集合，单独记录后续边界。

## 不变契约

- API 返回值、错误码、Profile binding、V1/V2 行为和构造器兼容性不变。
- 保存、重试、并发锁、token/sequence 的单一所有者不变。
- OPL/Trace 顺序、标识、UTF-8 范围和 golden 结果不变。
- 画布保持唯一 Graph，节点身份、选择、拖动、平移、重命名不变。
- HEAD/EXACT 路由语义、DOM 标识、样式级联顺序不变。

## 验收与验证

| ID | 验收 | 验证 |
|---|---|---|
| RF-01 | 后端纯查询/规则职责提取，现有入口兼容 | LocalApiService、MVC、DraftWorkspace 测试 |
| RF-02 | OPL 独立职责提取，生成结果一致 | OplTextGenerationService、OplMultiContext 及文本测试 |
| RF-03 | 工作台映射与交互职责提取，状态所有权保持 | 全量前端单测、typecheck、lint |
| RF-04 | 页面/画布职责与样式拆分，UI 行为保持 | 前端 build、工作台浏览器回归 |
| RF-05 | 范围和回归证据可复核 | diff 检查、逐模块记录、未验证边界说明 |

## 实施计划

1. 记录基线，先提取后端无存储查询，再拆 OPL 独立流水线职责。
2. 将工作台纯映射与候选交互提取，保持会话和提交串行器唯一。
3. 提取页面、画布独立职责，按原顺序迁移样式，不做视觉改版。
4. 执行定向与跨模块回归，核对发布 runner 的冻结限制。

回归适配：仅修正工作台旧 E2E 对 V1 请求外壳、草稿序号即 Revision、旧 release capture 标记和旧工具提示的假设；保留业务结果断言，实际保存并固定版本后验证 EXACT，不修改生产行为。

基线：前端 19 文件/221 测试通过；后端定向 229 测试通过（Java 21、离线 Maven）。

完成记录：[实现与验证报告](../docs/reports/opm-maintainability-module-extraction-report.md)。前端 221/221；后端全量 484/486；工作台浏览器 24/26。失败项及未纳入的发布 runner 拆分边界均在报告中保留，不声明全量通过或发布就绪。

## 回滚

仅逆向应用本任务提取补丁并删除本任务新增文件；保留任务开始前全部 tracked/untracked 修改。不执行 reset、checkout 或数据重置。
