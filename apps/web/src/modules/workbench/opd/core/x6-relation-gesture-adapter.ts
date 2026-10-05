export type RelationGestureCancelReason = "EMPTY_RELEASE" | "INVALID_CELL" | "ESCAPE" | "TOOL_CHANGED" | "CONTEXT_CHANGED";

export type RelationGestureIntent =
  | { type: "relation-drag-start"; source_occurrence_id: string; pointer: { x: number; y: number } }
  | { type: "relation-drag-move"; source_occurrence_id: string; pointer: { x: number; y: number } }
  | { type: "relation-endpoint-selected"; source_occurrence_id: string; target_occurrence_id: string; pointer: { x: number; y: number }; continue_collection: boolean; open_parameters: boolean }
  | { type: "relation-cancelled"; reason: RelationGestureCancelReason };

export interface X6RelationGestureAdapter {
  start(sourceOccurrenceId: string, pointer: { x: number; y: number }): void;
  move(pointer: { x: number; y: number }): void;
  selectEndpoint(targetOccurrenceId: string, pointer: { x: number; y: number }, options?: { continueCollection?: boolean; openParameters?: boolean }): void;
  cancel(reason: RelationGestureCancelReason): void;
  activeSourceOccurrenceId(): string | undefined;
}

export function createX6RelationGestureAdapter(emit: (intent: RelationGestureIntent) => void): X6RelationGestureAdapter {
  let sourceOccurrenceId: string | undefined;
  return {
    start(nextSourceOccurrenceId, pointer) {
      sourceOccurrenceId = nextSourceOccurrenceId;
      emit({ type: "relation-drag-start", source_occurrence_id: nextSourceOccurrenceId, pointer });
    },
    move(pointer) {
      if (!sourceOccurrenceId) return;
      emit({ type: "relation-drag-move", source_occurrence_id: sourceOccurrenceId, pointer });
    },
    selectEndpoint(targetOccurrenceId, pointer, options = {}) {
      if (!sourceOccurrenceId) return;
      emit({
        type: "relation-endpoint-selected",
        source_occurrence_id: sourceOccurrenceId,
        target_occurrence_id: targetOccurrenceId,
        pointer,
        continue_collection: options.continueCollection === true,
        open_parameters: options.openParameters === true,
      });
      sourceOccurrenceId = undefined;
    },
    cancel(reason) {
      if (!sourceOccurrenceId && reason === "EMPTY_RELEASE") return;
      sourceOccurrenceId = undefined;
      emit({ type: "relation-cancelled", reason });
    },
    activeSourceOccurrenceId() {
      return sourceOccurrenceId;
    },
  };
}
