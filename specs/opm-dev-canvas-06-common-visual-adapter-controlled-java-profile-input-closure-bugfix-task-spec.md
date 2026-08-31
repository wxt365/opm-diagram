# Spec: DEV-CANVAS-06 Common Visual Adapter 受控 Java/Profile 输入闭包 Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

设计状态：`ADAPTER_CONTROLLED_INPUTS_FROZEN`

实现状态：`INPUT_CONTRACT_FROZEN / ADAPTER_TEST_INPUT_BUILDER_PRESENT_NOT_ACCEPTED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭Node adapter进入真实`8 base/144 clone`调度前的两组生产Request输入缺口：

1. exact Java 21 executable的绝对realpath、raw byte length、SHA-256和运行时major验证输入；
2. Web Runtime所需五项Profile资产的受控物理root、五个raw refs和版本化tree digest。

本修正只升级Adapter Request机器契约及设计入口，不实现Node adapter、Java runner、144次调度或浏览器capture。

## 2. Root Cause

历史Adapter Request `0.1`只提供Plan、Common fixture、Runtime JAR、work root和epoch。Clone/Web Runtime后继设计虽然要求Node验证exact Java 21和Profile五资产，但没有把这些值放入唯一生产API的request，因此实现者只能从`PATH/JAVA_HOME`、checkout、环境变量、目录扫描或默认Profile位置推导，违反受控输入和禁止fallback边界。

## 3. Fix Strategy与版本

1. 历史`opm-dev-canvas-06-common-visual-adapter-request.schema.json`保持`0.1/0.1.0`只读，不再作为production调用输入；
2. 新增活动`opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json`，身份固定为同一`schema_id`、`schema_version=0.2`、`request_version=0.2.0`；
3. 新增Java executable ref和Profile asset root/tree/ref字段，全部必填且`additionalProperties=false`；
4. Node adapter只消费Request `0.2`，历史`0.1`即使Schema-valid也以`GOLDEN_COMMON_ADAPTER_INPUT_INVALID/2`在零输出边界拒绝；
5. 不新增CLI参数、环境变量、checkout入口、依赖或第二个Profile/Java owner。
6. 完整受控测试输入不得由本规格中的字段表手工构造；后继唯一入口由[`Adapter受控测试输入Builder闭包规格`](./opm-dev-canvas-06-common-visual-adapter-test-input-builder-closure-bugfix-task-spec.md)冻结。
7. 活动Request `0.2`的`runtime_jar_ref.kind`固定为`LOCAL_RUNTIME_JAR`并与Handoff/Plan source ref逐字段相等；staged JAR继续由独立`RUNTIME_JAR` ref承接。唯一修正口径见[`Runtime JAR Kind与Planner JDK环境闭包规格`](./opm-dev-canvas-06-common-visual-runtime-jar-kind-and-planner-jdk-env-closure-bugfix-task-spec.md)。

### 3.1 修改边界

本设计修正包允许新增本规格、对应checklist和Adapter Request `0.2` Schema；允许同步03C Adapter/Fault、03C Materializer、Clone/Web Runtime、Visual Common主设计、测试策略、开发执行包、冻结基线、DEV-CANVAS-06 release规格/checklist、契约索引和文档索引。以上共`17`个设计/契约资产是本包唯一修改集合。

- 允许修改Schema：仅新增`docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json`；历史Request `0.1`及其他Schema只读；
- 允许修改API：否，OpenAPI、公共HTTP wire和Java/Node函数实现均只读；
- 允许修改配置或依赖：否，`package.json`、lockfile、Spring/Vite/production配置均只读；
- 允许修改文档：仅上述规格、checklist、设计、release入口和索引；
- 允许修改测试：否，本包只运行受控Schema正反例、语义向量、链接和仓库契约验证，不新增实现测试；
- 禁止修改目录：`.harness/**`、`reference/**`、`services/**`、`apps/**`、`packages/**`和`scripts/**`。

## 4. Adapter Request `0.2`新增字段

### 4.1 exact Java 21

```text
java_major_version = 21
java_executable_ref = {
  kind: "JAVA_EXECUTABLE",
  path: <absolute-normalized-realpath-ending-/bin/java>,
  byte_length: <positive-safe-integer>,
  sha256: <64-lowerhex>
}
```

唯一验证顺序：

```text
Schema
-> lstat(path)=regular non-symlink executable
-> realpath(path)==path
-> raw byte_length/SHA-256相等
-> execFile(path,["-version"],{shell:false,env:sanitized})
-> 版本输出可唯一解析且major==21
```

禁止`PATH`搜索、父进程`JAVA_HOME`/env/system property覆盖、当前Node父进程Java、`/usr/bin/env java`、shell、alias、symlink、目录扫描、候选列表和失败后换Java重试。Request ref是Node启动Base/Clone/Web三个JAR子进程的唯一executable；三个命令首token必须逐字符等于`java_executable_ref.path`。Adapter测试Builder调用Planner时唯一允许的`JAVA_HOME`不是外部输入：它必须由已验证`java_executable_ref.path`父两级推导，并通过五键受控子进程环境显式注入；不得继承父环境。

### 4.2 Runtime JAR source identity

```text
runtime_jar_ref.kind=LOCAL_RUNTIME_JAR
runtime_jar_ref == Capture Plan runtime_jar_ref == READY Handoff LOCAL_RUNTIME_JAR artifact
```

三者对`kind/path/byte_length/sha256`逐字段相等。`runtime_jar_path`指向staged physical JAR，只复算raw length/SHA，不把staged path写回source ref。Bundle staged ref和Runtime Ready ref继续使用`RUNTIME_JAR`，仅按raw length/SHA与source ref闭合。

### 4.3 Profile Asset Staging Root

```text
profile_asset_root = <absolute-normalized-realpath>
profile_asset_tree_ref = {
  kind: "PROFILE_ASSET_TREE",
  path: "profile/assets",
  byte_length: sum(profile_asset_refs[].byte_length),
  sha256: <tree-digest>
}
profile_asset_refs = [
  GRAMMAR_ASSET,
  NORMALIZATION_DATA,
  PROFILE_PACKAGE,
  RULE_SET,
  SYMBOL_ASSET
]
```

`profile_asset_refs`恰五项，采用既有活动Profile契约的UTF-8 path升序；逻辑path必须分别位于`profile/assets/grammar/**`、`profile/assets/normalization/**`、`profile/assets/profile.json`、`profile/assets/rules/**`、`profile/assets/symbols/**`。物理文件唯一映射为：剥离`profile/assets/`前缀后拼接到已验证`profile_asset_root`。禁止按类型重排、绝对asset path、`..`、额外文件、缺项、重复、symlink、hardlink、socket/device/FIFO、临时文件、checkout读取、目录扫描或fallback。

tree digest完全复用Profile/Digest closure owner：

```text
sha256(UTF8(JCS({
  schema_id: "OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001",
  schema_version: "0.1",
  root_path: "profile/assets",
  entries: profile_asset_refs // UTF-8 path升序
})))
```

JSON Schema只封闭字段、类型、顺序、枚举和逻辑path形状，不能表达`profile_asset_tree_ref.byte_length=sum(profile_asset_refs[].byte_length)`或复算JCS tree digest。上述求和、摘要和实际文件identity必须由Node semantic verifier及受控正反例独立验证；不得把Schema-valid解释为Profile tree identity已经闭合。

Profile preflight必须复算五项raw length/SHA、exact五文件inventory、tree byte length/SHA、`profile.json.manifest.entries[]`四项依赖、package digest及Request/Plan active binding；然后调用既有direct-root `ProfilePackageAssembler`验证Rule/Grammar/Symbol/Normalization。禁止新建简化loader或只比较tree SHA。

## 5. 跨进程唯一Join

Node在创建base、clone、Runtime或callback前完成Request `0.2`全部preflight。通过后：

1. Base、Clone、Web命令首token均等于`java_executable_ref.path`，启动后仍按既有outer Runtime JAR CodeSource/raw SHA规则验证JAR；Java executable SHA与Runtime JAR SHA是不同身份，禁止互相替代；
2. Web命令`--opm.assets.root`逐字符等于`profile_asset_root`；
3. Runtime Ready的`profile_asset_refs`与Request五项逐字段相等，`profile_asset_tree_sha256`等于Request `profile_asset_tree_ref.sha256`；
4. Java Ready writer从direct-root实际bytes独立复算五项refs和tree digest，不能照抄Request；
5. 144个attempt全部复用同一只读Java/Profile输入identity，但每个clone、Runtime PID、nonce、storage和Ready artifact保持隔离。

## 6. 首错与零输出

首错顺序在现行03C链首部固定为：

```text
Request 0.2 Schema
-> Java path/type/realpath/raw identity/major
-> Profile root/type/inventory/raw refs/tree/package/binding
-> Plan/Catalog/fixture/Runtime JAR
-> base/clone/Web/READY/callback/shutdown
```

Java或Profile任一检查失败统一为`GOLDEN_COMMON_ADAPTER_INPUT_INVALID/2`，且必须满足：零base、零attestation、零clone、零Runtime child、零监听端口、零callback、零Normalized Result。失败不得尝试替代输入或修改Profile root。

## 7. 实现边界与验收

本修正本身不扩大Adapter/Fault闭包既有Node owner；后继测试输入闭包以独立规格将Planner与Builder/Verifier纳入精确allowlist。生产consumer仍收敛在`scripts/canvas06-common-visual-materialization.mjs`及其测试，Schema consumer改为活动Request `0.2`。Java、Profile、OpenAPI、SQLite DDL、Vue、production配置和既有资产bytes保持只读。

验收至少覆盖：

1. Request `0.2`完整正例和缺/多/错字段反例；
2. Java相对路径、symlink、非文件、不可执行、length/SHA漂移、major非21、PATH/父JAVA_HOME fallback全部拒绝；Builder从exact Java推导JDK root/bin/jar并显式注入Planner的五键环境；
3. Profile root相对/symlink、五类缺失/重复/乱序、额外/链接/特殊文件、raw/tree/package/binding漂移全部拒绝；
4. Base/Clone/Web首token和Web asset root逐字符join；Runtime Ready五refs/tree由Java独立复算后与Request相等；
5. 144次严格串行和关闭矩阵只在上述preflight READY后执行；任一输入失败验证零副作用。

## 8. 回滚与非结论

回滚只撤销活动Request `0.2`及对应consumer/test指针，历史`0.1`保持只读。不得通过恢复环境变量、checkout fallback、目录扫描或把新增字段改为optional实现兼容。

事实：历史Request `0.1`缺少Java/Profile受控输入；Clone/Web协议和Java局部实现不能替代Node入口的权威输入。Adapter Test Input Builder/Verifier字节已出现，但其Runtime kind和Planner JDK环境尚未符合后继修正规格，因此未接纳。假设：无。

非结论：本设计冻结不表示Adapter Test Input Bundle、Node adapter、144次调度、关闭矩阵、PNG、Candidate、Gate、Capability、production或ISO符合性已经实现或验证。
