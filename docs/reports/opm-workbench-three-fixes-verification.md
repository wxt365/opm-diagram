# 工作台三项缺陷修复与验证

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## 结果

本轮请求的助手跨域连接、节点点击命中、中大型图拖动问题已修复并完成定向回归。最终前端 759 项、助手 125 项测试通过，8 项浏览器回归通过；lint、应用类型检查/生产构建和工作台组件构建通过。本报告不替代原全项目验收，未覆盖的原有其他问题不计为已修复。

## 实现

- 助手：OPTIONS 允许既有客户端发送的 Authorization；来源、方法、未知头和会话检查继续执行。HTTP 回归覆盖带 token 预检/POST、未知请求头拒绝和无效来源/会话拒绝。
- 点击：Object 含 State 时分类文字在框外，扩大的 SVG group 包围盒原来包含不可点击区域。为框外分类标题添加透明命中区域，并随容器尺寸同步；不覆盖 State 或改变模型几何。独立浏览器测试普通点击/拖动，无 force；真实宿主连续创建三个 State、保存刷新后再次选择通过。
- 路由：拖动只重算受影响关系及共享端点的邻接关系；端点分配仍参考全图，已存在路径作为占用约束。未修改图形复用；最终几何与预览一致时不重复全图路由；手工路径保持原逻辑。
- 避障：明确通过避障检查的正交通道直接使用已算路径，不再次运行 Manhattan；无有效通道和手工路径仍由原有路由处理。无障碍直线提前结束候选搜索。
- 增量绘制：装饰节点/排除节点判断使用 Set；新增首个特征不重建 owner，避免异步删除邻接 State/default 图形。每个变化节点合并为一次属性绘制；模型删除时立即卸载失效视图及邻接点击区域，监听器和工具的生命周期清理由 X6 队列完成。

## 最终运行环境与范围

Windows，本机 JDK 21，Chrome `131.0.6778.139`，同一工作区源码；没有新增依赖、改变 API/数据库 schema/认证算法或修改用户模型。Runtime 使用仓库已有 JAR；本任务未改 Java。真实助手浏览器测试使用隔离 Runtime、助手目录和示例 access token，无真实 LLM 计费调用。

四档节点性能在最终浏览器运行中串行测量，记录完四档指标后才启动其他检查。密集增量用例随后完成。Chrome 版本不同于策略要求的 Chromium 143，因此指标仅代表本机结果，不是跨环境性能承诺。

## 最终证据

| 验证 | 实际结果 | 文件（仓库根目录起） |
| --- | --- | --- |
| 契约校验 + 前端单元/组件 | 79 文件、759 项通过 | test-results/three-fixes-final-unit.log |
| 助手全量 | 125 项通过、0 跳过 | test-results/three-fixes-assistant-all.log |
| lint | 退出码 0 | test-results/three-fixes-final-lint.log |
| 类型检查 + 应用构建 | 退出码 0；保留既有 >500KB 分包提示 | test-results/three-fixes-final-build.log |
| 工作台组件构建与声明 | 退出码 0 | test-results/three-fixes-final-workbench-build.log |
| 框外标题/状态选择拖动 + 四档性能 + 密集增量 | 6/6 通过，2.1 分钟 | test-results/three-fixes-final-canvas.log |
| 最终组件包跨域直连 | 首次关联、编辑保存、校验、助手 list/watch、再次关联、binding 打开通过 | test-results/three-fixes-final-connected.log |
| 真实宿主点击/持久化 | 连续创建三个 State、保存、刷新、再次选择通过 | test-results/three-fixes-final-runtime.log |

浏览器产物分别保存在 `test-results/three-fixes-final-canvas-output`、`three-fixes-final-connected-output`、`three-fixes-final-runtime-output`。配置保留失败截图与 trace；最终通过的用例不保留失败附件。

| 节点 / 关系 | 加载 ms | 选择 ms | 拖动 ms | 缩放 ms | 布局 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 / 50 | 160 | 32.7 | 379 | 19.1 | 3.8 |
| 500 / 250 | 750.5 | 10.4 | 479 | 25.6 | 13.7 |
| 1000 / 500 | 2039.2 | 17.4 | 670 | 39.8 | 41.2 |
| 3000 / 1500 | 13383.6 | 57.5 | 1620 | 125.5 | 90.2 |

全部达到现有测试门槛：选择 <500ms、拖动 <3000ms、布局 <1000ms。3000 节点初次加载仍约 13.4 秒，本次不能宣称大图初次加载即时完成。密集用例验证 1000 初始节点/2000 关系及 State、特征增加、改名、选关系、删除、未改节点 DOM 身份保持；其 <180 秒超时边界通过，不是增量操作低延迟承诺。

原会话记录的修复前拖动值为 500 节点 3780ms、1000 节点 15202ms、3000 节点 145889ms 并超时。由于原始附件被误清理，这些值仅作为会话历史参考，不当作可重新核验的基准附件。当前表格来自本次保留的最终日志。

## 复跑

当前 Windows 环境的本地适配配置与命令：

```powershell
npm test
npm run assistant:test
npm run lint
npm run build
npm run build:workbench --workspace=@opm/web
npx playwright test --config=test-results/three-fixes-performance.config.ts --output=test-results/three-fixes-rerun-canvas
$env:OPM_E2E_JAVA='D:/JDK/jdk-21/bin/java.exe'
$env:OPM_CONNECTED_E2E_HOST='127.0.0.1'
npx playwright test --config=test-results/three-fixes-connected.config.ts --output=test-results/three-fixes-rerun-connected
npx playwright test --config=test-results/three-fixes-main.config.ts --grep='真实宿主' --output=test-results/three-fixes-rerun-runtime
```

适配配置在忽略的 test-results 中，包含当前机器 JDK 路径和 Chrome channel。正式测试源码已放在 tests/e2e：`workbench-node-hit.spec.ts`、`workbench-node-hit-runtime.spec.ts`、既有 `workbench-performance.spec.ts` 和 `workbench-connected.spec.ts`。其他环境应采用其本机的 JDK/浏览器配置，并始终指定独立叶子输出目录。不要在浏览器测试运行期间修改 Vite 源码，以免 HMR 干扰模型和页面状态。

## 证据保全说明

本次早期诊断遗漏独立 outputDir，Playwright 默认清理删除了上一轮 test-results 中的报告与附件；已向用户说明并按仓库要求记录 Failure。原验收文字记录恢复到 `docs/reports/opm-workbench-acceptance-20261111-report.md`，明确标注原始附件丢失。此处最终验证文件为随后独立输出目录的新运行结果。
