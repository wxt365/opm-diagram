import type { NodeAppearance, OpdNode } from "./types/modeling";

export type NodeColorPalette = Partial<Record<OpdNode["kind"], NodeAppearance>>;

export function defaultNodeAppearance(kind: OpdNode["kind"]): Required<NodeAppearance> {
  return { stroke: kind === "attribute" ? "#8b5cf6" : kind === "object" ? "#f28c28"
    : kind === "process" || kind === "operation" ? "#14b8a6" : "#f0b429",
  fill: kind === "state" ? "#fff7df" : "#ffffff" };
}

export function normalizeNodeAppearance(value?: NodeAppearance): NodeAppearance | undefined {
  const result: NodeAppearance = {};
  for (const key of ["stroke", "fill"] as const) if (value?.[key] && /^#[0-9a-f]{6}$/i.test(value[key]))
    result[key] = value[key].toLowerCase();
  return Object.keys(result).length ? result : undefined;
}

export function nodeAppearance(node: Pick<OpdNode, "kind" | "appearance">, palette?: NodeColorPalette): Required<NodeAppearance> {
  return { ...defaultNodeAppearance(node.kind), ...normalizeNodeAppearance(palette?.[node.kind]), ...normalizeNodeAppearance(node.appearance) };
}

export function nodeTextColors(fill: string) {
  const rgb = [1, 3, 5].map(offset => {
    const channel = parseInt(fill.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const dark = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]! < 0.179;
  const label = dark ? "#ffffff" : "#171a1f";
  return { label, classification: fill === "#ffffff" || fill === "#fff7df" ? "#64748b" : label };
}
