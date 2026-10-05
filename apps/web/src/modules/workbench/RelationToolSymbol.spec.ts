import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelationToolSymbol from "./RelationToolSymbol.vue";

function render(symbolId: string) {
  return mount(RelationToolSymbol, { props: { symbolId, label: "关系" } });
}

describe("工具栏关系端点几何", () => {
  it("状态指定生成的箭头在状态框外并指向边界", () => {
    const id = "symbol.link.result.state";
    const wrapper = render(id);
    const state = wrapper.get("rect").element;
    const target = wrapper.findAll("rect").at(-1)!;
    const boundary = Number(target.attributes("x"));
    const points = wrapper.get("polygon").attributes("points").split(" ").map(p => p.split(",").map(Number));
    expect(points[0]).toEqual([boundary, 14]);
    expect(points.slice(1).every(([x]) => x < boundary)).toBe(true);
    expect(state).toBeTruthy();
  });

  it.each([
    ["symbol.link.effect", "false", "false"],
    ["symbol.link.effect.state.input-output", "true", "true"],
  ])("%s 图标由输入端经过程指向输出端", (id, stateSource, stateTarget) => {
    const wrapper = render(id);
    expect(wrapper.get("svg").attributes("data-glyph-kind")).toBe("state-effect-pair");
    expect(wrapper.get("svg").attributes()).toMatchObject({ "data-state-source": stateSource, "data-state-target": stateTarget });
    expect(wrapper.findAll("rect")).toHaveLength(2);
    expect(wrapper.findAll("ellipse")).toHaveLength(1);
    expect(wrapper.get("path").attributes("d")).toBe("M10 14H21M34 14H46");
    const arrows = wrapper.findAll("polygon").map((polygon) => polygon.attributes("points").split(" ").map((point) => point.split(",").map(Number)));
    expect(arrows).toHaveLength(2);
    expect(arrows.map(([tip]) => tip)).toEqual([[21, 14], [46, 14]]);
    expect(arrows.every(([tip, ...tail]) => tail.every(([x]) => x < tip![0]))).toBe(true);
    expect(wrapper.findAll("rect").every((rect) => rect.attributes("rx") === "3")).toBe(stateSource === "true");
  });

  it.each([
    ["symbol.link.effect.state.input", "true", "false"],
    ["symbol.link.effect.state.output", "false", "true"],
  ])("%s 用两段单向箭头和不同的状态端点", (id, stateSource, stateTarget) => {
    const wrapper = render(id);
    expect(wrapper.get("svg").attributes()).toMatchObject({
      "data-glyph-kind": "state-effect-pair", "data-state-source": stateSource, "data-state-target": stateTarget,
    });
    expect(wrapper.get("path").attributes("d")).toBe("M10 14H21M34 14H46");
    expect(wrapper.findAll("polygon")).toHaveLength(2);
    expect(wrapper.findAll("ellipse")).toHaveLength(1);
    const ends = wrapper.findAll("rect").sort((left, right) => Number(left.attributes("x")) - Number(right.attributes("x")));
    expect(ends).toHaveLength(2);
    expect(ends[0].attributes("rx") === "3").toBe(stateSource === "true");
    expect(ends[1].attributes("rx") === "3").toBe(stateTarget === "true");
  });

  it("状态标记箭头和状态展示分支止于状态框边界", () => {
    const tagged = render("symbol.link.structural.tagged.state");
    expect(tagged.findAll("path")[1].attributes("d")).toBe("M46 14L38 8M46 14L38 20");
    const exhibition = render("symbol.link.structural.exhibition.state");
    expect(exhibition.get("path").attributes("d")).toBe("M4 14H19M27 14H46");
  });

  it.each(["bidirectional", "reciprocal"])("%s 只有两条位于相反侧的半箭头斜边", (kind) => {
    expect(render(`symbol.link.structural.tagged.${kind}`).get("path").attributes("d")).toBe("M4 14H52M4 14L11 8M52 14L45 20");
  });
});
