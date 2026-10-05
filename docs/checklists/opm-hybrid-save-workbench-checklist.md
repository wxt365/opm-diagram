# HS-03B 工作台草稿 Checklist

规格：[HS-03B](../../specs/opm-hybrid-save-workbench-task-spec.md)。

- [x] 边界：规格第1节，当前目录，16项文件，用户库不变。
- [x] Plan：规格第3节，Session → Store → UI → 回归。
- [x] HS-W01：Session 错配拒绝、工作台错误不降级/迟到响应保护；真实 V1 HEAD/EXACT 两项回归通过。
- [x] HS-W02：十三类生成 payload、候选 scope/token/impact、未知端点与 modifier 拒绝、负零保持由 Session 23项测试验证。不是十三类命令各自的真实浏览器验收。
- [x] HS-W03：按钮/快捷键、IME及无效输入保留、候选阻断、等待在途编辑、保存响应迟到、Pin失败不复制；真实 Runtime 编辑已提交但丢响应后刷新，原收据恢复且不重复创建。
- [x] HS-W04：Runtime 10秒自动保存不增加历史项；手动无变化去重、Pin/EXACT、两个 Context 重开、HEAD URL稳定、卸载撤快捷键/轮询及迟到结果保护通过。草稿文本和属性面板不标为旧 Revision 输入。
- [x] HS-W05：下列实际验证记录通过；用户数据库、在线迁移/激活、容量与操作系统强停不在本包证据内。

## 实际验证（2026-09-14）

- `npm run test --workspace=@opm/web`：17文件、202/202；含 WorkbenchView 74、OpdCanvas 11、DraftWorkbenchSession 23。`npm run lint --workspace=@opm/web` 和 `npm run typecheck --workspace=@opm/web` 通过；最终 Node v22.22.0 下 `npm run build --workspace=@opm/web` 通过。Vite 仍提示同步 `/opm-bootstrap.js` 不参与打包，符合现有运行时 bootstrap 契约。
- Java 21 下 `./mvnw -q -pl services/local-runtime -am package -DskipTests` 构建通过；`DraftBrowserFixtureTest` 1/1，真实空临时 SQLite 显式迁移至 V5并保持初始一条 revision_document，零 journal/savepoint。未重复声称本轮执行全部 Java 测试。
- `OPM_E2E_EXTERNAL_SERVERS=true npx playwright test tests/e2e/workbench-hybrid-save.spec.ts tests/e2e/workbench-location.spec.ts --config=tests/e2e/playwright.config.ts --reporter=line --output=/private/tmp/opm-hs03b-final-results`：5/5（20.2秒），其中3项 V2和2项既有 V1兼容。仅使用本轮 Runtime 17851及明确代理至17851的 Vite 5176，未使用默认重建测试库脚本。
- 临时库 `/private/tmp/opm-hs03b-browser-20260914/projects/project.draft.http/project.db`：多轮测试累计 `revision_document=1`、`draft_journal=25`、`draft_savepoint=14`（MANUAL=11、PERMALINK=3）、`draft_checkpoint=18`。通过 SQLite `PRAGMA query_only=ON` 后 SELECT核对；这是累计功能验证，不能据此证明容量或压缩率。
- 查看上述输出根的 `draft-desktop.png`（1440×1000）、`draft-mobile.png`（390×844）：保存图标位于现有工具栏，桌面单排；窄屏保存可达、页面无横向溢出，工具栏自身水平滚动。窄屏现有 Header/Context 区仍占较大高度，本包不声称完成移动绘图体验优化。
- 两份 Draft Save/Workspace generator `--check`、`git diff --check` 通过；完整16项文件空白/换行和39条本地文档链接检查通过。

## 交付边界

最后追加 SAVE/EDIT 失败后队列查询迟到于重载的两项回归，防止旧 pending 状态污染新会话；随后全量202项、lint及Node22 build通过。浏览器5项执行于该异步错误分支守卫补充之前，其主路径未修改。

收尾已核对并停止本轮 Vite PID35089、Runtime PID35108，5176/17851不再监听；没有停止用户5173/17850服务，临时库及截图保留。

完整16项文件集合引用规格第1节。当前目录开发，保留前序差异、不提交；临时数据库与截图留存。用户当前模型仍可能为 V1，本包没有生产迁移、模式切换或默认激活；完整规则校验、冲突待确认输入的显式放弃/修正、Context CRUD、Snapshot/Baseline/Export 消费者、强停与容量验证仍待后继。
