import { describe, expect, it } from "vitest";

import {
  advanceMockRevision,
  createMockTextTraces,
  createMockWorkspaceProjection,
  mockModelFixtures,
} from "./designConfirmationAdapter";

describe("designConfirmationAdapter", () => {
  it("为模型提供独立的 Context、Finding 与 OPL 投影", () => {
    const projection = createMockWorkspaceProjection(mockModelFixtures[0]!);
    const processing = projection.contexts.find((context) => context.id === "processing-refinement");

    expect(projection.revision).toBe(18);
    expect(processing?.nodes.map((node) => node.label)).toEqual(["Processing Input", "Quality Check"]);
    expect(createMockTextTraces(processing!)[0]?.sentence).toBe("Quality Check consumes available Processing Input.");
    expect(projection.findings.every((finding) => finding.inputRevision === projection.revision)).toBe(true);
  });

  it("只由 Mock adapter 构造语义修订后的投影新鲜度", () => {
    expect(advanceMockRevision(18)).toEqual({
      revision: 19,
      textState: "current",
      validationState: "stale",
      validationProgress: 0,
    });
  });
});
