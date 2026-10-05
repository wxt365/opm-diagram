# 状态和特征节点定位修正

## 执行信息

Work Mode：change；Risk Level：L2；Task Type：bugfix。
Active Playbooks：frontend-vue（primary）、backend-springboot、testing。

## 目标和边界

修复新增状态、属性和操作的默认位置与已有节点叠压的问题。允许修改前端工作台的创建位置计算、后端内部 State 容器尺寸计算、相关测试及本规格；禁止修改公共 API、schema、依赖、控制关系语义和其他未提交工作。用户已授权整理既有案例布局；读取页面不自动改写坐标，整理通过已有布局编辑命令提交。

非目标：通用全图自动布局、结构关系接点、视口自适应和案例业务内容补齐。契约不变，仍通过已有 CREATE_STATE / CREATE_FEATURE 命令提交坐标。

## 复现和根因

上一轮真实画布检查发现客户 SD1 的相邻状态框重叠 8px，展开包裹重量后与包裹相交 54×51px。PROC 案例的分散状态使容器横向扩张，形成四对对象框相交。前端投影直接读取已保存布局，没有自动排版；新建 Feature 仅按固定横向偏移和分类型序号定位，没有检查已有节点；新增 State 仅按数量定位，未考虑用户已拖动的状态。旧测试覆盖包含、联动、保存重开，未验证新增位置与邻近节点不相交。

## 验收

- A1：新建状态保留可见间距，不覆盖已移动状态；优先利用容器空位，扩容时不侵入其他节点。无安全空间时给出明确提示。
- A2：同一 owner 的属性和操作以及邻近对象不叠压；接点与 owner 保留空间。
- A3：真实画布新建多个状态、属性、操作，拖动后再创建；保存重开后坐标和尺寸一致。
- A4：定向测试、类型检查、lint、构建及差异检查通过。
- A5：用户确认后，以明确范围整理既有案例布局并复查；未经确认不改现有案例数据。

## Plan

1. 复用节点尺寸函数，抽出确定性的候选位置计算；不改变渲染坐标或增加第二套显示布局。
2. 创建状态前检查其与兄弟状态的间距及容器扩张后的外部碰撞；特征位置向下避让现有节点。后端状态移动后按同 Context owned 状态边界重算容器尺寸，最小尺寸保持现有默认值；不移动其他状态，不改语义。
3. 先运行失败用例，再接入创建命令；执行真实画布回归及质量检查。
4. 根据用户范围选择处理 A5，记录实际结果。

## Checklist

- [x] 边界确认：仅上述目录与本规格；用户已授权整理案例布局。
- [x] A1、A2：位置计算回归。
- [x] A3：真实画布创建、移动、保存重开。
- [x] A4：质量检查。
- [x] A5：范围选择及案例复查。

## 实际验证记录（2026-10-01）

- A1、A2：Vitest 定向执行匹配到 `ownedNodePlacement.spec.ts` 与 `OpdCanvas.spec.ts` 两个文件，共 22 个用例通过。验证状态被移动后仍避让、容器空位优先、外部碰撞拒绝、属性与操作共同占位及宽容器接点空间；命令中额外指定的 `workbenchRuntime.spec.ts` 在仓库不存在，因此没有将其计入验证范围。
- A3、A5：`OPM_E2E_EXTERNAL_SERVERS=true OPM_PLACEMENT_BASE=http://127.0.0.1:5177 OPM_PLACEMENT_PROJECT=project.9ae0e3dd46ae4f3a8b45520c5057ecd7 npx playwright test tests/e2e/workbench-node-placement.spec.ts --config=tests/e2e/playwright.config.ts --reporter=line --max-failures=1` 最终 4/4 通过（5.4 秒）。真实鼠标创建 4 个状态、2 个对象、属性和操作，拖动状态后再创建、验证收缩、父移动联动、保存重开坐标和尺寸一致；三个案例只读检查展开后的实际节点边界、包含与间距。截图位于 `test-results/workbench-node-placement-*/`。
- 后端：本机已有 Maven 3.9.10、Java 21，以 `mvn -o -pl services/local-runtime -Dtest=SemanticLayoutEditorTest,LocalApiServiceTest,NewDraftModelTest test` 执行，28/28 通过；日志 `/private/tmp/opm-node-placement-backend-tests.log`。新规则覆盖跨 Context 排除、兄弟状态空间保留、宽状态及 Feature owner。`mvn -o -pl services/local-runtime -DskipTests package` 退出 0，已在原端口 17850、原存储目录启动新版本，前端继续运行 5177。
- A4：`npm run lint`、`npm run typecheck`、`npm run build --workspace=@opm/web`、`git diff --check` 全部退出 0。构建仍有既有 `/opm-bootstrap.js` 非 module 提示。
- 已授权案例整理：通过 Runtime 查询最新 token、获取 UPDATE_LAYOUT 候选并提交，未直接改写数据库。客户 SD1 编辑序号 98→109，PROC 38→46，STRUCT 34→41，均手动保存；比较整理前后所有构造的非布局字段及 OPL 句子，完全一致；三个 Context 的顶层节点相交数均为 0，兄弟状态模型坐标间距 ≥8。
- CUA 实际复看 SD1（100% 展开两项属性）、PROC（100%）及 STRUCT（展开三项特征、80%/60%）。对象与状态叠压已消除，属性容器分离；部分关系仍穿过中间节点，默认视口仍有裁切，属于后续连线与视口阶段。
- 一致性备份 `/private/tmp/opm-owned-layout-before-20261001.db`；原投影/OPL `/private/tmp/opm-case-layout-before.json`；整理后 `/private/tmp/opm-case-layout-after.json`。只整理上述三个 Context，其他模型未提交布局命令。所有本轮验证模型均移入可恢复回收站，超时遗留也按精确名称回收。
- 回归脚本首轮因 SVG 节点文字带额外内容导致严格名称匹配超时；改用已有测试采用的节点选择方式。后续根据 SVG 选中描边校正可见间距断言，并按现有行为在新建 Operation 后展开特征。最终有效画布断言全部通过。包装脚本缺执行位和 wrapper 配置，改用已安装的 Maven；未修改仓库运行配置。

## 回滚

撤销本轮定位函数及接入、尺寸规则和测试，重新打包启动；保留既有未提交工作。案例原始数据已保留一致性备份和投影快照；需要数据回滚时先核对整理之后的编辑，避免以整库备份覆盖后续工作。
