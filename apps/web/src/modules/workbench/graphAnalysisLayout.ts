export interface GraphPosition { x: number; y: number }
export interface GraphLayoutInput {
  ids: string[]; edges: Array<{ source: string; target: string }>;
  previous: Record<string, GraphPosition>;
  relax?: boolean; fixedIds?: string[];
}

/** Damped physical simulation; no source grouping or imposed outline. */
export function layoutGraph(input: GraphLayoutInput, onFrame?: (positions: Record<string, GraphPosition>) => void): Record<string, GraphPosition> {
  const index = new Map(input.ids.map((id, i) => [id, i]));
  const positions = input.ids.map((id, i) => ({ ...(input.previous[id] ?? {
    x: Math.cos(i * 2.3999632297) * 60 * Math.sqrt(i + 1), y: Math.sin(i * 2.3999632297) * 60 * Math.sqrt(i + 1),
  }) }));
  const pinned = new Set(input.fixedIds ?? []);
  const fixed = input.ids.map(id => pinned.has(id) || !input.relax && !!input.previous[id]);
  const velocity = positions.map(() => ({ x: 0, y: 0 })), degrees = positions.map(() => 0);
  const uniqueLinks = new Map<string, [number, number]>();
  for (const edge of input.edges) {
    const a = index.get(edge.source), b = index.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    uniqueLinks.set(`${Math.min(a, b)}/${Math.max(a, b)}`, [a, b]);
  }
  const links = [...uniqueLinks.values()];
  links.forEach(([a, b]) => { degrees[a]!++; degrees[b]!++; });
  const snapshot = () => Object.fromEntries(input.ids.map((id, i) => [id, { ...positions[i]! }]));
  const center = { x: 0, y: 0 };
  for (let step = 0; step < 260; step++) {
    const alpha = Math.pow(1 - step / 280, 1.4);
    const forces = positions.map(p => ({ x: (center.x - p.x) * 0.0015, y: (center.y - p.y) * 0.0015 }));
    // Far cells act as aggregate charges; near cells are evaluated individually.
    const grid = new Map<string, { members: number[]; x: number; y: number }>();
    positions.forEach((p, i) => {
      const key = `${Math.floor(p.x / 250)},${Math.floor(p.y / 250)}`;
      const cell = grid.get(key) ?? { members: [], x: 0, y: 0 };
      cell.members.push(i); cell.x += p.x; cell.y += p.y; grid.set(key, cell);
    });
    for (const cell of grid.values()) { cell.x /= cell.members.length; cell.y /= cell.members.length; }
    positions.forEach((p, i) => {
      for (const cell of grid.values()) {
        const dx = p.x - cell.x, dy = p.y - cell.y, distance = Math.hypot(dx, dy);
        if (distance > 600) {
          const strength = 22000 * cell.members.length / Math.max(100, distance * distance);
          forces[i]!.x += dx / distance * strength; forces[i]!.y += dy / distance * strength;
        } else for (const j of cell.members) {
          if (i === j) continue;
          const other = positions[j]!, rx = p.x - other.x || (i < j ? -0.1 : 0.1), ry = p.y - other.y;
          const length = Math.max(8, Math.hypot(rx, ry)), strength = 22000 / (length * length);
          forces[i]!.x += rx / length * strength; forces[i]!.y += ry / length * strength;
          // Layout follows topology and circular nodes; label visibility is handled by the canvas.
          const clearance = 40 + Math.min(12, Math.sqrt(degrees[i]!) + Math.sqrt(degrees[j]!));
          if (length < clearance) {
            forces[i]!.x += rx / length * (clearance - length) * 0.4;
            forces[i]!.y += ry / length * (clearance - length) * 0.4;
          }
        }
      }
    });
    for (const [a, b] of links) {
      const dx = positions[b]!.x - positions[a]!.x, dy = positions[b]!.y - positions[a]!.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 100) * 0.07;
      const bias = degrees[b]! / Math.max(1, degrees[a]! + degrees[b]!);
      forces[a]!.x += dx / distance * strength * bias; forces[a]!.y += dy / distance * strength * bias;
      forces[b]!.x -= dx / distance * strength * (1 - bias); forces[b]!.y -= dy / distance * strength * (1 - bias);
    }
    let energy = 0;
    positions.forEach((p, i) => {
      if (fixed[i]) return;
      const v = velocity[i]!, f = forces[i]!;
      v.x = (v.x + f.x * alpha) * 0.72; v.y = (v.y + f.y * alpha) * 0.72;
      const speed = Math.hypot(v.x, v.y), limit = Math.min(1, 18 / Math.max(1, speed));
      p.x += v.x * limit; p.y += v.y * limit; energy += speed;
    });
    if (onFrame && step % 40 === 39) onFrame(snapshot());
    if (step > 100 && energy < 0.05) break;
  }
  return snapshot();
}
