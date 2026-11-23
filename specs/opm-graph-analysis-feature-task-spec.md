# OPD 图谱分析实施文档

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

日期：2026-10-30

状态：首版已实现并完成定向验证；未完成的性能目标见第 7 节。执行元数据为 change / L3 / feature / none (primary)。

设计依据：[图谱分析设计方案](../docs/design/opm-graph-analysis-design.md)

## 1. 本次文档任务 Plan

### 2026-11-02 参考图视觉密度修正 Spec

change / L2 / bugfix / none (primary)。目标：全图概览中圆点保留可见尺寸、仅展示空间允许的重要节点标签，平衡弱边和节点的视觉层级；保留真实力导向和全部语义数据。允许图谱 Canvas、布局展示辅助函数、直接测试、现有 E2E 和本规格；禁止后端、契约、依赖、配置及用户数据。VIS-01：缩小后节点仍约 9～14 屏幕像素；VIS-02：默认标签不堆叠，选中/悬停/搜索优先显示；VIS-03：保持全模型和拖动重热。Plan：屏幕尺寸节点→重要性排序与标签空间预算→真实截图。边界已确认；Chrome E2E、typecheck、lint 和 diff 检查通过，真实 177 节点截图已人工检查。回滚仅恢复本次视觉样式和标签策略。

结果：修复空数据首次 render 错误消耗 needFit，使用真实位置计算初始概览；屏幕固定圆点半径、重要性排序与每视口标签预算、标签隐藏使用 display 防止空文本残留。默认约 27% 视野显示完整网络，节点清晰且标签有选择显示。最新合成压力样本 300/1,000 首绘约 3,482ms，1,000/5,000 约 26,144ms，超大图性能明显不足，未将其计为性能验收通过；本次仅完成参考图视觉调整，既有大图性能风险持续保留。

### 2026-11-02 力导向模拟修正 Spec

change / L2 / bugfix / none (primary)。目标：移除来源分区和强制圆形拉伸，以全局斥力、统一边弹簧、弱中心力、速度阻尼和碰撞形成自然网络；拖动后固定锚点并重热其余节点。允许修改图谱 layout、Worker、Canvas、直接测试、现有图谱 E2E 和设计/本规格；禁止后端、契约、依赖、配置及用户数据修改。验收 FORCE-01：改变关系会改变位置，不保证圆形；FORCE-02：斥力分离重叠、弹簧收缩长边、孤立节点受中心力约束；FORCE-03：拖动锚点不动、邻居移动，隐藏/卸载停止；FORCE-04：中文、完整模型与筛选定位无回归。Plan：Worker 模拟→拖动重热与中间帧→物理行为单测和浏览器回归。Checklist：边界已确认；FORCE-01/02 的物理单测、FORCE-03 的锚点单测及真实拖动、FORCE-04 浏览器回归通过；隐藏/卸载取消路径经代码检查，未单独增加自动化销毁测试。回滚仅恢复本次前端改动。

本次实际验证：图谱定向单测 8 项通过；typecheck、lint、diff 空白检查及前端生产构建通过。Chrome E2E 通过并检查力导向截图，包含实际拖动后超过一个节点位置变化、完整模型、中文、历史只读、筛选定位和无模型写入。300 节点/1,000 边纯布局约 380ms，浏览器首次渲染约 1,986ms；1,000/5,000 约 9,979ms（开发环境单次观察）；大图首次模拟较慢，既有性能限制仍保留。当前采用有界稳定模拟和拖动后重热，中间帧只在重热时发送，不是无限常驻物理循环。未修改后端，未执行全库回归。

### 2026-10-30 全模型拥挤布局修正 Spec

执行元数据：change / L2 / bugfix / none (primary)。目标为全模型整体圆形自然分布、局部按来源建模图聚集，增加标签占位与节点间距，并在缩放时避让重叠标签；不减少模型查询范围或隐藏语义节点/关系。用户已明确拒绝矩形分区排布，布局不根据窗口宽高比拉伸成矩形。允许在中文显示任务范围外追加 `graphAnalysisLayout.ts`、`GraphAnalysisCanvas.vue` 和直接测试修改；禁止后端、API、依赖、配置及用户数据修改。验收 SPACE-01：177 节点真实模型整体圆形分布且不堆叠；SPACE-02：标签碰撞避免且选中/悬停可读；SPACE-03：刷新保留位置、重排可重复、无节点丢失。验证为布局单测、类型/lint、真实浏览器截图；回滚恢复此前布局与标签策略。Checklist：边界已确认；SPACE-01/SPACE-02/SPACE-03 已验证。

实际结果：图谱定向测试 8 项通过（含 177 节点无标签占位重叠、整体宽高比约 1、稳定位置与确定性）；类型/lint/diff 检查通过；Chrome E2E 通过。实际截图 `graph-analysis-circular.png` 已检查为圆形自然网络，`graph-analysis-spread.png` 展示清晰浏览视野。初始不强行缩小至全图，用户可切换“全图概览/清晰浏览”。缩放标签使用空间索引避让并缓存属性更新；300/1,000 样本渲染约 958ms、筛选 208ms，1,000/5,000 约 4,924ms、筛选 411ms；为单次开发环境观察，既有性能目标仍保留未完成状态。本次未修改或重测后端。

### 2026-10-30 图谱中文显示修正 Spec

执行元数据：change / L2 / bugfix / none (primary)。目标是图谱关系名称、筛选、画布标签、端点角色及系统提示使用中文；保留用户自定义名称，技术标识仅折叠查看，不修改其真实值。非目标为改写模型内容或 API。

允许范围：`graphAnalysisModel.ts`、`GraphAnalysisPanel.vue`、`useGraphAnalysis.ts`、`GraphAnalysisPanel.spec.ts`、现有图谱 E2E 与本规格；禁止其他源码、后端、契约、配置、依赖、schema、真实用户数据。验收 ZH-01：已有 26 类过程/结构关系及状态归属均显示中文；ZH-02：详情角色、系统文案中文化且用户自定义标签保留；ZH-03：中文显示不影响筛选、定位、默认全模型及请求身份。验证为定向测试、类型检查、lint 和浏览器验收。回滚仅移除此显示映射及文案修改。

Plan：前端集中维护关系/角色中文映射，在展示适配中统一处理画布、筛选和详情；后端枚举不变。Checklist：边界已确认；ZH-01/ZH-02/ZH-03 已通过，定向测试包含中文映射、端点角色、自定义标签保留；Chrome 验收检查实际关系筛选无英文系统类型。

### 2026-10-30 默认完整模型修正 Spec

执行元数据：change / L2 / bugfix / none (primary)。用户明确要求一个模型的全部内容，包括各级子图与同级图。目标是首次打开和切换模型时默认 MODEL；全模型图谱不因仅切换当前 OPD 而过期。非目标为修改后端语义、API、数据库、依赖或其他功能。

允许修改 `useGraphAnalysis.ts`、`GraphAnalysisPanel.vue`、`GraphAnalysisPanel.spec.ts`、`tests/e2e/opm-graph-analysis.spec.ts` 与本设计/规格；禁止其他目录及配置、依赖、schema、用户数据修改。契约无影响，复用现有 MODEL 投影。

验收 FULL-01：首请求为 MODEL，包含隐藏状态；FULL-02：同一模型切换 OPD 不失效全模型结果，主动选择局部范围仍按 context 隔离；FULL-03：切换模型恢复全模型默认范围。验证为定向单测、类型/lint 及只读浏览器测试。回滚仅恢复此次默认范围和身份判断，保留前次功能实现。

Plan：先调整身份 key 与默认值，再同步文案和测试；后端已有 MODEL 读取全部实体及事实，无需修改投影。

Checklist（引用本节）：边界已确认；FULL-01/FULL-02/FULL-03 已通过。图谱定向单测 6 项、typecheck、lint、diff 空白检查通过；Chrome 只读 E2E 通过，断言首次请求和响应均为 MODEL。未改动后端，未重跑后端测试。

### Lean Spec

- 执行元数据：Work Mode `change`；Risk Level `L1`；Task Type `feature`；Active Playbooks `none (primary)`。
- 目标：交付设计方案和可执行的实施规格，覆盖前端、后端、契约、验证和回滚。
- 非目标：本次不实现功能、不新增接口、不调整运行服务、不执行数据迁移。
- 允许范围：仅新增 `docs/design/opm-graph-analysis-design.md` 和本文件；允许文档修改。
- 禁止范围：`apps/`、`services/`、`packages/`、`scripts/`、`tests/`、`runtime-data/`、`.harness/` 以及其他现有文件；禁止修改 API、schema、配置、依赖和测试。
- 契约影响：仅描述拟议契约，运行契约没有变化。
- DOC-01：两份文档互相链接，明确设计状态和实际实现状态。
- DOC-02：覆盖页面、语义映射、接口、一致性、实施步骤、验收和回滚。
- DOC-03：只新增允许文件，链接目标有效，diff 无空白错误。
- 验证：检查文档结构、引用路径、变更范围及 `git diff --check`；不运行与纯文档变更无关的应用测试。
- 回滚：移除本次新增的两份文档即可，不涉及运行状态或数据回滚。

### 实现顺序与不确定项

1. 根据已核对源码写入设计方案，区分现有复用点和拟议实现。
2. 将功能目标编排为独立实施规格、阶段决策和验收清单。
3. 核对文档链接、完整性和修改边界。
4. `.harness/repo-profile.md`、`.harness/task-types/feature.md` 当前不存在；不创建替代规则文件。未来实施前需重新核对规则入口。

### 文档任务 Checklist

- [x] Spec：`Plan#Lean Spec`；允许/禁止边界已确认。
- [x] DOC-01。
- [x] DOC-02。
- [x] DOC-03：UTF-8、相对链接、验收 ID 和修改边界检查通过。

## 2. 后续功能实施 Spec

以下约束适用于未来功能编码，不意味着本次文档任务允许修改源码。

### 2.1 目标与非目标

目标：新增“图谱分析”Tab，从一致 OPD 语义快照生成过程、对象、状态关系网络，支持三个分析范围、筛选、搜索、邻域高亮、详情和 OPD 来源定位。

非目标：跨项目、三维、AI 推断、图谱反向编辑 OPD、图数据库、业务数据迁移、分析布局服务端持久化。

未来执行元数据：Work Mode `change`；Risk Level `L3`；Task Type `feature`；Active Playbooks 在实施启动时按实际可用规则确认，未匹配时为 `none (primary)`。L3 原因是新增公共查询 API、生成契约及前后端跨模块数据约定。

### 2.2 允许和禁止边界

| 类型 | 拟允许范围和限制 |
| --- | --- |
| 前端 | `apps/web/src/modules/workbench/`、相关工作台 store、共享 API 和类型、已有服务注入适配器及直接受影响测试 |
| 后端 | `services/local-runtime/src/main/java/org/opm/localruntime/api/`、`application/` 的新查询与必要复用代码；对应测试 |
| 契约 | `docs/contracts/` 中经生成脚本核对后的准确契约源及生成产物；不手工维护双份类型 |
| 端到端 | `tests/e2e/` 中图谱用例及必须的最小夹具 |
| 文档 | 本设计、本规格，以及实施时确需更新的接口说明 |
| API | 允许增量新增图谱只读查询契约，不改变已有接口的语义或 token 格式 |
| schema | 允许请求/响应 JSON schema；禁止数据库 schema 和迁移 |
| 配置/依赖 | 默认禁止；布局验证证明必要时另行明确范围，不能顺带升级 X6 |
| 数据 | 禁止修改真实项目、批量导入示例或重写历史版本 |

禁止 `.harness/` 新增内容、无关重构、全库格式化、助手协议扩展和发布部署。实施前列出契约源与生成路径、实际适配器和 store 的精确文件清单，完成边界确认后再编码。

### 2.3 验收标准

| ID | 可观察结果 |
| --- | --- |
| GA-01 | 新 Tab 位于脑图右侧；OPD、脑图、图谱往返保留各自状态，脑图脏内容保护不失效 |
| GA-02 | 默认读取当前草稿；当前图、下级图、整个模型范围结果符合设计；历史版本读取固定版本 |
| GA-03 | 过程/对象/状态正确分类；同名异 ID 不合并，同实体多出现位置合并，状态归属明确 |
| GA-04 | 关系类型、方向、多重边、自环与多端点分组正确；原始/派生/渲染边计数可核对 |
| GA-05 | 搜索、类型/关系筛选、标签、缩放、适应画布、一/两跳邻域行为符合设计 |
| GA-06 | 节点和关系详情可追溯；跨 OPD 定位正确；多个来源可选择；缺失来源有明确提示 |
| GA-07 | 完整 token 冲突、规则冲突、旧响应、模型切换、刷新失败均不展示为当前成功结果 |
| GA-08 | 图谱查询和拖动不修改模型、token、OPD 布局及存储；只读版本可分析，权限校验有效 |
| GA-09 | 空数据、无筛选结果、隐藏状态、边界节点、未支持能力和超限均有明确反馈，无悬空边和静默截断 |
| GA-10 | 契约生成和检查通过；现有 OPD 编辑/保存/撤销、脑图和助手受影响回归通过 |
| GA-11 | 主性能样本达成确认后的预算；记录接口/布局/渲染；大图与超限不导致界面持续阻塞 |
| GA-12 | 无障碍 Tab 和筛选可键盘操作，颜色附带类型说明；窄视口及面板尺寸变化后画布正常 |

### 2.4 契约落地决策

新增草稿与历史版本两个图谱查询入口，字段与响应见设计第 5 节。使用新图谱 DTO，不强行扩展原 `DraftQueryRequest` 为大量可选字段。不修改现有 token 类型。

为每种现有能力建立映射矩阵：能力 ID、端点角色、方向、是否支持二元分解、标签、测试样本。矩阵中没有可靠映射的能力先明确排除并返回 warning，不允许猜测。节点仅三类，因此不能以关系节点绕过多端点建模决定。

会话和权限错误、草稿冲突、规则冲突复用现有错误约定；超限原因码及状态码在契约阶段定稿。历史版本查询必须确认现有读取链路不会隐式创建草稿。

## 3. 实施 Plan

### P0：技术确认与边界收敛

1. 重读当前规则、相关实现，确认准确契约源和生成命令，补全精确变更清单。
2. 完成能力映射矩阵，确认对象状态与 Feature 状态处理及 OPD 上下文树来源。
3. 用现有 X6 验证 300 节点/1,000 边的多重边、自环、标签和 Worker 布局；评估布局库是否必要。
4. 固定性能测试环境、预算、返回上限、历史查询路径和错误码。

退出条件：边界已确认，未决语义没有被代码猜测，契约可以独立评审。

### P1：后端投影与契约

1. 定义并生成请求、响应契约；保持变更向后兼容。
2. 实现纯 `GraphAnalysisProjector` 和关系映射模块，先通过语义夹具测试。
3. 实现查询 Service，接入现有权限、快照和规则校验，复用历史读取能力。
4. 添加 Controller 和 API 调用；验证完整快照、来源引用、结果上限和确定性排序。

退出条件：GA-02/03/04/07/08/09 的后端部分和契约检查通过。

### P2：前端图谱视图

1. 新增独立 GRAPH 模式与懒加载容器，不将 GRAPH 透传到既有助手上下文。
2. 实现 composable 的请求隔离、过期标记、取消和错误状态。
3. 接入 X6、Worker 布局、平行边、自环和稳定位置缓存。
4. 添加统计、筛选、搜索、详情、邻域高亮、标签和缩放操作。

退出条件：GA-01/05/09/12 的主要交互通过，隐藏/卸载视图没有残留 Worker 和事件。

### P3：OPD 联动与回归

1. 通过来源引用接入现有打开上下文和选择节点能力，禁止标签反查。
2. 验证离开脑图、历史只读、模型切换、草稿更新与刷新失败。
3. 逐项执行真实模型对照和端到端测试，记录性能及必要调整。
4. 更新契约说明和验证记录，完成回滚演练；本任务不自动部署。

退出条件：全部 GA 验收项有实际证据，未执行项和限制被明确记录。

## 4. 实施 Checklist

Spec 引用：`specs/opm-graph-analysis-feature-task-spec.md#2-后续功能实施-spec`。下列未勾选项均为未来工作，不表示已执行。

- [x] 实施边界：精确文件清单、契约源和规则入口已重新确认。
- [x] P0：GA-04、GA-11 的映射与技术边界确认。
- [x] P1：GA-02、GA-03、GA-04、GA-07、GA-08、GA-09、GA-10。
- [x] P2：GA-01、GA-05、GA-09、GA-12。
- [ ] P3：GA-06、GA-07、GA-08、GA-10、GA-11、GA-12。
- [x] 运行产物来自当前源码；除健康检查外，已实际调用图谱接口和前端代理。
- [ ] 所有验收项有测试报告或可复现人工证据，回滚已确认。

## 5. 验证方案

### 自动化测试

- 投影单测：同名异 ID、多个出现位置、重复事实、多重边、自环、对象状态、隐藏状态、边界端点、多端点及未知能力。
- API 集成：当前草稿与历史版本、完整 token 冲突、规则变化、越权、来源校验、超限、只读无写入。
- 前端单测：筛选后计数、邻域、搜索恢复显示、迟到响应、数据过期、位置缓存、资源销毁。
- E2E：新增 Tab、三个范围、筛选和详情、跨 OPD 定位、切换模型、脑图脏内容保护及 OPD 保存撤销。

拟执行命令如下，未在本次文档任务中执行。实施时先核对实际脚本与新增测试文件名，Maven 使用可用安装或仓库 wrapper，不依赖失效的 JAVA_HOME。

```powershell
npm run contract:check
npm run contract:validate
npm run typecheck
npm run lint
npm run test --workspace=@opm/web -- src/modules/workbench/GraphAnalysisPanel.spec.ts
.\mvnw.cmd -pl services/local-runtime '-Dtest=GraphAnalysis*Test' test
npx playwright test tests/e2e/opm-graph-analysis.spec.ts --config=tests/e2e/playwright.config.ts
```

新测试路径是计划名称。定向通过后按受影响范围运行工作台、脑图、助手和后端查询回归；实际命令及结果写入实施验证记录。纯函数单测不要求连接真实生产数据库；需要数据库的集成测试沿用隔离策略，不修改用户项目。

### 手工验证

1. 准备测试模型：同名对象两个、共享对象跨两个 OPD、对象状态、消耗/生成关系、多重边和一个多端点关系。
2. 打开图谱，核对三个范围的 ID、数量、方向和排除提示；比较原图和模型事实。
3. 筛选状态与关系类型、搜索同名节点、展开邻域，检查可见数量与详情。
4. 从共享节点选择不同来源 OPD 定位，检查打开图和选中位置均正确。
5. 编辑 OPD 后切回图谱，检查过期提示；刷新后内容更新且原布局尽量保留。
6. 在请求未返回时切换模型；旧响应不得污染新模型。
7. 历史版本执行同样操作，比较前后 token、内容和 OPD 布局，确认无写入。
8. 在固定性能环境重复主样本，记录至少 20 次预热后接口样本及前端分项耗时，核对预算与超限反馈。

## 6. 发布与回滚

前后端及契约必须配套交付；上线验证直接访问和前端代理的图谱接口，不能以健康接口成功代替业务验收。若后端缺少图谱能力，前端明确显示版本不兼容，不进入空白画布。

回滚使用同一发布前基线恢复前端、后端及契约产物，移除图谱入口；已有 OPD、脑图和模型数据不需迁移。图谱只读且首版不落库，因此无新增业务数据回滚。缓存和浏览器内存布局可以丢弃。部署审批与正式发布不属于本次文档交付。

## 7. 验证记录

### 本次实现边界与决策

本次用户已授权按功能 Spec 实施；第 1 节仅为先前文档任务记录，不限制本次编码。允许新增或修改：`scripts/generate-draft-workspace-contract.mjs`（真实契约源）；其生成的 docs schema/OpenAPI、后端 `resources/draftsave` schema、Java/TS generated contract；`api/GraphAnalysisController.java`、`api/DraftWorkspaceExceptionHandler.java`；`application/GraphAnalysisService.java`、`GraphAnalysisProjector.java`；共享 API `localRuntimeApi.ts`；工作台 `WorkbenchSurface.vue`、`GraphAnalysis*.vue`、`graphAnalysis*.ts`、`useGraphAnalysis.ts`；对应后端/前端测试和 `tests/e2e/opm-graph-analysis.spec.ts`；本设计和 Spec。若发现现有适配器需同步，仅修改直接图谱调用适配。禁止新增依赖、配置、数据库 schema、用户数据修改和无关重构。

投影上限固定为 2,000 节点/10,000 边；超限使用现有 `DRAFT_EDIT_REJECTED` 错误和明确消息，不新增不受支持的原因码。关系方向按角色定义：过程目录顺序形成输入→过程→输出；结构关系按 SOURCE→TARGET、WHOLE→PART、GENERAL→SPECIALIZED、CLASS→INSTANCE 分解，保留角色与事实分组。未知能力显式警告。布局使用无新增依赖的有界 Worker 力导向计算。历史读取复用 `transferDocument`，不创建草稿。性能目标沿用设计，实际结果单独记录。

### 实际完成与验证

先前文档任务已完成。以下是本次功能实施结果，未勾选的 P3/全量验收项保留为未完成。

- 新增 Tab、三个范围、二维图谱、搜索高亮、类型/关系筛选、状态归属开关、邻域、详情、来源选择与 OPD 定位、窄屏布局。图谱组件懒加载、Worker 独立打包；筛选增量复用画布元素。
- 新增草稿和历史接口，严格生成契约、完整 token 与规则校验、现有会话拦截器；投影不写模型或 OPD 布局。
- 后端：投影 8 项、API 集成 1 项、方法查询回归 4 项、草稿契约 5 项通过。覆盖 16 种过程关系、三类结构扇形、状态、范围、去重、隐藏/边界、超限、会话拒绝、token 冲突、历史和不写入。集成测试沿用现有独立 `opm_diagram_tool_*` 测试 schema，不变更业务 schema 或用户项目。
- 前端：图谱 5 项、脑图 8 项、助手 29 项、导航 1 项、嵌入工作台 7 项，共 50 项通过。
- lint、typecheck、草稿生成器 `--check`、`npm run contract:validate` 通过；生产构建通过，图谱组件与 Worker 输出独立资源。现有 bootstrap 非 module 脚本的 Vite 提示仍存在。
- Chrome E2E 通过：真实导入模型 177 节点/304 边，验证生成、范围、搜索、详情、来源定位、Tab 往返、历史只读及窄屏；未发送 commands/save/pin 请求，未捕获页面异常。
- 本机 Windows/JDK 21/Chrome/Vite 开发模式：300 节点/1,000 边纯投影 20 次预热后样本 p95 5ms，布局单测约 119ms；浏览器主样本刷新至渲染约 648ms，筛选约 255ms；1,000 节点/5,000 边约 4,477ms，筛选约 273ms。浏览器为单次自动化观察，不是 p95。GA-11 的 200ms 筛选目标未稳定达到，大图首次渲染仍需优化。
- 截图位于 `test-results/opm-graph-analysis-真实模型图谱：生成、筛选、定位、历史只读和布局/` 的 `graph-analysis-desktop.png`、`graph-analysis-narrow.png`，属于测试产物。

未执行全库测试、真实用户模型编辑/保存/撤销 E2E、所有扩展能力的逐项人工审查和正式发布回滚演练。原因是定向回归边界、避免修改用户数据，以及本任务不发布；已有单元回归不能替代这些运行证据。未支持的控制/扩展能力和 Feature 关系明确列为 warning，不推断成因果边。

### 完整源文件清单

新增或先前文档任务尚未提交：

- `apps/web/src/modules/workbench/GraphAnalysisPanel.vue`
- `apps/web/src/modules/workbench/GraphAnalysisCanvas.vue`
- `apps/web/src/modules/workbench/GraphAnalysisPanel.spec.ts`
- `apps/web/src/modules/workbench/graphAnalysisModel.ts`
- `apps/web/src/modules/workbench/graphAnalysisLayout.ts`
- `apps/web/src/modules/workbench/graphAnalysisLayout.worker.ts`
- `apps/web/src/modules/workbench/useGraphAnalysis.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/GraphAnalysisController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/GraphAnalysisService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/GraphAnalysisProjector.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/GraphAnalysisControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/GraphAnalysisProjectorTest.java`
- `tests/e2e/opm-graph-analysis.spec.ts`
- `docs/design/opm-graph-analysis-design.md`
- `specs/opm-graph-analysis-feature-task-spec.md`

修改：

- `apps/web/src/modules/workbench/WorkbenchSurface.vue`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/workbench/contracts.ts`（可选宿主能力）
- `scripts/generate-draft-workspace-contract.mjs`（契约源）
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceExceptionHandler.java`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`（生成）
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成）
