export const mindmapDetailAppearance = {
  fill: '#ffffff',
  border: '#c7d5e1',
  text: '#354d62',
  badge: '#5f7284',
  size: 13,
  weight: 500,
};

export function mindmapNodeAppearance(depth: number) {
  if (depth === 0) return {
    fill: '#1a4668',
    border: '#1a4668',
    text: '#ffffff',
    badge: '#d9eaf6',
    size: 17,
    weight: 700,
  };
  if (depth === 1) return {
    fill: '#e9f3ff',
    border: '#92b5d7',
    text: '#214f74',
    badge: '#4b6881',
    size: 15,
    weight: 650,
  };
  return mindmapDetailAppearance;
}
