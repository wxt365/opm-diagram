export const layoutActions = ['left', 'center-x', 'right', 'top', 'center-y', 'bottom', 'distribute-x', 'distribute-y'] as const;
export type LayoutAction = typeof layoutActions[number];
export interface ArrangementState { canAlign: boolean; canDistribute: boolean; reason: string; referenceLabel: string; count: number }
