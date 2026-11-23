import { layoutGraph, type GraphLayoutInput } from "./graphAnalysisLayout";
self.onmessage = (event: MessageEvent<GraphLayoutInput>) => {
  const result = layoutGraph(event.data, event.data.relax ? positions => self.postMessage({ positions, done: false }) : undefined);
  self.postMessage({ positions: result, done: true });
};
