# Checklist: OPM Bootstrap Build Closure

状态：`IMPLEMENTED / CONTROLLED_VERIFY_PASS / CLEAN_ROOT_BUILD_PENDING`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、Root Cause、Fix | 1~3 | C01~C05 |
| 修改边界 | 4 | C06~C10 |
| 同源、顺序、Runtime | 5、6 | C11~C18 |
| Node 22与产物闭包 | 7 | C19~C28 |
| 错误、测试 | 8、9 | C29~C34 |
| 完成、回滚、状态 | 10 | C35~C38 |

## Plan

- [x] C01 已复现`composite + include vite.config.ts + no noEmit`存在同目录emit风险。
- [x] C02 当前tracked `vite.config.js`与TypeScript配置重复，`vite.config.d.ts`未被ignore。
- [x] C03 旧验收只检查build exit和containsString，未闭合文件集合、完整bytes和入口顺序。
- [x] C04 Fix固定为TypeScript配置唯一source、`noEmit=true`、删除派生JS、增加只读verifier/test。
- [x] C05 不修改Bootstrap生产响应、业务入口、API、Profile、SQLite或依赖版本。
- [x] C06 source owner固定`7=3 M+3 A+1 D`。
- [x] C07 `index.html/vite.config.ts/main.ts/env.d.ts/localRuntimeApi.ts/Bootstrap Controller`生产代码只读。
- [x] C08 禁止修改`.gitignore`掩盖emit，禁止build后删除emit冒充闭包。
- [x] C09 禁止Bootstrap inline/module/bundle/public copy和前端fallback binding。
- [x] C10 本7项嵌入统一Source总体commit，`package.json`只计一次。
- [x] C11 source HTML恰有一个`/opm-bootstrap.js` classic parser-blocking script。
- [x] C12 source Bootstrap位于`/src/main.ts` module入口之前且无scheme/authority/query/fragment。
- [x] C13 dist允许module移入head，但Bootstrap仍为external classic且无async/defer/module。
- [x] C14 dist不生成Bootstrap asset、不inline响应、不把响应纳入Vite asset graph。
- [x] C15 browser测试证明Bootstrap挂起时应用未mount，释放并执行后才mount。
- [x] C16 Runtime仍为同origin、loopback Host、no-store、application/javascript。
- [x] C17 固定fixture响应为227 UTF-8 bytes、无BOM/LF、SHA=`c74cff...`。
- [x] C18 window shape固定session string和四个有序binding key，禁止extra/nested/null。
- [x] C19 Node=`v22.22.0`、npm=`10.9.4`、packageManager=`npm@10.9.4`。
- [x] C20 唯一clean命令顺序与根`npm run build`已冻结。
- [x] C21 build前node_modules/dist/target及两个vite派生文件不存在。
- [x] C22 npm ci后仅node_modules根可出现。
- [x] C23 build后派生产物只允许node_modules、apps/web/dist和services target路径边界。
- [x] C24 `git status --porcelain=v1 --untracked-files=all`必须为空。
- [x] C25 `apps/web/vite.config.js`和`apps/web/vite.config.d.ts`必须均不存在。
- [x] C26 config/index/main/package/lock/tsconfig source raw SHA构建前后不变。
- [x] C27 verifier基于tracked集合与递归实体检查，禁止只看ignore或basename。
- [x] C28 link、hardlink、escape和allowlist外ignored实体均拒绝。
- [x] C29 八类稳定错误码与exit已冻结。
- [x] C30 首错顺序固定且verifier只读。
- [x] C31 Node 22根build、Runtime bytes和browser order正例已定义。
- [x] C32 Node/config/HTML/dist/wire/order/source drift单变量反例已定义。
- [x] C33 后继实现的verifier unit test通过。
- [-] C34 Java定向测试和Playwright顺序测试通过；独立clean Node 22 root build仍等待统一Source生产输入重建。
- [x] C35 完成状态必须同时具备五个实现/验证标志。
- [x] C36 回滚不涉及数据库或用户数据，但恢复旧配置后必须重新BLOCKED。
- [x] C37 当前只冻结设计时的历史结论已被本轮实现与受控验证取代；未声明clean root build、Handoff或生产证据已通过。
- [x] C38 不提升Handoff、Manifest、Gate、Candidate、Activation、Capability、production或ISO状态。

## Verify

- [x] 当前Node/npm事实为`v22.22.0/10.9.4`。
- [x] 当前source HTML、dist HTML、Runtime Controller和MVC测试已逐项核对。
- [x] 当前五个Bootstrap fixture值与完整响应`227 bytes/c74cff...`已复算。
- [x] 当前`vite.config.js`为tracked文件，`vite.config.d.ts`不受ignore规则覆盖。
- [x] `npm run bootstrap:build:closure:test`：`4/4`通过。
- [x] `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -pl services/local-runtime -Dtest=LocalRuntimeBootstrapControllerTest test`：`1/1`通过。
- [x] `npm run bootstrap:order:test`：`1/1`通过。
- [x] 当前主目录SOURCE verifier按预期拒绝`BOOTSTRAP_BUILD_SOURCE_DIRTY/2`，未将现有未提交工作区伪装为clean root。

## 当前状态

- 设计：`FROZEN_FOR_IMPLEMENTATION`。
- 实现：`IMPLEMENTED/CONTROLLED_VERIFY_PASS`。
- 统一Source build：`BLOCKED_BY_UNIFIED_SOURCE_PRODUCTION_INPUT_REBUILD`。
- Production/ISO evidence：`NOT_GENERATED/EVIDENCE_MISSING`。
