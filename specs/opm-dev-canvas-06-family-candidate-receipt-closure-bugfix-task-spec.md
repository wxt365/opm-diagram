# DEV-CANVAS-06 Family Candidate Receipt Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `testing (primary)`
- `design-module-docs`

## 1. 问题与 Root Cause

48个Family BLOCKED case必须把真实候选响应的`capability_query_id/selected_option_id`带入唯一正式负例请求。现有production调用对象只暴露六方法`observation_sink`，其中`waitForApi(expected)`未冻结返回值，既有Stage A实现返回`undefined`。Driver无法可信取得候选身份；从DOM、case、fixture或本地生成均会伪造Runtime证据。

## 2. 唯一修正

production Family/Common session中的：

```text
observation_sink.waitForApi(expected)
```

成功后返回深冻结`ApiExchangeReceipt`：

```text
{ raw_request, actual_request, response, exchange_ref }
```

该receipt必须在raw request/response均已原子写入attempt staging、request与Page actual逐字节复核、index entry稳定后返回。Family候选调用还必须满足：

```text
response.status = 200
response.body.data.capability_query_id = 非空字符串
response.body.data.options[] 中 capability_id=companion capability 恰一项
selected_option_id = 该项 option_id
```

Driver只可从该receipt取得两项身份。`precondition_client.execute()`必须逐字段复核其request中的query/option与receipt，并把候选`exchange_ref`纳入subject exchange关联。Common Driver可继续忽略返回值。

Stage A Fault `runControlledLifecycleSession()`与其既有测试sink不属于production `runFamilyControlledInvocationSession()`，允许继续返回`undefined`；禁止让Fault sink伪造raw receipt。

## 3. 边界与验收

不新增sink方法、Schema或source路径，Stage R保持25、累计45、Source Set保持9+15。至少覆盖成功receipt、缺raw/actual/response/ref、错误origin/status、query缺失、option零/多项、option capability漂移、receipt未入index、重复消费和DOM推断负例。

本修正不构成真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性证据。
