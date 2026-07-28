import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useDesignConfirmationStore } from "./designConfirmation";

describe("designConfirmation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("视口缩放只改变本地视图比例", () => {
    const store = useDesignConfirmationStore();
    const revision = store.workbench.revision;

    store.setViewportZoom(130);

    expect(store.workbench.zoom).toBe(130);
    expect(store.workbench.revision).toBe(revision);
    expect(store.workbench.validationState).toBe("current");
  });

  it("导航、底部标签和画布工具通过视图状态动作切换", () => {
    const store = useDesignConfirmationStore();

    store.setNavigationMode("object-forest");
    store.setBottomTab("findings");
    store.setCanvasTool("pan");

    expect(store.workbench.navigationMode).toBe("object-forest");
    expect(store.workbench.bottomTab).toBe("findings");
    expect(store.workbench.tool).toBe("pan");
  });

  it("确认语义缩放后创建新的设计修订", () => {
    const store = useDesignConfirmationStore();
    const revision = store.workbench.revision;

    store.openOverlay("semantic-zoom");
    store.confirmSemanticZoom();

    expect(store.workbench.revision).toBe(revision + 1);
    expect(store.overlay).toBeNull();
    expect(store.workbench.lastAction).toContain("SEMANTIC_IN_ZOOM");
    expect(store.workbench.validationState).toBe("stale");
  });

  it("只读基线阻止语义候选并可创建新草稿", () => {
    const store = useDesignConfirmationStore();
    const revision = store.workbench.revision;
    const nodeCount = store.workbench.nodes.length;

    store.createBaseline();
    store.addCandidate("object");
    store.selectConsumption();

    expect(store.workbench.accessMode).toBe("readonly-baseline");
    expect(store.workbench.nodes).toHaveLength(nodeCount);
    expect(store.workbench.selectedId).not.toBe("consumption");

    store.createDraftFromBaseline();

    expect(store.workbench.accessMode).toBe("editable-draft");
    expect(store.workbench.revision).toBe(revision + 1);
  });

  it("新建模型从 r1 与过期校验状态开始", () => {
    const store = useDesignConfirmationStore();
    const model = store.createModel("新模型");

    expect(model?.revision).toBe(1);
    expect(store.workbench.revision).toBe(1);
    expect(store.workbench.validationState).toBe("stale");
    expect(store.workbench.nodes).toHaveLength(0);
    expect(store.workbench.lastAction).toBe("已打开 Draft r1");
  });

  it("切换模型会重置本地确认画布与上下文", () => {
    const store = useDesignConfirmationStore();

    store.selectModel("model-warehouse");

    expect(store.workbench.revision).toBe(6);
    expect(store.workbench.nodes.map((node) => node.label)).toEqual(["Inventory", "Fulfillment"]);
    expect(store.workbench.contexts[0]?.name).toBe("SD · 智能仓储系统");
    expect(store.workbench.validationState).toBe("stale");
    expect(store.workbench.relations).toHaveLength(1);
  });

  it("Consumption 候选必须具备 Object 和 Process 端点", () => {
    const store = useDesignConfirmationStore();
    const model = store.createModel("空模型");
    expect(model).not.toBeNull();

    store.selectConsumption();
    expect(store.workbench.relations).toHaveLength(0);

    store.addCandidate("object");
    store.addCandidate("process");
    expect(store.workbench.nodes[0]?.y).toBe(80);
    expect(store.workbench.nodes[1]?.y).toBe(80);
    store.selectConsumption();
    expect(store.workbench.relations).toHaveLength(1);
    expect(store.workbench.selectedId).toBe(store.workbench.relations[0]?.id);
  });

  it("文本、校验和阻断问题必须同时满足才可创建基线", () => {
    const store = useDesignConfirmationStore();
    store.workbench.textState = "stale";

    expect(store.isBaselineReady).toBe(false);
    expect(store.createBaseline()).toBe(false);

    store.workbench.textState = "current";
    store.workbench.blockingFindings = 1;
    expect(store.isBaselineReady).toBe(false);

    store.workbench.blockingFindings = 0;
    expect(store.isBaselineReady).toBe(true);
  });

  it("属性候选在一个修订中更新配置档允许的字段", () => {
    const store = useDesignConfirmationStore();
    const revision = store.workbench.revision;

    store.commitProperty("Material", {
      valueDomain: "solid/liquid",
      visibility: "protected",
      multiplicity: "1..*",
      architectureLayer: "功能",
    });

    expect(store.workbench.revision).toBe(revision + 1);
    expect(store.workbench.nodes[0]).toMatchObject({
      label: "Material",
      valueDomain: "solid/liquid",
      visibility: "protected",
      multiplicity: "1..*",
      architectureLayer: "功能",
    });
  });

  it("细化和快照会回写设计确认状态", () => {
    const store = useDesignConfirmationStore();
    const revision = store.workbench.revision;

    expect(store.createRefinement("质量细化 OPD")).toBe(true);
    expect(store.workbench.revision).toBe(revision + 1);
    expect(store.workbench.contexts.at(-1)?.name).toBe("质量细化 OPD");
    expect(store.createSnapshot("里程碑快照")).toBe(true);
    expect(store.workbench.snapshotCount).toBe(1);
    expect(store.workbench.lastSnapshotName).toBe("里程碑快照");
  });

  it("切换 Context 时同步切换画布投影、文本 Trace 和 Finding", () => {
    const store = useDesignConfirmationStore();

    store.selectContext("processing-refinement");

    expect(store.workbench.activeContextId).toBe("processing-refinement");
    expect(store.workbench.nodes.map((node) => node.label)).toEqual(["Processing Input", "Quality Check"]);
    expect(store.activeTextTraces[0]?.relationId).toBe(store.workbench.relations[0]?.id);
    expect(store.activeFindings[0]?.contextId).toBe("processing-refinement");
  });

  it("文本 Trace 与 Finding 通过稳定定位切换 Context 和选中目标", () => {
    const store = useDesignConfirmationStore();
    store.selectContext("processing-refinement");
    const sentenceId = store.activeTextTraces[0]?.sentenceId;
    const findingId = store.activeFindings[0]?.id;

    if (sentenceId) store.locateTextTrace(sentenceId);
    expect(store.workbench.selectedId).toBe(store.workbench.relations[0]?.id);

    store.selectContext("raw-material-sd");
    if (findingId) store.locateFinding(findingId);
    expect(store.workbench.activeContextId).toBe("processing-refinement");
    expect(store.workbench.selectedId).toBe("processing-input");
  });

  it("细化预览由当前选择推导并写入对应树", () => {
    const store = useDesignConfirmationStore();
    store.selectConstruct("raw-material");

    expect(store.refinementPreview?.targetTree).toBe("对象林");
    expect(store.createRefinement("原料检查细化")).toBe(true);
    expect(store.workbench.activeContextId).toContain("context-");
    expect(store.workbench.contexts.at(-1)?.kind).toBe("object-refinement");
    expect(store.workbench.contexts.at(-1)?.refineeId).toBe("raw-material");
  });

  it("保存失败会阻断快照和基线，并保留失败状态", () => {
    const store = useDesignConfirmationStore();
    store.markSaveFailed();

    expect(store.createSnapshot("失败快照")).toBe(false);
    expect(store.createBaseline()).toBe(false);
    expect(store.workbench.autosaveState).toBe("save-failed");
    expect(store.workbench.commandState).toBe("blocked");
  });

  it("命名快照使用独立弹层状态", () => {
    const store = useDesignConfirmationStore();

    store.openOverlay("snapshot");

    expect(store.overlay).toEqual({ kind: "snapshot" });
  });
});
