# Spec: OPM Bootstrap Build Closure

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NOT_STARTED`

统一Source归属：`EMBEDDED_IN_DEV_CANVAS_06_UNIFIED_SOURCE_COMMIT`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

冻结 `/opm-bootstrap.js` 从HTML声明、Runtime动态响应、浏览器执行到Vue应用入口的唯一闭包，并关闭Node 22执行`npm run build`后向源码目录发射`vite.config.js/vite.config.d.ts`的风险。

本包只修正构建配置和增加受控验证，不修改Bootstrap生产响应、前端window wire、Runtime binding来源、应用入口、API、Profile业务bytes、SQLite或依赖版本。

## 2. Root Cause

### 2.1 最小复现

当前`apps/web/tsconfig.node.json`同时满足：

```text
composite=true
include=["vite.config.ts"]
未设置noEmit=true
tsBuildInfoFile位于node_modules/.tmp
```

`vue-tsc -b`因此可以把`vite.config.ts`编译为同目录`vite.config.js/vite.config.d.ts`。当前仓库已经跟踪一份与TypeScript配置重复的`apps/web/vite.config.js`，而`vite.config.d.ts`不受现有ignore规则覆盖；clean构建可能产生新的未跟踪文件并形成Vite双配置源。

### 2.2 为什么此前未发现

1. 既有验收只记录`npm run build`退出成功和bundle warning，没有比较clean worktree构建前后文件集合；
2. `tsBuildInfoFile`已被定向到`node_modules`，但没有同时冻结`noEmit`，误把incremental metadata隔离等同于全部emit隔离；
3. Bootstrap MVC测试只用`containsString`检查两个片段，没有锁定完整Runtime响应bytes；
4. 既有E2E证明业务页面可用，没有单独证明Bootstrap在应用入口顶层代码前完成。

## 3. Fix Strategy

1. `apps/web/vite.config.ts`保持唯一Vite配置源，`tsconfig.node.json`固定`noEmit=true`，继续只把`.tsbuildinfo`写入`apps/web/node_modules/.tmp/`；
2. 删除已跟踪派生文件`apps/web/vite.config.js`，禁止新增、生成、提交或ignore `vite.config.js/vite.config.d.ts`；
3. 新增只读Bootstrap Build Closure verifier及测试，分别验证source与post-build状态；
4. Runtime MVC测试从片段匹配升级为固定fixture的完整UTF-8 bytes相等；
5. 增加浏览器顺序测试，证明Bootstrap响应未完成时Vue应用没有执行或mount，响应执行后才进入应用入口；
6. 本包嵌入统一Source生产输入重建的同一个clean commit，避免另建source identity或放宽其exact allowlist。

不新增日志、监控或告警；这是clean build与启动契约，不是运行期可恢复错误。

## 4. 修改边界

### 4.1 精确非文档source owner

只允许以下`7=3 M+3 A+1 D`个逻辑路径承接本修正：

| 预期 | 路径 | 唯一责任 |
| --- | --- | --- |
| `M` | `package.json` | 增加定向verifier/test命令，不改变依赖版本 |
| `M` | `apps/web/tsconfig.node.json` | 固定`noEmit=true`，保留现有strict/composite/target/module/resolution/types/tsBuildInfoFile |
| `D` | `apps/web/vite.config.js` | 删除已跟踪的TypeScript派生副本 |
| `A` | `scripts/verify-opm-bootstrap-build-closure.mjs` | SOURCE/POST只读verifier唯一owner |
| `A` | `scripts/verify-opm-bootstrap-build-closure.test.mjs` | verifier正反例 |
| `A` | `tests/e2e/opm-bootstrap-order.spec.ts` | 同源、阻塞和入口顺序浏览器测试 |
| `M` | `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalRuntimeBootstrapControllerTest.java` | Runtime完整响应bytes/wire回归 |

该7项必须并入`specs/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-task-spec.md`总体source delta；`package.json`是两包共享owner，只计一次总体路径。

### 4.2 只读生产资产

- `apps/web/index.html`、`apps/web/vite.config.ts`、`apps/web/src/main.ts`、`apps/web/src/env.d.ts`；
- `apps/web/src/shared/api/localRuntimeApi.ts`及现有业务测试；
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalRuntimeBootstrapController.java`；
- `LocalApiService`、`RuntimeActiveBindingProvider`、Profile/Rule资产；
- `package-lock.json`、Vite/TypeScript/Vue版本和公共HTTP wire。

### 4.3 禁止

- 修改Bootstrap变量名、字段、空白、分号、属性顺序、编码、content source或binding值；
- 把Bootstrap复制到`public/`、`src/`、`dist/assets`、inline script、module、Vite plugin virtual module或bundle；
- 为消除未跟踪文件而修改`.gitignore`、在build末尾删除emit、执行`git clean`或接受dirty source；
- 改写`main.ts`以轮询/等待Bootstrap、增加fallback binding或硬编码Profile；
- 修改OpenAPI、SQLite、Java生产代码、Vite/TypeScript版本或引入依赖。

## 5. Bootstrap同源与执行契约

### 5.1 Source HTML

`apps/web/index.html`必须恰含一个Bootstrap script：

```html
<script src="/opm-bootstrap.js"></script>
```

它必须是classic parser-blocking external script：无`type`、`async`、`defer`、inline body、scheme、authority、query、fragment或fallback；source HTML中它位于`<script type="module" src="/src/main.ts"></script>`之前。`/opm-bootstrap.js`是同一origin的absolute-path reference，不允许由`VITE_LOCAL_RUNTIME_ORIGIN`直接写入浏览器HTML；该环境变量只可作为开发服务器同源代理target。

### 5.2 Production dist

Vite允许把module入口重排到`head`，因此dist不使用标签文本位置判断执行顺序。POST verifier必须同时证明：

1. `apps/web/dist/index.html`恰含一个`src=/opm-bootstrap.js`的classic parser-blocking script；
2. 所有应用入口仍为module script；Bootstrap没有`type=module/async/defer`；
3. `apps/web/dist/**`中不存在名为或映射为`opm-bootstrap.js`的文件，不存在Bootstrap inline body；
4. Vite asset graph不把Bootstrap响应作为chunk/source/map资产；bundle只允许读取Runtime先写入的window globals；
5. 浏览器顺序测试必须证明在Bootstrap HTTP响应被受控挂起时，`#app`保持未mount且应用入口无可观察副作用；释放响应并执行两个赋值后，应用才mount。

classic body script在HTML解析期间执行，module入口在文档解析后执行；浏览器测试是该语义的最终验收，不能只靠正则或人工观察。

### 5.3 Runtime权威来源

`GET /opm-bootstrap.js`继续只由`LocalRuntimeBootstrapController`动态生成，必须满足：

- 请求与页面同origin，Host仅允许`127.0.0.1/localhost`；
- `200`、`Content-Type`兼容`application/javascript`、`Cache-Control: no-store`；
- session来自当前进程`LocalSessionToken`；Profile/Rule来自`LocalApiService.activeProfileRuleBinding()`，禁止Controller复制业务常量；
- 响应不写磁盘、不进入Vite source graph、不由前端重建。

## 6. Runtime响应bytes与wire冻结

固定测试输入：

```text
sessionToken=session-test-value
profile_id=profile.iso19450.2024.draft
profile_version=0.2.0
rule_set_id=rules.iso19450.2024.draft
rule_version=0.1.0
```

完整响应必须是无BOM、无末尾LF的UTF-8 `227` bytes：

```javascript
window.__OPM_LOCAL_SESSION__ = "session-test-value";window.__OPM_ACTIVE_PROFILE_BINDING__ = {profile_id: "profile.iso19450.2024.draft", profile_version: "0.2.0", rule_set_id: "rules.iso19450.2024.draft", rule_version: "0.1.0"};
```

固定SHA-256：

```text
c74cffede4bef410bf94ab07f6807e6582047acd9411ed279208c0a747d635f8
```

执行后window wire shape唯一为：

```text
__OPM_LOCAL_SESSION__: string
__OPM_ACTIVE_PROFILE_BINDING__: object with exact own enumerable keys in order
  profile_id, profile_version, rule_set_id, rule_version
```

不得新增digest、Capability、五角色完整binding、nested object、null、默认值或extra key。动态session值变化只允许改变第一个字符串值及相应raw SHA，不改变语句、变量、第二对象shape或编码规则。

## 7. Node 22 clean build验收

### 7.1 工具链

唯一受控版本：

```text
node --version == v22.22.0
npm --version == 10.9.4
packageManager == npm@10.9.4
```

禁止以Node 24、系统默认Node、Bun、pnpm或Yarn替代该验收。Node 22构建成功不替代Java 21 Runtime回归。

### 7.2 唯一命令顺序

在基于`daf383df6d7faad866b84fceac0a2c9111a8c926`和总体exact source delta形成的独立clean worktree中执行：

```text
NODE_VERSION
-> SOURCE_COMMIT_AND_CLEAN
-> DERIVED_ROOTS_ABSENT
-> npm ci --ignore-scripts
-> npm run bootstrap:build:closure:verify -- --phase SOURCE
-> npm run bootstrap:build:closure:test
-> npm run build
-> npm run bootstrap:build:closure:verify -- --phase POST
-> Runtime Bootstrap定向Java测试
-> Bootstrap order Playwright测试
-> git diff --check
```

`npm run build`必须以exit `0`完成现有`contract:validate + @opm/web build`，不得换成workspace局部命令冒充根构建。

### 7.3 前后文件集合

构建前必须不存在：

```text
node_modules
apps/web/node_modules
apps/web/dist
services/**/target
apps/web/vite.config.js
apps/web/vite.config.d.ts
```

`npm ci`后只允许出现`node_modules/**`和`apps/web/node_modules/**`。`npm run build`后新增/变化的派生产物只能位于以下path-segment边界：

```text
node_modules/**
apps/web/node_modules/**
apps/web/dist/**
services/*/target/**
```

本次`npm run build`本身预期不创建`target`；该root只为同一统一Source流水线后继Java构建保留。普通文件、目录、link或ignored entry只要位于allowlist外即失败。

POST必须同时满足：

```text
git status --porcelain=v1 --untracked-files=all == ""
apps/web/vite.config.js absent
apps/web/vite.config.d.ts absent
apps/web/vite.config.ts raw SHA before/after equal
apps/web/index.html raw SHA before/after equal
apps/web/src/main.ts raw SHA before/after equal
package.json/package-lock.json/tsconfig*.json raw SHA before/after equal
```

verifier必须使用`git ls-files`建立tracked source集合，并递归检查非tracked实体的real/lexical path；不能只依赖ignore结果、basename、`git diff`或手工`find`片段。symlink、hardlink和path escape一律拒绝。

## 8. 稳定失败与首错

```text
BOOTSTRAP_BUILD_ARGUMENT_INVALID/2
BOOTSTRAP_BUILD_NODE_VERSION_INVALID/2
BOOTSTRAP_BUILD_SOURCE_DIRTY/2
BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID/3
BOOTSTRAP_BUILD_HTML_INVALID/3
BOOTSTRAP_BUILD_RUNTIME_WIRE_DRIFT/3
BOOTSTRAP_BUILD_ORDER_INVALID/3
BOOTSTRAP_BUILD_IO_FAILED/4
```

首错顺序固定为：ARGS -> NODE -> clean commit -> source files/config -> derived roots -> source HTML -> build -> post inventory -> dist HTML/assets -> Runtime bytes/wire -> browser order。verifier只读，不删除、修复、ignore或重写任何输出。

## 9. 测试矩阵

### 9.1 正例

1. Node `22.22.0`和npm `10.9.4`下根`npm run build`成功；
2. source与dist均只引用同源external classic Bootstrap；
3. dist无Bootstrap资产，Runtime raw fixture=`227 bytes/c74cff...`；
4. Bootstrap挂起时应用未mount，释放后window shape完整且应用mount；
5. post-build Git状态为空，派生产物仅位于allowlist，两个`vite.config`派生文件均不存在。

### 9.2 单变量反例

覆盖Node 24/错误npm、dirty/untracked source、预存dist/target、`noEmit`缺失、`vite.config.js/.d.ts`、修改ignore掩盖、Bootstrap absolute URL/inline/module/async/defer/重复/缺失、dist生成Bootstrap asset、Vite bundle内联、Runtime任一空白/字段/顺序/value/encoding/LF drift、extra window key、应用在响应前mount、build修改lock/config/source、allowlist外文件/link/hardlink和verifier写入。

## 10. Completion与回滚

完成状态必须同时满足：

```text
IMPLEMENTED
NODE22_ROOT_BUILD_PASSED
DERIVED_OUTPUT_CLOSED
RUNTIME_WIRE_BYTE_STABLE
BOOTSTRAP_ORDER_PASSED
```

回滚恢复`tsconfig.node.json`与已删除的tracked JS，并删除新增verifier/test；但回滚后本包重新变为`BLOCKED`，不得继续统一Source build。无数据库或用户数据回滚。

本规格冻结不表示代码已实现、统一Source已提交、Handoff/Intake/Runtime/Web已重建、E2E `194/388`、Gate、Candidate、Activation、Capability、production或ISO符合性完成。
