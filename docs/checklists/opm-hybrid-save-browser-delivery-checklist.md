# HS-03A 浏览器传输 Checklist

规格：[HS-03A](../../specs/opm-hybrid-save-browser-delivery-task-spec.md)。

- [x] 边界：规格第1节；当前目录、12项、用户库及工作台模式不变。
- [x] Plan：规格第3节；先 API/身份，再 IDB/恢复，再验证。
- [x] HS-B01：全部 V2 operation/session/raw/错误边界；V1 API 测试保持通过。
- [x] HS-B02：六份 EDIT 冻结 canonical/SHA、PIN 固定 SHA、SAVE preimage；非法值与负零回归。
- [x] HS-B03：Chromium strict IDB、刷新、跨页面竞争、CAS、不可用/配额/relaxed/abort 零发送。
- [x] HS-B04：EDIT/SAVE/PIN FOUND 与 NOT_FOUND，错误 token/digest/raw/result/operation 保留，保存与编辑独立通道。
- [x] HS-B05：Web 169/169，Node 14/14，typecheck/lint/Node22 build、差异及本包文件检查通过。

## 实际验证（2026-09-14）

- `npm run test --workspace=@opm/web`：16 文件、169/169。新增 43 项（传输/身份35、API8）；定向首轮49项不重复累计。
- `OPM_E2E_EXTERNAL_SERVERS=true npx playwright test tests/e2e/draft-browser-delivery.spec.ts --config=tests/e2e/playwright.config.ts --reporter=line --output=/private/tmp/opm-hs03a-browser-results`：7/7。仅测试 Vite 5176、独立 BrowserContext；没有启动真实 Runtime，HTTP 由 Playwright 路由受控替身响应。IndexedDB/strict commit、刷新和跨页面共享是真实浏览器行为；配额失败是在真实 IDB add 调用处注入 QuotaExceededError，未填满本机磁盘。
- `node --test scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs`：14/14，含现有 Node/Java 固定向量与生成器 `--check`。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`、`npm run build --workspace=@opm/web`：通过；Node v22.22.0。build 仍提示 bootstrap 非 module 不参与打包，这是原有运行时同源下发方式，未修改该脚本或入口。
- `git diff --check`、本包12项 UTF-8/尾换行/行末空白、两份新增 Markdown 相对链接检查通过；完整文件集合引用规格第1节。

首轮检查修正了未使用的类型 import、测试数组闭合、Vite 对测试中 import.meta URL 的转换，以及有意空洞数组触发 lint 的构造方式；最终均通过，未放宽检查。

本包不作为保存 UI、工作台 V2 编辑、真实 SQLite 联调、OS 强停、磁盘损坏恢复或用户模型已启用的证明。下一包接工作台 token/候选/画布文本原子切换，再接保存按钮、快捷键和永久链接；保留失败条目的显式处理也由该 UI 包交付。
