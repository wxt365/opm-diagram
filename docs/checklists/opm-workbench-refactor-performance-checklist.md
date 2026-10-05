# 工作台重构与性能检查

- 规格：[任务规格](../design/opm-workbench-refactor-performance-spec.md)
- 边界确认：内部职责拆分与性能优化已授权；API/schema/依赖/发布及用户模型禁止修改。
- [x] R1：工作台、页面、画布职责拆分。
- [x] R2：Java 应用、草稿候选与 OPL 句型拆分及回归；全量遗留失败单独记录。
- [x] R3：助手职责拆分及回归。
- [x] P1：选择/结构变更增量更新。
- [x] P2：拖动按帧合并及最终几何验证。
- [x] P3：索引复用、状态/特征/并行关系验证。
- [x] P4：真实浏览器规模测试与测量记录。
- [x] 静态、构建、契约及功能回归结果记录。

## 验证结果（2026-10-05）

- `npm run test --workspace=@opm/web`：46 个测试文件、405 项通过，包含新增的 6 项节点增量/拖动回归。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`、`npm run contract:validate`、`npm run build`：通过。构建仍提示既有 `/opm-bootstrap.js` 外部脚本不参与打包。
- `npm run assistant:test`：33 项通过，覆盖多轮会话、暂存/审查、停止、冲突、回执与恢复；未重新调用真实供应商模型。
- Java 21 + 本机 Maven 离线 `mvn -o -pl services/local-runtime -am test`：552 项中 548 项通过，1 项断言失败、3 项错误。四项失败均在 `git archive HEAD` 独立快照复现：两项基线校验证据要求、两项发布故障计划 schema 摘要不匹配。未放宽生产校验或修改发布契约。清理提取产生的无用 import 后，涉及服务的 245 项定向测试再次执行，243 项通过，仅保留上述两项基线错误。
- `mvn -o -pl services/local-runtime -am package -DskipTests`：打包通过；该命令仅验证打包，不能替代上面的测试结果。仓库现有 Maven wrapper 不完整，本轮使用本机 Maven，未修改 wrapper。
- 真实工作台：11 个相关 spec 中的 16 项用例最终全部通过（初次 11 项、修正旧测试交互后补测其余项），覆盖默认折叠、名称编辑、状态容器、多选移动、布局预览/取消/确认/拒绝、撤销重做、子图删除/导航、六类关系高亮、跨图 Finding 定位、OPL 定位/下载、OPD JSON 迁移及保存重开。
- 真实画布性能：5 项通过，包括 100/500/1000/3000 节点和 2000 元素、2000 并行关系的混合状态/特征场景。验证未修改 DOM 图形保留、改名、删除及默认状态箭头恢复。
- `git diff --check`：通过。未修改用户项目数据、API/schema、依赖及发布配置；本次本地提交包含实现、测试与验收记录。

## 复测命令与证据

规模测试：`npx playwright test --config=tests/e2e/playwright.performance.config.ts`，自动启动隔离 Vite 5181，使用真实 OpdCanvas 和 X6，数据只在测试页面中生成。

普通 E2E 配置排除该独立性能 spec；`playwright test --list` 确认普通配置发现 44 个文件、91 项用例且未混入性能测试。此次只执行上述相关的 16 项工作台用例，未执行全部 91 项。

工作台测试使用独立 runtime 17851、Vite 5176 和临时存储 `/private/tmp/opm-refactor-e2e-20261005`。指定 `OPM_E2E_EXTERNAL_SERVERS=true`、`OPM_PLACEMENT_BASE=http://127.0.0.1:5176`、测试项目 ID，运行以下 spec（`--grep-invert '现有|既有'` 排除依赖用户案例库的用例）：

`workbench-attribute-owner`、`workbench-auto-layout`、`workbench-context-delete`、`workbench-direct-state-and-default-collapse`、`workbench-findings`、`workbench-inline-name`、`workbench-layout-selection`、`workbench-opd-json-transfer`、`workbench-opl-panel`、`workbench-owned-layout`、`workbench-relation-selection`。

旧测试修复只涉及：从缩放菜单选择适应画布、等待按帧执行的视口变换、点击可见画布区域、在属性面板内失焦及区分所属特征装饰和用户结构关系。

本机日志：`/private/tmp/opm-refactor-web-complete.log`、`/private/tmp/opm-refactor-java-full.log`、`/private/tmp/opm-refactor-java-final.log`、`/private/tmp/opm-refactor-assistant.log`、`/private/tmp/opm-refactor-browser.log`、`/private/tmp/opm-refactor-browser-retry.log`、`/private/tmp/opm-refactor-browser-final-pair.log`、`/private/tmp/opm-performance-verified.log`。测试截图位于忽略目录 `test-results/refactor-retry`、`test-results/refactor-final-pair`；性能数据随 Playwright 附件保存在 `test-results/canvas-performance`。临时日志和截图不随仓库发布。
