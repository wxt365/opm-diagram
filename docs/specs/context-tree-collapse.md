# OPD 图列表层级折叠

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature。
Active Playbooks: frontend-vue (primary)、testing，沿用相邻 platform 的技术规则；目录及工具链以 diagram 实际实现为准。

## 目标与范围

左侧图列表根据已有 parentId 增加父级展开/收起按钮。点击箭头只切换分支可见性，点击名称仍打开图。折叠不修改当前画布、语义和模型草稿。没有子图的节点仅保留对齐占位。

允许修改 apps/web 的导航展示、局部composable、样式与相关测试、工作台打包版本；platform 仅更新工作台包引用。无后端API、数据库、配置、依赖变化，不重排或修改真实父子数据，不混入配色和连线功能改动。

## 交互与兼容

默认全部展开；折叠记录为当前浏览器的模型级偏好，以项目+模型身份隔离，不存入模型内容。存储不可用时仍可在当前页面正常使用。收起任意父节点隐藏其全部后代，保留更深分支的独立折叠状态。主动折叠当前图的祖先不触发切图；后续通过画布、链接或创建操作切到子图时展开其祖先以显示当前图。读取历史、智能助手预览同样支持展示层折叠。

模型切换恢复各自记录，删除/导入/异步载入及缺失父级不得卡死或影响其他分支。原名称点击、右键、创建子图、返回父图、图总数保留。折叠箭头具备标题、aria-expanded与键盘原生按钮操作。

## 计划

边界已确认。先隔离导航折叠与偏好恢复逻辑，再在现有平铺层级导航添加独立箭头；补充多层显示和当前图定位验证；构建 .31 工作台并更新本机平台使用的包。

## 验收与验证

- TREE-01：全部默认展开，父级箭头收起全部后代，重新展开保留内部折叠，叶子无箭头。
- TREE-02：箭头不切图、不请求模型保存，名称点击与其他操作不变；图总数不随折叠变化。
- TREE-03：模型级偏好跨刷新保留，切换模型隔离；主动切图自动展开当前图祖先，普通数据刷新不会强制展开手动折叠。
- TREE-04：智能助手预览、只读、缺失父级/循环异常、存储禁用时稳定，异步导航不提前丢失记录。
- SHIP-01：定向 Vitest、类型/ESLint、工作台及平台构建通过，真实Chrome检查根/中间层折叠与刷新。

Checklist：引用本文件 TREE-01 至 TREE-04、SHIP-01，边界已确认，验证完成。回滚前端至 .30 即恢复原导航，模型数据与服务端不变；localStorage偏好可保留，对旧版本无影响。

## 实现与验证记录

- useContextTree 根据 parentId 计算祖先及可见节点。modelKey 隔离浏览器偏好；仅定位目标/祖先路径变化时自动展开，避免刷新数据把手动折叠强行展开。损坏或不可用的localStorage回退为当前页面状态。
- WorkbenchSurface增加独立箭头，原名称、创建、返回父级操作保留，计数使用完整图列表；样式使用原配色及14px层级缩进。
- Vitest：useContextTree.spec.ts 5项与WorkbenchView.spec.ts 119项，共124项通过。覆盖多层折叠、内部折叠保留、叶子、名称导航、图总数、草稿不变、模型隔离、异步数据、预览子图、异常存储及父级循环。
- vue-tsc全项目及工作台导出类型检查通过；相关composable、测试和WorkbenchSurface的ESLint通过；工作台.31与平台生产构建通过，平台保留既有大包提示。
- Chrome主题54真实8张图验证：根图折叠只显示1项但总数仍为8；中间分支隐藏下级；刷新恢复根图折叠，重新展开保留中间分支状态；Enter切换箭头，名称打开子图，内部导航定位隐藏子图后祖先展开。无页面错误，无模型commands/save请求，折叠前后画布上下文、draft token及layoutDirty相同。
- 页面验证使用隔离浏览器上下文，不覆盖用户当前浏览器偏好。报告和截图位于 platform/logs/context-tree-browser.json、context-tree-root-collapsed.png、context-tree-branch-collapsed.png、context-tree-expanded.png。
- 已安装.31包并重启本机3000前端，安装index.js与构建产物SHA256一致；本次无后端修改或重启。

本次修改：diagram下WorkbenchSurface.vue、useContextTree.ts及其spec、WorkbenchView.spec.ts、workbench-layout.css、package-workbench.mjs和本文；platform下apps/web-console/package.json及vendor/opm-workbench-0.2.2-platform.31.tgz。
