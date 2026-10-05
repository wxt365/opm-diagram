# 项目弹窗运行时信息与全局导航修复 Checklist

规格：[任务规格](../../specs/opm-ui-runtime-metadata-navigation-bugfix-task-spec.md)。

边界：已确认只修改规格中两个前端组件及其定向测试、规格与本 Checklist；不改 API、Schema、后端、配置、依赖、用户数据及 `.harness/`。仓库工作区初始干净。

- [x] UI-01：0.2.0、不同版本、其他 Profile ID 与缺失 binding 的显示回归通过；浏览器实际启动版本为 0.2.0。
- [x] UI-02：去除示例路径；创建、取消、Escape 和焦点恢复组件回归通过；真实浏览器验证弹窗和焦点，不提交创建。
- [x] UI-03：工作台隐藏全局导航按钮，项目库与详情导航收起/展开和工作台往返通过；实际 OPD 子图切换和返回父图正常。
- [x] UI-04：修改前新增测试复现 6 项失败，修改后 3 个文件共 13 项通过；前端类型检查、lint 和 `git diff --check` 通过。5177 前端与实际 Runtime 的浏览器验证覆盖 1440×1000、1280×800、390×844，无页面异常、无编辑或创建请求。证据位于 `/private/tmp/opm-ui-priority-check/`。
