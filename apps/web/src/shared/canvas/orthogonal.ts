export function simplifyOrthogonalPoints(points: readonly { x: number; y: number }[]) {
  const result: { x: number; y: number }[] = [];
  for (const point of points) {
    if (result.at(-1)?.x === point.x && result.at(-1)?.y === point.y) continue;
    const a = result.at(-2), b = result.at(-1);
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) result.pop();
    result.push(point);
  }
  return result;
}
