import { describe, expect, it } from "vitest";

import { RelationGestureTransitionError, transitionRelationGesture } from "./relation-gesture-state";

describe("relation gesture state", () => {
  it("按冻结顺序完成基础关系手势", () => {
    let phase = transitionRelationGesture("idle", "ARM");
    phase = transitionRelationGesture(phase, "DRAG_START");
    phase = transitionRelationGesture(phase, "DRAG_MOVE");
    phase = transitionRelationGesture(phase, "ENDPOINT_SELECTED");
    phase = transitionRelationGesture(phase, "FILTER_CANDIDATES");
    phase = transitionRelationGesture(phase, "SHOW_PREVIEW");
    phase = transitionRelationGesture(phase, "CONFIRM");
    expect(transitionRelationGesture(phase, "RESET")).toBe("idle");
  });

  it("拒绝从 armed 绕过端点和候选直接确认", () => {
    expect(() => transitionRelationGesture("relation-armed", "CONFIRM")).toThrow(RelationGestureTransitionError);
  });

  it("端点不足时回到 armed 并继续收集多端点", () => {
    expect(transitionRelationGesture("endpoint-selected", "CONTINUE_ENDPOINTS")).toBe("relation-armed");
  });
});
