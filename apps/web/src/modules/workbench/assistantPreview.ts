import type { AssistantProposal } from "@/shared/api/assistantApi";
import type { OpdNode, ConsumptionRelation } from "@/shared/types/modeling";
import { nodeDimensions, constrainStatePosition } from "./opd/core/node-geometry";
import { toNode, toConsumption } from "@/stores/workbench/projectionMapping";

/** 只构造展示数据；预览不改变 store 中的真实图元。 */
export function previewAssistant(proposal: AssistantProposal | null, nodes: OpdNode[], relations: ConsumptionRelation[]) {
  if (!proposal) return { nodes, relations };
  if (proposal.command.command_type === 'APPLY_MODEL_PLAN' && proposal.previewData) {
    const constructs = proposal.previewData.constructs.map(x => ({ ...x, modifiers: x.modifiers?.map(modifier => ({ modifier_id: modifier.modifier_id, value: String(modifier.value ?? '') })), endpoints: x.endpoints?.map(endpoint => {
      if (endpoint.target_kind !== 'ELEMENT' && endpoint.target_kind !== 'STATE' && endpoint.target_kind !== 'FEATURE') throw new Error('方案包含画布暂不支持的关系端点。');
      return { ...endpoint, target_kind: endpoint.target_kind };
    }) }));
    const nextNodes = constructs.filter(x => x.target_kind !== 'FACT').map(toNode);
    return { nodes: nextNodes, relations: constructs.filter(x => x.target_kind === 'FACT').flatMap(x => toConsumption(x, nextNodes)) };
  }
  const command = proposal.command, nextNodes = nodes.map(x => ({ ...x })), nextRelations = [...relations];
  switch (command.command_type) {
    case "CREATE_ELEMENT": {
      const p = command.payload;
      nextNodes.push({ id: `preview.${proposal.id}`, occurrenceId: `preview.${proposal.id}`, label: p.name,
        kind: p.kind === "OBJECT" ? "object" : "process", x: p.layout.x, y: p.layout.y,
        width: p.layout.width ?? 160, height: p.layout.height ?? 72, valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" }); break;
    }
    case "CREATE_STATE": {
      const p = command.payload;
      const owner = nextNodes.find(x => x.id === p.owner_ref.target_id);
      const size = { width: p.layout.width ?? 88, height: p.layout.height ?? 28 };
      const position = { x: Math.max((owner?.x ?? p.layout.x) + 8, p.layout.x), y: Math.max((owner?.y ?? p.layout.y) + 28, p.layout.y) };
      if (owner) {
        const bounds = nodeDimensions(owner);
        owner.width = Math.max(bounds.width, position.x - owner.x + size.width + 8);
        owner.height = Math.max(bounds.height, position.y - owner.y + size.height + 8);
      }
      nextNodes.push({ id: `preview.${proposal.id}`, occurrenceId: `preview.${proposal.id}`, label: p.name_or_value,
        kind: "state", ownerId: p.owner_ref.target_id, ...position, ...size,
        stateRoles: p.state_roles, explicitness: "EXPLICIT", valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" }); break;
    }
    case "UPDATE_PROPERTY": {
      const node = nextNodes.find(x => x.id === command.payload.target_ref.target_id); if (node) node.label = command.payload.value; break;
    }
    case "UPDATE_STATE": {
      const node = nextNodes.find(x => x.id === command.payload.state_id);
      if (node) { node.label = command.payload.changes.name_or_value ?? node.label; node.stateRoles = command.payload.changes.state_roles ?? node.stateRoles; } break;
    }
    case "UPDATE_LAYOUT": {
      const node = nextNodes.find(x => x.occurrenceId === command.payload.occurrence_id);
      if (node) {
        const dx = command.payload.layout.x - node.x, dy = command.payload.layout.y - node.y;
        Object.assign(node, constrainStatePosition(node, nextNodes, command.payload.layout));
        if (node.kind !== "state") nextNodes.filter(x => x.kind === "state" && x.ownerId === node.id && x.occurrenceRole === "owned").forEach(x => { x.x += dx; x.y += dy; });
        else {
          const owner = nextNodes.find(x => x.id === node.ownerId);
          if (owner) {
            const children = nextNodes.filter(x => x.kind === "state" && x.ownerId === owner.id && x.occurrenceRole === "owned");
            owner.width = Math.max(160, ...children.map(x => x.x + nodeDimensions(x).width + 8 - owner.x));
            owner.height = Math.max(72, ...children.map(x => x.y + nodeDimensions(x).height + 8 - owner.y));
          }
        }
      }
      break;
    }
    case "CREATE_FACT": {
      const p = command.payload, endpoints = p.normalized_endpoints;
      if (endpoints[0] && endpoints[1] && endpoints.every(x => ["ELEMENT", "STATE", "FEATURE"].includes(x.target_ref.target_kind))) nextRelations.push({
        id: `preview.${proposal.id}`, occurrenceId: `preview.${proposal.id}`, sourceId: endpoints[0].target_ref.target_id,
        targetId: endpoints[1].target_ref.target_id, capabilityId: p.capability_ref.capability_id, direction: p.direction,
        sourceOccurrenceId: nodes.find(x => x.id === endpoints[0]!.target_ref.target_id)?.occurrenceId ?? endpoints[0].target_ref.target_id,
        targetOccurrenceId: nodes.find(x => x.id === endpoints[1]!.target_ref.target_id)?.occurrenceId ?? endpoints[1].target_ref.target_id,
        symbolRef: proposal.symbolRef ?? "symbol.link.procedural", layoutRef: `preview.${proposal.id}`,
        duration: String(p.modifiers.find(x => x.modifier_id === "duration")?.value ?? "") || undefined,
        endpoints: endpoints.map(x => ({ role: x.role, targetId: x.target_ref.target_id, targetKind: x.target_ref.target_kind as "ELEMENT" | "STATE" | "FEATURE", ordinal: x.ordinal })),
        labels: p.labels.map(x => ({ slotId: x.slot_id, text: x.text })), collectionCompleteness: p.collection_completeness,
      }); break;
    }
  }
  return { nodes: nextNodes, relations: nextRelations };
}
