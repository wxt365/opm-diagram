const state = {
  page: "P01",
  zoom: 100,
  tool: "select",
  selected: "raw-material",
  readOnly: false,
  overlay: null,
  objectCount: 1,
  processCount: 1
};

const pages = [...document.querySelectorAll("[data-page]")];
const pageLinks = [...document.querySelectorAll("[data-page-link]")];
const dialog = document.querySelector("#overlay-dialog");
const dialogForm = document.querySelector("#overlay-form");
const dialogId = document.querySelector("#dialog-id");
const dialogTitle = document.querySelector("#dialog-title");
const dialogContent = document.querySelector("#dialog-content");
const dialogSubmit = document.querySelector("#dialog-submit");
const toast = document.querySelector("#toast");
const canvasStage = document.querySelector("#canvas-stage");
const zoomOutput = document.querySelector("#zoom-output");

const overlays = {
  OV01: {
    title: "创建项目",
    submit: "创建并继续",
    body: `
      <label class="field"><span>项目名称</span><input name="project-name" value="智能仓储系统" required maxlength="256"></label>
      <label class="field"><span>说明</span><input name="project-description" value="仓储作业与设备协同建模"></label>
      <label class="field"><span>默认 Profile</span><select name="profile"><option>ISO 19450:2024 草案 · 0.1.0</option><option>OPM 基础配置</option></select></label>
      <div class="read-field"><span>本地位置</span><code>~/OPM Studio/智能仓储系统</code></div>`
  },
  OV02: {
    title: "创建模型",
    submit: "创建并打开工作台",
    body: `
      <label class="field"><span>模型名称</span><input name="model-name" value="仓储履约系统" required maxlength="256"></label>
      <label class="field"><span>Profile</span><select><option>ISO 19450:2024 草案 · 0.1.0</option></select></label>
      <div class="dialog-summary"><div><span>根 Context</span><strong>SD</strong></div><div><span>文本模态</span><strong>OPL</strong></div><div><span>初始修订</span><strong>Draft r1</strong></div></div>
      <div class="evidence-note"><strong>草案配置档</strong><span>当前资产用于开发验证，不形成 ISO 符合性声明。</span></div>`
  },
  OV03: {
    title: "创建细化 OPD",
    submit: "创建并打开",
    body: `
      <label class="field"><span>细化对象</span><input value="Processing" disabled></label>
      <label class="field"><span>细化方式</span><select><option>过程展开 - 新 OPD</option><option>过程内缩放</option></select></label>
      <label class="field"><span>Context 名称</span><input value="Processing refinement" required></label>
      <div class="dialog-summary"><div><span>父 Context</span><strong>SD</strong></div><div><span>目标树</span><strong>过程树</strong></div><div><span>新修订</span><strong>r19</strong></div></div>`
  },
  OV04: {
    title: "配置档转换分析",
    submit: "创建分析任务",
    body: `
      <label class="field"><span>目标 Profile</span><select><option>OPM 基础配置 · 1.0.0</option></select></label>
      <div class="dialog-summary"><div><span>无损</span><strong>7</strong></div><div><span>有损</span><strong>1</strong></div><div><span>不可映射</span><strong>0</strong></div></div>
      <ul class="impact-list"><li><span>固定输入</span><strong>revision r18</strong></li><li><span>处理方式</span><strong>隔离 staging，不改写源模型</strong></li><li><span>提交结果</span><strong>确认分析报告后创建新修订</strong></li></ul>`
  },
  OV05: {
    title: "创建命名快照",
    submit: "创建快照",
    body: `
      <label class="field"><span>快照名称</span><input value="语义闭环确认" required></label>
      <label class="field"><span>变更说明</span><input value="完成对象、过程、状态和消耗关系闭环"></label>
      <div class="dialog-summary"><div><span>目标修订</span><strong>r18</strong></div><div><span>保存状态</span><strong>已保存</strong></div><div><span>快照属性</span><strong>不可变</strong></div></div>`
  },
  OV06: {
    title: "生成本地基线",
    submit: "生成不可变基线",
    body: `
      <label class="field"><span>基线名称</span><input value="最小语义闭环基线" required></label>
      <label class="field"><span>说明</span><input value="对象、过程、状态、消耗关系与 OPL 已闭合"></label>
      <div class="dialog-summary"><div><span>固定修订</span><strong>r18</strong></div><div><span>阻断问题</span><strong>0</strong></div><div><span>文本追踪</span><strong>当前</strong></div></div>
      <ul class="impact-list"><li><span>Profile</span><strong>ISO 草案 0.1.0</strong></li><li><span>Rule</span><strong>0.1.0 · 证据未就绪</strong></li><li><span>基线状态</span><strong>本地只读，不宣称 ISO 符合</strong></li></ul>`
  },
  OV07: {
    title: "导入项目或模型",
    submit: "检查导入包",
    body: `
      <label class="field"><span>本地文件</span><input value="manufacturing-system.opmp" required></label>
      <label class="field"><span>导入目标</span><select><option>创建新项目</option><option>创建新草稿</option></select></label>
      <div class="dialog-summary"><div><span>格式检查</span><strong>待运行</strong></div><div><span>Profile</span><strong>待识别</strong></div><div><span>身份冲突</span><strong>待分析</strong></div></div>`
  },
  OV08: {
    title: "导出产物",
    submit: "创建导出任务",
    body: `
      <label class="field"><span>导出范围</span><select><option>当前修订 r18</option><option>本地基线 BL-001</option></select></label>
      <label class="field"><span>格式</span><select><option>OPM 原生包 (.opmp)</option><option>OPL 文本</option></select></label>
      <div class="read-field"><span>本地位置</span><code>~/OPM Studio/exports/</code></div>
      <div class="evidence-note"><strong>版本元数据随包导出</strong><span>包含 Revision、Profile、Rule、Schema 和 manifest 摘要。</span></div>`
  },
  OV09: {
    title: "备份项目",
    submit: "开始备份",
    body: `
      <label class="field"><span>备份范围</span><select><option>完整项目</option></select></label>
      <label class="field"><span>位置</span><input value="~/OPM Studio/backups/" required></label>
      <div class="dialog-summary"><div><span>数据库</span><strong>SQLite 1.0</strong></div><div><span>资产</span><strong>全部</strong></div><div><span>预计大小</span><strong>24.8 MB</strong></div></div>`
  },
  OV10: {
    title: "恢复备份",
    submit: "校验并恢复",
    body: `
      <label class="field"><span>备份文件</span><select><option>backup-20260727-0942.opmb</option></select></label>
      <label class="field"><span>恢复模式</span><select><option>创建独立恢复项目</option><option>覆盖当前项目</option></select></label>
      <ul class="impact-list"><li><span>完整性</span><strong>manifest 与摘要通过</strong></li><li><span>目标</span><strong>柔性制造系统（恢复副本）</strong></li><li><span>源项目</span><strong>保持不变</strong></li></ul>
      <label class="switch"><input type="checkbox" required><span></span><em>确认恢复为独立项目</em></label>`
  },
  OV11: {
    title: "OPD 影响确认",
    submit: "提交移动命令",
    body: `
      <label class="field"><span>目标 OPD</span><input value="质量确认" disabled></label>
      <label class="field"><span>动作</span><select><option>移动到 Processing refinement</option><option>删除 OPD</option></select></label>
      <ul class="impact-list"><li><span>拥有元素</span><strong>3 个</strong></li><li><span>引用出现</span><strong>2 个 Context</strong></li><li><span>细化边</span><strong>1 条</strong></li><li><span>模型视图</span><strong>1 个需要刷新</strong></li></ul>`
  },
  SEMANTIC_ZOOM: {
    id: "语义命令",
    title: "过程内缩放",
    submit: "提交语义缩放",
    body: `
      <div class="evidence-note"><strong>将改变模型语义</strong><span>该操作会创建新的 Context/Occurrence、Revision 和 OPL 段落。</span></div>
      <ul class="impact-list"><li><span>目标过程</span><strong>Processing</strong></li><li><span>基础修订</span><strong>r18</strong></li><li><span>命令类型</span><strong>SEMANTIC_IN_ZOOM</strong></li><li><span>视口比例</span><strong>保持当前值，不进入修订</strong></li></ul>`
  }
};

function navigate(pageId) {
  state.page = pageId;
  pages.forEach((page) => page.classList.toggle("active", page.dataset.page === pageId));
  pageLinks.forEach((link) => link.classList.toggle("active", link.dataset.pageLink === pageId));
  window.location.hash = pageId;
  window.scrollTo({top: 0, behavior: "auto"});
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function openOverlay(id) {
  const overlay = overlays[id];
  if (!overlay) return;
  state.overlay = id;
  dialogId.textContent = overlay.id || id;
  dialogTitle.textContent = overlay.title;
  dialogContent.innerHTML = overlay.body;
  dialogSubmit.textContent = overlay.submit;
  dialog.showModal();
  dialogContent.querySelector("input:not([disabled]), select:not([disabled])")?.focus();
}

function closeOverlay() {
  state.overlay = null;
  dialog.close();
}

function completeOverlay(id) {
  const outcomes = {
    OV01: ["项目已创建，进入项目详情。", "P02"],
    OV02: ["模型、根 Context 和初始修订已创建。", "P03"],
    OV03: ["细化 OPD 已创建并加入过程树。", "P03"],
    OV04: ["转换分析任务已登记。", "P05"],
    OV05: ["不可变命名快照 SN-004 已创建。", "P04"],
    OV06: ["本地基线 BL-002 已创建，不包含 ISO 符合性声明。", "P04"],
    OV07: ["导入检查任务已登记，活动项目未改变。", "P06"],
    OV08: ["导出任务已登记。", state.page],
    OV09: ["备份任务已登记。", "P06"],
    OV10: ["恢复任务已登记，将创建独立项目。", "P06"],
    OV11: ["OPD 移动命令已提交并生成新修订。", "P03"],
    SEMANTIC_ZOOM: ["过程内缩放已提交，生成修订 r19。", "P03"]
  };
  const [message, target] = outcomes[id] || ["操作已完成。", state.page];
  closeOverlay();
  if (target) navigate(target);
  showToast(message);
}

function setZoom(nextZoom) {
  state.zoom = Math.min(400, Math.max(25, nextZoom));
  canvasStage.style.transform = `scale(${state.zoom / 100})`;
  zoomOutput.value = `${state.zoom}%`;
  zoomOutput.textContent = `${state.zoom}%`;
}

function setTool(tool) {
  if (state.readOnly && ["object", "process", "consumption"].includes(tool)) {
    showToast("当前为只读基线，不能执行语义写入。");
    return;
  }
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  const modeLabel = document.querySelector("#canvas-mode");
  const labels = {select: "选择模式", pan: "平移模式", object: "对象创建", process: "过程创建", consumption: "消耗关系"};
  modeLabel.textContent = labels[tool] || tool;

  if (tool === "object" || tool === "process") addNode(tool);
  if (tool === "consumption") showToast("关系候选已按当前 Profile 过滤为 Consumption。");
}

function addNode(kind) {
  const number = kind === "object" ? ++state.objectCount : ++state.processCount;
  const node = document.createElement("button");
  const left = kind === "object" ? 150 + number * 42 : 450 + number * 32;
  const top = 320 + (number % 2) * 30;
  const id = `${kind}-${number}`;
  node.type = "button";
  node.className = `opm-node ${kind}`;
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.dataset.select = id;
  node.textContent = kind === "object" ? `Object ${number}` : `Process ${number}`;
  canvasStage.append(node);
  selectEntity(id);
  showToast(`${kind === "object" ? "对象" : "过程"}候选已加入画布，提交后才进入正式修订。`);
}

function selectEntity(id) {
  state.selected = id;
  document.querySelectorAll(".opm-node").forEach((node) => {
    const selected = node.dataset.select === id || (id === "consumption" && ["raw-material", "processing"].includes(node.dataset.select));
    node.classList.toggle("selected", selected);
  });
  document.querySelectorAll(".opm-edge").forEach((edge) => edge.classList.toggle("highlighted", id === "consumption"));
  document.querySelectorAll(".opl-sentence").forEach((sentence) => sentence.classList.toggle("selected", id === "consumption" || id === "raw-material" || id === "processing"));
  renderInspector(id);
}

function renderInspector(id) {
  const kind = document.querySelector(".selection-kind");
  const panel = document.querySelector("#inspector-content");
  if (!kind || !panel) return;

  if (id === "consumption") {
    kind.textContent = "关系";
    panel.innerHTML = `
      <div class="read-field"><span>关系类型</span><code>Consumption</code></div>
      <div class="read-field"><span>稳定标识</span><code>fact.processing.consumes.raw</code></div>
      <label class="field"><span>对象端点</span><input value="available Raw Material" disabled></label>
      <label class="field"><span>过程端点</span><input value="Processing" disabled></label>
      <div class="read-field"><span>OPL 模板</span><code>opl.consumption.state.v1</code></div>
      <button class="button secondary full semantic-action" type="button" data-overlay="OV11">查看影响</button>`;
  } else if (id === "processing" || id.startsWith("process-")) {
    const label = id === "processing" ? "Processing" : `Process ${id.split("-")[1]}`;
    kind.textContent = "过程";
    panel.innerHTML = `
      <label class="field"><span>名称</span><input value="${label}" class="semantic-field"></label>
      <label class="field"><span>类型</span><select class="semantic-field"><option>Process</option></select></label>
      <div class="read-field"><span>稳定标识</span><code>${id === "processing" ? "element.processing" : id}</code></div>
      <div class="read-field"><span>Capability</span><code>CAP-PROCESS-001</code></div>
      <button class="button primary full semantic-action" type="button" data-action="commit-property">应用更改</button>`;
  } else {
    const label = id === "raw-material" ? "Raw Material" : `Object ${id.split("-")[1] || ""}`;
    kind.textContent = "对象";
    panel.innerHTML = `
      <label class="field"><span>名称</span><input value="${label}" class="semantic-field"></label>
      <div class="field-row"><label class="field"><span>类型</span><select class="semantic-field"><option>Object</option></select></label><label class="field"><span>归属</span><select class="semantic-field"><option>Systemic</option></select></label></div>
      <div class="read-field"><span>稳定标识</span><code>${id === "raw-material" ? "element.raw.material" : id}</code></div>
      <div class="read-field"><span>Capability</span><code>CAP-OBJECT-001</code></div>
      <fieldset><legend>状态</legend><div class="state-list"><span>${id === "raw-material" ? "available" : "暂无"} <small>${id === "raw-material" ? "初始" : ""}</small></span><button class="icon-button semantic-action" type="button" title="添加状态">＋</button></div></fieldset>
      <button class="button primary full semantic-action" type="button" data-action="commit-property">应用更改</button>`;
  }
  applyReadOnlyState();
}

function setBottomTab(tab) {
  document.querySelectorAll("[data-bottom-tab]").forEach((button) => button.classList.toggle("active", button.dataset.bottomTab === tab));
  document.querySelectorAll("[data-bottom-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.bottomPanel !== tab;
  });
}

function applyReadOnlyState() {
  document.querySelector(".readonly-banner").hidden = !state.readOnly;
  document.querySelectorAll(".semantic-action, .semantic-field").forEach((control) => {
    control.disabled = state.readOnly;
    if (state.readOnly) control.title = "当前为只读基线";
  });
  const badge = document.querySelector(".revision-badge");
  if (badge) badge.textContent = state.readOnly ? "基线 BL-001 · 只读" : "草稿 r18";
}

function runValidation() {
  const progress = document.querySelector("#validation-progress");
  const label = document.querySelector("#validation-label");
  let value = 0;
  if (label) label.textContent = "校验任务运行中 · 固定 r18";
  if (progress) progress.value = 0;
  showToast("全量校验任务已登记，输入固定为 r18。");
  const timer = window.setInterval(() => {
    value += 20;
    if (progress) progress.value = value;
    if (value >= 100) {
      window.clearInterval(timer);
      if (label) label.textContent = "校验结果当前 · 阻断 0 / 警告 1";
      showToast("校验完成：阻断 0，警告 1，符合性证据未就绪。");
    }
  }, 160);
}

document.addEventListener("click", (event) => {
  const pageLink = event.target.closest("[data-page-link]");
  if (pageLink) {
    navigate(pageLink.dataset.pageLink);
    return;
  }

  const overlayButton = event.target.closest("[data-overlay]");
  if (overlayButton) {
    if (state.readOnly && overlayButton.classList.contains("semantic-action")) {
      showToast("当前为只读基线，不能执行语义写入。");
      return;
    }
    openOverlay(overlayButton.dataset.overlay);
    return;
  }

  if (event.target.closest("[data-close-dialog]")) {
    closeOverlay();
    return;
  }

  const tool = event.target.closest("[data-tool]");
  if (tool) {
    setTool(tool.dataset.tool);
    return;
  }

  const zoom = event.target.closest("[data-zoom]");
  if (zoom) {
    if (zoom.dataset.zoom === "in") setZoom(state.zoom + 10);
    if (zoom.dataset.zoom === "out") setZoom(state.zoom - 10);
    if (zoom.dataset.zoom === "fit") setZoom(80);
    return;
  }

  const bottomTab = event.target.closest("[data-bottom-tab]");
  if (bottomTab) {
    setBottomTab(bottomTab.dataset.bottomTab);
    return;
  }

  const selectable = event.target.closest("[data-select]");
  if (selectable) {
    selectEntity(selectable.dataset.select);
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "validate") runValidation();
  if (action === "commit-property") {
    if (state.readOnly) showToast("当前为只读基线，不能提交属性。");
    else showToast("属性命令已提交，生成修订 r19 与新 OPL 投影。");
  }
  if (action === "open-baseline") {
    state.readOnly = true;
    navigate("P03");
    applyReadOnlyState();
    showToast("已打开不可变基线 BL-001。");
  }
  if (action === "draft-from-baseline") {
    state.readOnly = false;
    applyReadOnlyState();
    showToast("已基于 BL-001 创建新草稿 r19。");
  }
  if (action === "locate-finding") {
    state.readOnly = false;
    navigate("P03");
    applyReadOnlyState();
    setBottomTab("findings");
    selectEntity("raw-material");
    showToast("已定位 Finding 对应的 Context、对象和 OPL 句子。");
  }
});

dialogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dialogForm.reportValidity()) return;
  completeOverlay(state.overlay);
});

dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOverlay();
});

window.addEventListener("hashchange", () => {
  const requested = window.location.hash.slice(1).toUpperCase();
  if (pages.some((page) => page.dataset.page === requested)) navigate(requested);
});

const initialPage = window.location.hash.slice(1).toUpperCase();
navigate(pages.some((page) => page.dataset.page === initialPage) ? initialPage : "P01");
setZoom(100);
selectEntity("raw-material");
