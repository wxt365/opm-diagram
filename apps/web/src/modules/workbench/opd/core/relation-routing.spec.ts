import { describe, expect, it } from "vitest";
import type { ConsumptionRelation, EdgeRoute, OpdNode } from "@/shared/types/modeling";
import type { RelationEdgeSpec, RelationRenderSpec } from "./relation-render-spec";
import { clearWaypoints, moveManualRoutes, routeRelations, routeSegment } from "./relation-routing";
import { fitRefinementEnvelope } from "./refinement-envelope";
import { autoLayout } from "@/stores/workbench/autoLayout";

const node = (id: string, x: number, y: number, extra: Partial<OpdNode> = {}): OpdNode => ({ id, occurrenceId: `occ.${id}`, kind: "object", label: id, x, y,
  width: 160, height: 72, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned", ...extra });
const relation = (edgeRoutes?: EdgeRoute[]): ConsumptionRelation => ({ id: "fact", occurrenceId: "occ.fact", sourceId: "a", targetId: "b", sourceOccurrenceId: "occ.a", targetOccurrenceId: "occ.b", layoutRef: "layout.fact", symbolRef: "symbol.link.consumption", edgeRoutes });
const spec = (extra: Partial<RelationRenderSpec> = {}): RelationRenderSpec => ({ relationId: "fact", occurrenceId: "occ.fact", primaryCellId: "fact", family: "PROCEDURAL", symbolId: "symbol.link.consumption",
  cells: [{ kind: "edge", id: "fact", source: "a", target: "b", data: {}, labels: [], line: { stroke: "#20242a", strokeWidth: 2, targetMarker: { name: "circle", fill: "white" } } }], ...extra });
const edge = (value: RelationRenderSpec) => value.cells[0] as RelationEdgeSpec;

describe("editable OPM routes", () => {
  it("局部重算仍使用全部关系分配接点，并保留未修改的路径", () => {
    const nodes = [node("a", 0, 0), node("b", 600, 0), node("c", 0, 120)];
    const specs = [spec({ relationId: "one", occurrenceId: "occ.one", primaryCellId: "one", cells: [{ ...edge(spec()), id: "one" }] }),
      spec({ relationId: "two", occurrenceId: "occ.two", primaryCellId: "two", cells: [{ ...edge(spec()), id: "two", source: "c" }] })];
    const initial = routeRelations(specs, [], nodes);
    const moved = nodes.map(node => node.id === "a" ? { ...node, y: 24 } : node);
    const local = routeRelations([specs[0]!, initial[1]!], [], moved, undefined, new Set(["one"]));
    const full = routeRelations(specs, [], moved);
    expect(edge(local[0]!).targetAnchor).toEqual(edge(full[0]!).targetAnchor);
    expect(edge(local[0]!).targetAnchor!.dy).not.toBe(0);
    expect(edge(local[1]!)).toBe(edge(initial[1]!));
  });
  it("同一对节点的多条自动折线分道，避开正文且输入重排结果稳定", () => {
    const nodes = [node("a", 0, 0), node("b", 500, 220)];
    const specs = Array.from({ length: 3 }, (_, i) => spec({ relationId: `lane.${i}`, occurrenceId: `occ.lane.${i}`,
      cells: [{ ...edge(spec()), id: `lane.${i}` }] }));
    const result = routeRelations(specs, [], nodes);
    expect(result.every(value => edge(value).vertices!.length > 0)).toBe(true);
    const tracks = result.map(value => {
      const cell = edge(value), start = cell.sourceAnchor!, end = cell.targetAnchor!;
      const points = [{ x: 80 + start.dx, y: 36 + start.dy }, ...cell.vertices!, { x: 580 + end.dx, y: 256 + end.dy }];
      for (let i = 1; i < points.length; i++) expect(points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y).toBe(true);
      return points.slice(1).flatMap((b, i) => b.x === points[i]!.x && Math.abs(b.y - points[i]!.y) > 20 ? [b.x] : []);
    });
    expect(new Set(tracks.flat()).size).toBeGreaterThanOrEqual(3);
    expect(routeRelations([...specs].reverse(), [], [...nodes].reverse())).toEqual([...result].reverse());
  });
  it("外置特征的 owner 仍参与避障，只有容纳状态的外框允许跨越", () => {
    const nodes = [node("owner", 220, 0), node("a", 0, 0, { kind: "attribute", ownerId: "owner" }), node("b", 600, 0)];
    expect(edge(routeRelations([spec()], [relation()], nodes)[0]!).router?.args.excludeNodes).not.toContain("owner");
    const states = [node("owner", 0, 0, { width: 240, height: 140 }), node("a", 20, 40, { kind: "state", ownerId: "owner", width: 88, height: 28 }), node("b", 600, 0)];
    expect(edge(routeRelations([spec()], [relation()], states)[0]!).router?.args.excludeNodes).toContain("owner");
  });
  it("routes orthogonally with clearance while allowing owner/envelope crossings and preserving markers", () => {
    const nodes = [node("parent", 0, 0), node("a", 40, 40, { kind: "state", ownerId: "owner" }), node("owner", 20, 10), node("obstacle", 210, 40), node("b", 500, 40)];
    const routed = edge(routeRelations([spec()], [relation()], nodes, "parent")[0]!);
    expect(routed.connector?.name).toBe("normal"); expect(routed.router?.name).toBe("manhattan");
    expect(routed.router?.args).toMatchObject({ padding: 16, startDirections: ["right"], endDirections: ["left"] });
    expect(routed.router?.args.excludeNodes).toEqual(expect.arrayContaining(["owner", "parent"]));
    expect(routed.router?.args.excludeNodes).not.toContain("obstacle");
    expect(routed.sourceAnchor?.dx).toBe(80);
    expect(routed.line).toEqual(edge(spec()).line); expect(routed.source).toBe("a"); expect(routed.target).toBe("b");
  });
  it("reads old manual curves as orthogonal constraints per occurrence and per effect segment", () => {
    const first = edge(spec());
    const multi = spec({ cells: [{ ...first, id: "fact.input" }, { ...first, id: "fact.output" }] });
    const route: EdgeRoute = { segment: "output", style: "CURVE", mode: "MANUAL", points: [{ x: 300, y: 200 }] };
    const routed = routeRelations([multi], [relation([route])], [node("a", 0, 0), node("b", 400, 0)])[0]!;
    expect((routed.cells[0] as RelationEdgeSpec).router?.name).toBe("normal");
    expect((routed.cells[1] as RelationEdgeSpec).router?.name).toBe("manhattan");
    expect((routed.cells[1] as RelationEdgeSpec).vertices).toEqual(route.points);
    expect((routed.cells[1] as RelationEdgeSpec).connector?.name).toBe("normal");
    const other = spec({ occurrenceId: "occ.other" });
    expect(edge(routeRelations([other], [relation([route])], [node("a", 0, 0), node("b", 400, 0)])[0]!).vertices).not.toEqual(route.points);
    expect(routeSegment("fact.old", "fact.old.member.element.long-id", 3)).toBe(routeSegment("fact.new", "fact.new.member.element.remapped", 3));
  });
  it("spreads incoming and outgoing links together and keeps attachments stable on reordered input", () => {
    const nodes = [node("a", 0, 100), node("b", 400, 0), node("c", 400, 100), node("d", 400, 200)];
    const specs = ["b", "c", "d"].map((target, i) => spec({ relationId: `f${i}`, occurrenceId: `o${i}`,
      cells: [{ ...edge(spec()), id: `f${i}`, source: i === 1 ? target : "a", target: i === 1 ? "a" : target }] }));
    const result = routeRelations(specs, [], nodes);
    const anchors = result.map(value => { const c = edge(value); return c.source === "a" ? c.sourceAnchor : c.targetAnchor; });
    expect(new Set(anchors.map(a => a!.dy)).size).toBe(3);
    expect(anchors.every(a => a!.dx === 80 && Math.abs(a!.dy) <= 26)).toBe(true);
    expect(routeRelations([...specs].reverse(), [], [...nodes].reverse())).toEqual([...result].reverse());
  });
  it("normalizes every saved style and recalculates boundary ports on movement and resize", () => {
    for (const style of ["CURVE", "STRAIGHT", "ROUNDED"] as const) {
      const routed = edge(routeRelations([spec()], [relation([{ segment: "main", style, mode: "AUTO", points: [] }])], [node("a", 0, 0), node("b", 400, 0)])[0]!);
      expect(routed.connector?.name).toBe("normal");
      expect(routed.sourceAnchor?.dx).toBe(80);
    }
    const first = edge(routeRelations([spec()], [], [node("a", 0, 0), node("b", 400, 0)])[0]!);
    const moved = edge(routeRelations([spec()], [], [node("a", 0, 0), node("b", 0, 400)])[0]!);
    expect(first.sourceAnchor!.dx).toBe(80); expect(moved.sourceAnchor!.dy).toBe(36);
    expect(moved.router!.args.startDirections).toEqual(["bottom"]);
    const resized = edge(routeRelations([spec()], [], [node("a", 0, 0, { width: 240 }), node("b", 500, 0)])[0]!);
    expect(resized.sourceAnchor?.dx).toBe(120);
  });
  it("distributes reverse ports and moves obsolete waypoints outside obstacle bodies", () => {
    const nodes = [node("a", 0, 100), node("b", 500, 100), node("middle", 250, 80)];
    const specs = [spec({ cells: [{ ...edge(spec()), vertices: [{ x: 350, y: 160 }] }] }), spec({ relationId: "reverse", occurrenceId: "occ.reverse",
      cells: [{ ...edge(spec()), id: "reverse", source: "b", target: "a", vertices: [{ x: 350, y: 184 }] }] })];
    const result = routeRelations(specs, [], nodes).map(edge);
    expect(result[0]!.sourceAnchor).not.toEqual(result[1]!.targetAnchor);
    expect(result.every(cell => cell.vertices!.every(p => p.x <= 234 || p.x >= 426 || p.y <= 64 || p.y >= 168))).toBe(true);
    expect(result.every(cell => cell.router?.name === "manhattan")).toBe(true);
    expect(clearWaypoints([{ x: 80, y: 70 }], [{ x: 40, y: 40, width: 80, height: 60 }])).toEqual([{ x: 80, y: 23 }]);
  });
  it("keeps invocation notation and arrow markers while routing self loops orthogonally", () => {
    for (const symbolId of ["symbol.invocation", "symbol.self-invocation"]) {
      const original = spec({ symbolId, cells: [{ ...edge(spec()), target: symbolId.includes("self") ? "a" : "b", vertices: [{ x: 50, y: 30 }], router: { name: "loop", args: {} } }] });
      const routed = edge(routeRelations([original], [relation()], [node("a", 0, 0), node("b", 400, 0)])[0]!);
      expect(routed.router?.name).toBe("manhattan"); expect(routed.connector?.name).toBe("normal");
      expect(routed.line).toEqual(edge(original).line);
      expect(routed.labels).toContainEqual(expect.objectContaining({ text: "ϟ" }));
      if (symbolId.includes("self")) expect(routed.vertices).toHaveLength(3);
    }
  });
  it("translates manual bends only when both endpoints move together", () => {
    const routes: EdgeRoute[] = [{ segment: "main", style: "ROUNDED", mode: "MANUAL", points: [{ x: 50, y: 20 }] }];
    expect(moveManualRoutes(routes, { x: 10, y: 20 }, { x: 10, y: 20 })?.[0]?.points).toEqual([{ x: 60, y: 40 }]);
    expect(moveManualRoutes(routes, { x: 10, y: 20 }, { x: 0, y: 0 })).toBe(routes);
  });
  it("fits all content corners inside a parent ellipse and never moves children on load", () => {
    const nodes = [node("parent", 80, 80, { kind: "process", width: 675, height: 1730 }), node("a", 84, 210), node("b", 351, 1600)];
    const fitted = fitRefinementEnvelope(nodes, "parent"), parent = fitted[0]!;
    expect(fitted.slice(1)).toEqual(nodes.slice(1)); expect(fitRefinementEnvelope(nodes)).toEqual(nodes);
    for (const child of fitted.slice(1)) for (const x of [child.x, child.x + child.width!]) for (const y of [child.y, child.y + child.height!]) {
      expect(((x - parent.x - parent.width! / 2) / (parent.width! / 2)) ** 2 + ((y - parent.y - parent.height! / 2) / (parent.height! / 2)) ** 2).toBeLessThan(1);
    }
    const arranged = autoLayout(nodes, [relation()], "down", "parent");
    expect(arranged.reason).toBe("");
    const applied = nodes.map(value => ({ ...value, ...arranged.layouts.find(item => item.occurrence_id === value.occurrenceId)?.layout }));
    expect(autoLayout(applied, [relation()], "down", "parent").layouts).toEqual([]);
  });
});
