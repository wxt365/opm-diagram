import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelationToolSymbol from "./RelationToolSymbol.vue";

function render(symbolId: string) {
  return mount(RelationToolSymbol, { props: { symbolId, label: "关系" } });
}

describe("工具栏关系端点几何", () => {
  it.each(["symbol.link.result.state", "symbol.link.effect.state.input-output", "symbol.link.effect.state.output"])("%s 的箭头在状态框外并指向边界", (id) => {
    const wrapper = render(id);
    const state = wrapper.get("rect").element;
    const target = wrapper.findAll("rect").at(-1)!;
    const boundary = Number(target.attributes("x"));
    const points = wrapper.get("polygon").attributes("points").split(" ").map(p => p.split(",").map(Number));
    expect(points[0]).toEqual([boundary, 14]);
    expect(points.slice(1).every(([x]) => x < boundary)).toBe(true);
    expect(state).toBeTruthy();
    if (id.includes("input-output")) {
      const left = wrapper.findAll("polygon")[1].attributes("points").split(" ").map(p => p.split(",").map(Number));
      const source = Number(wrapper.get("rect").attributes("x")) + Number(wrapper.get("rect").attributes("width"));
      expect(left[0]).toEqual([source, 14]);
      expect(left.slice(1).every(([x]) => x > source)).toBe(true);
    }
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
