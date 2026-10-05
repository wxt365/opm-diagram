import { describe, expect, it } from "vitest";

import type { ApiEdtCommandCapabilityOption } from "@/shared/api/generated/apiEdtContract";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { buildControlRelationPreview, buildCreateRelationPreview } from "./relation-preview-renderer";

const nodes: OpdNode[] = [
  node("object.1", "occ.object.1", "object", 40),
  node("process.1", "occ.process.1", "process", 300),
];

describe("relation preview renderer", () => {
  it("使用最终 Capability 符号生成无 committed identity 的预览", () => {
    const preview = buildCreateRelationPreview(option("CREATE_FACT", "CAP-ISO-PROC-001", "symbol.link.consumption"), nodes);
    expect(preview.ephemeral).toBe(true);
    expect(preview.symbolDescriptor.id).toBe("symbol.link.consumption");
    expect(preview.cells).toHaveLength(1);
    expect(preview.cells.every((cell) => cell.id.startsWith(`${preview.candidateId}.cell.`))).toBe(true);
    expect(preview.cells.some((cell) => cell.kind === "edge" && cell.line.captureAnchor)).toBe(false);
    expect(JSON.stringify(preview.cells)).not.toContain("occurrence");
  });

  it("Control 只装饰基础关系的临时副本", () => {
    const base: ConsumptionRelation = {
      id: "fact.1", occurrenceId: "occ.fact.1", sourceId: "object.1", targetId: "process.1",
      sourceOccurrenceId: "occ.object.1", targetOccurrenceId: "occ.process.1", symbolRef: "symbol.link.consumption",
      layoutRef: "layout.fact.1", capabilityId: "CAP-ISO-PROC-001",
    };
    const control = option("UPDATE_FACT", "CAP-ISO-CTRL-001", "symbol.control.event.transforming");
    control.base_fact_capability_ref = { capability_id: "CAP-ISO-PROC-001" };
    const preview = buildControlRelationPreview(base, control, nodes);
    expect(preview.cells).toHaveLength(1);
    expect(preview.cells[0]?.kind === "edge" ? preview.cells[0].labels.map((label) => label.text) : []).toContain("e");
    expect(JSON.stringify(preview.cells)).not.toContain("fact.1");
  });
});

function node(id: string, occurrenceId: string, kind: "object" | "process", x: number): OpdNode {
  return { id, occurrenceId, label: id, kind, x, y: 40, valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
}

function option(commandType: "CREATE_FACT" | "UPDATE_FACT", capabilityId: string, symbolId: string): ApiEdtCommandCapabilityOption {
  return {
    capability_query_id: "query.1", option_id: `option.${capabilityId}`, command_type: commandType,
    capability_ref: { capability_id: capabilityId }, display_name: capabilityId, group_path: [],
    normalized_endpoints: [
      { role: "CONSUMED_OBJECT", target_ref: { target_kind: "ELEMENT", target_id: "object.1" }, ordinal: 0 },
      { role: "CONSUMING_PROCESS", target_ref: { target_kind: "ELEMENT", target_id: "process.1" }, ordinal: 1 },
    ],
    required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: symbolId, version: "0.1.0", digest: "0".repeat(64) },
    template_family: { id: "opl.test", version: "0.1.0", digest: "1".repeat(64) }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1",
  };
}
