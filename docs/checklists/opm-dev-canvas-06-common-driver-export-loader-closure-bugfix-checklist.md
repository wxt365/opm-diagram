# Checklist: DEV-CANVAS-06 Common Driver Export 与 Loader Closure Bugfix

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `testing (primary)`
- [x] `design-module-docs`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 复现与Root Cause | 1~2 | CE01~CE04 |
| 唯一导出与source边界 | 3 | CE05~CE13 |
| 修改边界与计数 | 4 | CE14~CE17 |
| 验收与回滚 | 5~6 | CE18~CE23、I01~I05 |

## Design Closure

- [x] CE01 Common实际四导出已查证。
- [x] CE02 Controlled Invocation旧四模块三导出要求已查证。
- [x] CE03 Common属于15项unchanged source entry已查证。
- [x] CE04 Root Cause冻结为契约错误扩展，不是Common实现缺失。
- [x] CE05 Family三个module继续严格三导出。
- [x] CE06 Common继续严格四导出。
- [x] CE07 Common driver identity映射已冻结。
- [x] CE08 Common case集合唯一取`Object.keys(COMMON_CASES)`。
- [x] CE09 Common键顺序必须等于Manifest原序16项。
- [x] CE10 禁止兼容别名、default或extra export。
- [x] CE11 四Driver source/mirror/Manifest三方bytes仍为强约束。
- [x] CE12 每session按SHA最多import一次。
- [x] CE13 错误码冻结为`E2E_DRIVER_CONTRACT_INVALID/3`。
- [x] CE14 不修改Common Driver bytes。
- [x] CE15 Stage R保持25。
- [x] CE16 O..R保持45。
- [x] CE17 Source Set保持9+15=24。
- [x] CE18 Family/Common导出正反例已冻结。
- [x] CE19 case集合正反例已冻结。
- [x] CE20 source三方join正反例已冻结。
- [x] CE21 禁止提升Gate或发布状态。
- [x] CE22 回滚边界已冻结。
- [x] CE23 非结论已冻结。

## Implementation

- [ ] I01 先补旧四模块三导出要求会拒绝Common的失败测试。
- [ ] I02 实现两类封闭export verifier。
- [ ] I03 实现四Driver exact loader与session SHA cache。
- [ ] I04 验证Family 178与Common 16原序集合。
- [ ] I05 重跑Stage R/Source Set计数与Common回归。
