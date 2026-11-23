# 剩余工作台验收问题修复与验证（2026-11-11）

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## 本轮结果

本轮五类问题已完成修复和验收：属性折叠、缩放/改名定位、保存/布局/关系链路、后端冻结校验、长状态名称分行断言。保留前一轮三项修复，没有修改 API、数据库 schema、依赖或用户模型。前端 761 项测试通过；正式工作台浏览器 32 项通过、0 失败、2 项既有案例预览跳过；嵌入组件 4 项通过。Control 额外连续三次复测通过。

## 根因与修改

| 问题 | 确认原因 | 实际修改与验收 |
| --- | --- | --- |
| 属性/操作默认折叠 | 新增 Feature 时原实现从折叠集合删除 owner，与已有默认收起规格相反；刷新初始化也未建立默认集合 | 服务模式正式工作台显式启用默认收起；首次读取/新增特征收起，普通回读保留显式展开。data 展示快照保持展开兼容。展开/收起无语义命令或编辑序号变化，所属线/Feature State 同步隐藏；刷新恢复默认 |
| 缩放和改名提前失败 | DOM 中有隐藏图谱实例；关系目录还存在快捷入口/展开菜单重复项与切换竞态；原 OPL 断言仍匹配英文显示 | 缩放限定可见控件；关系目录动态匹配同一 Capability 的可见入口，菜单打开时优先菜单项；OPL 保持中文显示，title 提供原始句子作为精确追溯定位。节点改名、关系内联改名及取消/重开均完成 |
| State/布局/保存链路未完成 | State 角色/保存表单缺失；旧用例假设拖动立即增加服务端序号；预览已显示布局，确认时不应再次改变画面；统一历史已经取代仅本地布局历史 | 恢复名称/INITIAL/DEFAULT/FINAL 和保存 State，保持备注/颜色及只读守卫。布局测试验证几何、网格吸附、零即时请求、撤销/重做、保存批量提交、失败保留与重开，不改变现行手动布局保存策略 |
| 关系手势/复杂场景阻断 | 工具栏/画布外释放可能没有 X6 mouseup；框外分类扩大节点包围盒，旧坐标落到边缘；State 差集定位会混入异步连接器；旧视觉断言依赖已废弃颜色/曲线 | pointer/mouse 释放后回收残余 dragging；端点使用正文边界；新建 State 只按真实 State ID 定位节点组。关系 marker 类型、灰色填充、独立闪电注记、正交通道和时间标签仍严格检查；路径比较使用全部关系完成后的同一几何基线 |
| HEAD/Context 链路 | 带不存在 Context 的 HEAD 草稿读取直接 NOT_FOUND，没有像快照一样回退根 | 同一模型 open(null) 读取根后保留提示、规范化地址；缺失模型仍失败。非法、缺失及跨模型 EXACT Revision 继续拒绝，浏览器和单元测试验证 |
| 冻结向量失败 | 工作区 CRLF 改变 raw bytes，源夹具和 Recovery 基线也有同类问题；PG 迁移写入的 schema pin 与已提交资源不一致；启动测试的默认 properties 被 application.yml 覆盖，误用旧库 | 校验仅换行后与 Git 索引完全相等，再恢复 LF；不改冻结向量/Recovery 模板的预期摘要。活动 schema pin 显式绑定现有 PG schema LF bytes，规格同步来源；保留资源不匹配和错误码反例。启动测试用 @TempDir + 高优先级命令参数指定隔离目录 |
| 长 State 名称分行 | 旧 `text tspan` 同时统计空分类文字，实际名称已完整两行 | 只统计实际标签的 `tspan.v-line`，验证完整文字与 SVG 边界。8 次 owner 增长、唯一 junction/member、终态内框高度均执行通过，未放宽文本或几何要求 |

## 冻结字节证据

每个文件都先比较 `CRLF→LF` 后与 Git 索引原始 bytes 完全相等，不覆盖语义差异。原有向量摘要和 Recovery 模板不变。

| 文件 | LF 字节 | SHA256 |
| --- | ---: | --- |
| golden/fixtures/base-golden.proc.001.json | 8623 | 6cf81b7f975adde8877eca9583b93304847a4e288a788df61c2b96fff26a4036 |
| golden/fixtures/g-opl-proc-001-consumption-object-pass.json | 7761 | c94e620bfe7d12f619eb21b8020b1a57b7defa4c4f7d6170ee67657cf8d2b505 |
| tests/fixtures/hybrid-save/save-content-v1-vectors.json | 138071 | ebb5b0a34dde5e06ba417bc43a1c19326be14dfed82abb23eee217739afd625c |
| tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json | 1710 | 5b3f081befd991a12ef36e4f512fb0c129dd22e60bdfe9af4731b993d970ac6a |
| docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json | 61474 | 56902afd0e59a64eabb9028782a495b2f0193285552f8cbd7edabbd9f93abfa0 |

golden 文件位于 `packages/profiles/profile.iso19450.2024.draft/0.2.0`。`.gitattributes` 已有 golden/向量 LF 约束，本轮增加活动 schema 的 LF 约束。恢复 LF 在当前工作区生效，即便 Git 最终不显示内容差异也不能省略这一步。

schema pin 的调整属于已提交 PostgreSQL schema 与 Java 常量的对齐，不是根据测试输出重写向量。Git `cf35d11` 引入了 PostgreSQL schema 和失配常量；此次在独立任务规格及原 fault-launcher 规格中明确活动 bytes/hash，Java 运行时仍校验 JAR 内固定资源，禁止从 checkout 动态生成期望。

## 最终验证证据

| 验证 | 实际结果 | 原始日志（仓库根目录起） |
| --- | --- | --- |
| 契约 + 前端全量单元/组件 | 79 文件、761 项通过 | test-results/remaining-final-unit.log |
| lint | 退出码 0 | test-results/remaining-final-lint.log |
| 类型检查 + 应用生产构建 | 退出码 0；保留大于 500KB 的分包提示 | test-results/remaining-final-build.log |
| 最终工作台组件构建/声明 | 退出码 0 | test-results/remaining-final-component-build.log |
| 正式工作台浏览器 | 32 通过、2 跳过、0 失败、0 flaky；3.5 分钟 | test-results/remaining-accepted-browser.log / remaining-main.json |
| Control 稳定性 | 连续 3/3 通过 | test-results/remaining-control-stable.log |
| 最终嵌入组件 | 4/4 通过 | test-results/remaining-final-component.log |
| 冻结字节还原/索引对照 | 5 文件完全相等，SHA 如上 | test-results/remaining-frozen-bytes.log |
| 后端最终 reactor verify | BUILD SUCCESS：Local Runtime 623 项（60 跳过）、Recovery 8 项；0 失败、0 错误；两模块打包成功；再次确认打包 verify 退出码 0（该确认不重跑测试） | test-results/remaining-accepted-backend.log / remaining-final-package-confirm.log |

浏览器覆盖：Attribute/Operation 折叠及两种改名、Object-only State 与角色更新、检查器桌面/窄屏、手动去重/自动保存/Pin/EXACT、响应丢失恢复与迟到响应、六种对齐/两种分布、多选/State 跟随、预览取消/确认/失败重试、P01→P03 三视口、关系改名、State 指定关系、16 Procedural、8 Control、10 Structural、fan 完整性更新保留 Fact ID、OPL 追溯、非法端点、稳定轨道、HEAD 稳定地址和前进后退。

两条跳过仅为依赖既有五个用户案例的只读布局预览/适应验证；本次不借用真实案例模型。相同功能的自建隔离项目用例已通过。未调用真实 LLM，未执行 Firefox/WebKit、真实 PostgreSQL 服务矩阵或 ISO/生产 release gate；浏览器为本机 Chrome 131.0.6778.139。本报告不能替代这些矩阵或全面标准符合性声明。

## 执行顺序与复跑

当前机器适配配置在忽略的 `test-results/remaining-main.config.ts`、`remaining-component.config.ts`、`remaining-maven.xml`，包含本机 JDK 21、Maven 缓存和 Chrome 位置；正式测试改动在 `tests/e2e` 与模块单元测试内。

```powershell
npm test
npm run lint
npm run build
npm run build:workbench --workspace=@opm/web
npx playwright test --config=test-results/remaining-main.config.ts --output=test-results/remaining-rerun-main
npx playwright test --config=test-results/remaining-component.config.ts --output=test-results/remaining-rerun-component
# 确保上述 Runtime 进程已退出，再运行 verify，避免 Windows JAR 文件占用。
$env:JAVA_HOME='D:/JDK/jdk-21'
& D:/Maven/apache-maven-3.9.6/bin/mvn.cmd -gs test-results/remaining-maven.xml -s test-results/remaining-maven.xml -o verify
```

首次后端 verify 的 Local Runtime 623 项已零失败，但打包时与 Runtime 占用冲突；停止 Runtime 后打包通过。随后全量运行才暴露 Recovery 引用基线 CRLF，已按索引恢复后重新执行。中间失败日志保留，不能将其写成当次构建通过。最终结果只认上表最终日志。

冻结字节恢复后，Recovery 测试继续暴露一个存储类型断言错误：默认 SQLite 却无条件期待 PostgreSQL `project.snapshot.json`。本轮仅修正测试，按显式存储类型检查 `.db` / `.snapshot.json` 的精确位置，并新增实际产物长度/SHA 与引用一致性检查；不改材料化业务逻辑。最终完整 reactor 于 2026-11-11 17:34（Asia/Shanghai）通过。
