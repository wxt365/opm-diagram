export type RelationGesturePhase =
  | "idle"
  | "relation-armed"
  | "dragging"
  | "endpoint-selected"
  | "candidate-filtering"
  | "candidate-preview"
  | "confirmed"
  | "cancelled";

export type RelationGestureTransition =
  | "ARM"
  | "DRAG_START"
  | "DRAG_MOVE"
  | "ENDPOINT_SELECTED"
  | "FILTER_CANDIDATES"
  | "SHOW_PREVIEW"
  | "CONTINUE_ENDPOINTS"
  | "CONFIRM"
  | "CANCEL"
  | "RESET";

export class RelationGestureTransitionError extends Error {
  readonly code = "OPD_RELATION_GESTURE_TRANSITION_INVALID";
}

const transitions: Record<RelationGesturePhase, Partial<Record<RelationGestureTransition, RelationGesturePhase>>> = {
  idle: { ARM: "relation-armed" },
  "relation-armed": { DRAG_START: "dragging", CANCEL: "cancelled" },
  dragging: { DRAG_MOVE: "dragging", ENDPOINT_SELECTED: "endpoint-selected", CANCEL: "cancelled" },
  "endpoint-selected": { CONTINUE_ENDPOINTS: "relation-armed", FILTER_CANDIDATES: "candidate-filtering", CANCEL: "cancelled" },
  "candidate-filtering": { SHOW_PREVIEW: "candidate-preview", CANCEL: "cancelled" },
  "candidate-preview": { CONTINUE_ENDPOINTS: "relation-armed", FILTER_CANDIDATES: "candidate-filtering", CONFIRM: "confirmed", CANCEL: "cancelled" },
  confirmed: { RESET: "idle" },
  cancelled: { RESET: "idle" },
};

export function transitionRelationGesture(current: RelationGesturePhase, event: RelationGestureTransition): RelationGesturePhase {
  const next = transitions[current][event];
  if (!next) throw new RelationGestureTransitionError(`关系手势不能从 ${current} 执行 ${event}`);
  return next;
}
