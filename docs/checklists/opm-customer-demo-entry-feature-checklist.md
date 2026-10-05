# 仓储订单履约演示案例录入 Checklist

- Spec：`specs/opm-customer-demo-entry-feature-task-spec.md`
- [x] ENT-01：五个模型已创建、手动保存并重开核对。
- [ ] ENT-02：SD1 的元素、状态、M-01 至 M-15 及 SD1.1 已录入；跨图引用和根图业务对象未完成。
- [ ] ENT-03：PROC 16、CTRL 8、STRUCT 9 类能力的正例已提交；STRUCT-009 拒绝、N02 错误接受，其余负例与逐条 Golden 比对未完成。
- [ ] ENT-04：保存与草稿 OPL/trace 重开核对完成；正式校验接口对五模型均返回 `PERSISTENCE_FAILED`，其余非关系工具检查未完成。
- 详细实测与缺口：`docs/design/opm-customer-demo-entry-record.md`。
- 边界：只操作新建演示项目及本规格、Checklist、录入记录；不改源码、公共契约、配置、依赖或其他项目。
