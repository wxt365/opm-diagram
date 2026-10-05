import { describe, expect, it } from "vitest";

import { createX6RelationGestureAdapter, type RelationGestureIntent } from "./x6-relation-gesture-adapter";

describe("x6 relation gesture adapter", () => {
  it("只发送四类关系意图且不推断角色或方向", () => {
    const intents: RelationGestureIntent[] = [];
    const adapter = createX6RelationGestureAdapter((intent) => intents.push(intent));
    adapter.start("occ.source", { x: 10, y: 20 });
    adapter.move({ x: 30, y: 40 });
    adapter.selectEndpoint("occ.target", { x: 50, y: 60 }, { continueCollection: true, openParameters: true });
    adapter.cancel("ESCAPE");

    expect(intents.map((intent) => intent.type)).toEqual([
      "relation-drag-start", "relation-drag-move", "relation-endpoint-selected", "relation-cancelled",
    ]);
    expect(intents[2]).toMatchObject({ continue_collection: true, open_parameters: true });
    expect(JSON.stringify(intents)).not.toMatch(/role|direction|capability|fact_id|command/i);
  });
});
