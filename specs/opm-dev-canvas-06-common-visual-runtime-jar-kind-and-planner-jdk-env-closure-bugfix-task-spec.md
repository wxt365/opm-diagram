# Spec: DEV-CANVAS-06 Common Visual Runtime JAR Kind 与 Planner JDK 环境闭包 Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

设计状态：`RUNTIME_JAR_IDENTITY_AND_PLANNER_JDK_ENV_FROZEN`

实现状态：`IMPLEMENTATION_NOT_ACCEPTED / 8_BASE_144_CLONE_NOT_RUN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Adapter Test Input Builder 实现验收中发现的两个事实性冲突：

1. READY Handoff 与 Capture Plan 的 `runtime_jar_ref.kind=LOCAL_RUNTIME_JAR`，活动 Adapter Request `0.2` Schema 却要求 `RUNTIME_JAR`，导致三方逐字段 exact join 不可能成立；
2. Builder 的唯一 JDK 输入是 `--java-executable`，但 Planner 只从父进程 `JAVA_HOME`定位 `jar`。父环境与显式 Java 不一致时，Planner 会消费错误 JDK，违反零 fallback 契约。

本规格保持 Request `0.2/0.2.0`、Capture Plan `0.1/0.1.0`、Bundle `0.1/0.1.0`及 Runtime Ready `0.1/0.1.0`版本不变，只修正尚未接纳实现的冻结语义。

## 2. Root Cause

### 2.1 Runtime JAR 身份混用

当前链路实际存在两个不同 ref：

- source identity：READY Handoff 中的构建产物及 Capture Plan 引用，逻辑 kind 为 `LOCAL_RUNTIME_JAR`；
- staged identity：Builder 逐 byte 复制到 Bundle/attempt-local root 的物理文件，逻辑 kind 为 `RUNTIME_JAR`。

活动 Request 同时包含 `runtime_jar_path`和`runtime_jar_ref`。前者指向 staged physical JAR，后者必须保留 source identity；把后者强制为 `RUNTIME_JAR`会把两种身份合并，并使 Handoff/Plan/Request exact join 永远失败。

### 2.2 Planner JDK 来源分叉

Builder 已验证 `--java-executable`是 exact Java 21，但调用 Planner 时未构造受控子进程环境。Planner 的 `java21Jar()`读取继承的 `process.env.JAVA_HOME`，因此父进程可让 Java executable 与 archive tool 来自两个不同 JDK。

## 3. 冻结修正

### 3.1 Source 与 staged Runtime JAR

活动 Request `0.2`唯一冻结为：

```text
request.runtime_jar_ref.kind=LOCAL_RUNTIME_JAR
request.runtime_jar_ref == plan.runtime_jar_ref == handoff.build_artifacts[kind=LOCAL_RUNTIME_JAR]
```

上述三个 ref 必须对 `kind/path/byte_length/sha256`逐字段相等。Request 的 `runtime_jar_path`仍必须是 Bundle final root 内 staged JAR 的绝对路径；Adapter 对该物理文件复算 `byte_length/sha256`并与 source ref 比较，但不得要求 source ref 的逻辑 `path`等于 staged physical path。

Bundle 继续同时记录：

```text
runtime_jar_source_ref.kind=LOCAL_RUNTIME_JAR
runtime_jar_source_ref == request/plan/handoff source ref
runtime_jar_staged_ref.kind=RUNTIME_JAR
runtime_jar_staged_ref.path=inputs/build/local-runtime.jar
runtime_jar_staged_ref.byte_length/sha256 == runtime_jar_source_ref.byte_length/sha256
```

Runtime Ready `0.1`继续记录 attempt-local `RUNTIME_JAR` ref。其 `path`属于 Runtime/attempt root，不得与 Request source ref 的 `path`逐字段比较；Node 只允许按 raw `byte_length/sha256`闭合 Runtime Ready、Bundle staged ref与Request source ref。禁止把 Runtime Ready kind改为`LOCAL_RUNTIME_JAR`，也禁止把 Request source ref改写为 staged ref。

### 3.2 唯一 JDK 根推导

Builder 在创建 staging/final/work root前，必须完成：

```text
java_realpath = realpath(--java-executable)
要求 java_realpath == --java-executable
要求 basename(java_realpath) == java
jdk_root = dirname(dirname(java_realpath))
jar_executable = jdk_root/bin/jar
```

`jar_executable`必须是 absolute realpath、普通单链接可执行文件且不经过 symlink；Builder以空环境执行`jar_executable --version`，只接受`jar 21`或`jar 21.*`。任何路径、类型、权限、链接、版本或执行失败均返回`GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID/2`，且 staging/final/work 均不存在。

禁止独立的`--java-home`、`--jar-executable`、`PATH`搜索、`/usr/bin/env`、父进程`JAVA_HOME`、`java.home`、候选目录扫描或失败后切换 JDK。

### 3.3 Planner 子进程受控环境

Builder 调用 Planner 时必须显式传入新建环境对象，不得直接省略 `env`或传递`process.env`：

```text
JAVA_HOME=<第3.2节推导的jdk_root>
PATH=<dirname(process.execPath)>:/usr/bin:/bin
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
```

环境键集合必须恰为上述五项。父进程的`JAVA_HOME/PATH/NODE_OPTIONS/NPM_CONFIG_*/GIT_*/JAVA_TOOL_OPTIONS/JDK_JAVA_OPTIONS/_JAVA_OPTIONS/CLASSPATH`及其他变量不得进入 Planner。Planner 继续只从其受控`JAVA_HOME/bin/jar`读取 archive tool，不新增第二个 CLI 或 fallback。

Builder/Verifier source、Planner source和测试均属于已有`19=8 M+11 A`实现范围；本修正不扩大实现 allowlist。Verifier必须由 Bundle 的 `java_executable_ref.path`重复第3.2节推导与`jar --version`验证，但不重跑 Planner、不读取父环境。

## 4. 首错、事务与验收

首错顺序修正为：

```text
CLI/source/Handoff/Intake
-> exact Java executable
-> derived JDK root/jar executable/version
-> Runtime source ref and source bytes
-> fresh roots
-> Profile/Common
-> Planner with controlled environment
-> Plan/Handoff/Request source-ref exact join
-> staged Runtime raw join
-> remaining Request/Observed/Bundle transaction
```

必须覆盖：

1. Request `0.2`以`LOCAL_RUNTIME_JAR`通过，旧`RUNTIME_JAR`被Schema拒绝；
2. Handoff/Plan/Request四字段完全相等，任一字段漂移返回join mismatch；
3. Bundle source/staged ref仅path/kind不同，raw length/SHA相等；Runtime Ready按staged raw identity闭合；
4. 父进程`JAVA_HOME`缺失、指向JDK 17或恶意目录时，只要显式Java为有效JDK 21，Planner得到的`JAVA_HOME`始终为推导根且结果一致；
5. 推导出的`bin/jar`缺失、symlink、hardlink、不可执行或非21时，在创建任何输出前以input invalid拒绝；
6. 捕获 Planner spawn 参数，确认环境键集合和值精确匹配第3.3节，且无父环境泄漏；
7. Planner失败不得被误报为通用transaction failure；输入/JDK问题为exit 2，semantic join为exit 3，真实I/O/原子事务异常才为exit 4；
8. 修正后才能重新执行 Builder/Verifier完整验收及`8 base/144 clone`。

## 5. 修改边界与回滚

设计修正允许修改本规格/checklist、活动Request `0.2` Schema、Visual Common主设计、Adapter受控输入规格、Builder闭包规格及其checklist、03C实现规格/checklist、Clone/Web协议说明、测试策略、开发执行包、release入口、契约索引、文档索引和冻结基线。

后继实现仍只允许既有`19=8 M+11 A`，其中本修正涉及的代码路径已经包含：Planner及测试、Builder及测试、Verifier、Adapter及测试。禁止修改Handoff、Capture Plan、Bundle或Runtime Ready Schema版本，禁止修改Profile/Common业务bytes、公共API、SQLite DDL、Spring生产配置、Gate或Capability状态。

回滚必须同时恢复Request Schema与全部active pointer，并重新把Builder/Verifier置为`BLOCKED_BY_RUNTIME_JAR_AND_PLANNER_JDK_CONTRACT`；不得通过放宽exact join、继承父环境或把两个Runtime ref合并实现回滚。

事实：当前未接纳实现可复现Request kind冲突，Builder调用Planner时也未传受控env；真实`8/144`尚未执行。假设：无。

