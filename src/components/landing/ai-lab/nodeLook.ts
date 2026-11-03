import { Box, GitCompare, History, Layers, Plug, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { NodeId, Scenario } from "./scenarios";

export const NODE_ICONS: Record<NodeId, LucideIcon> = {
  history: History,
  appliances: Plug,
  rooms: Box,
  quality: Layers,
  comparisons: GitCompare,
  simulations: SlidersHorizontal,
};

export type NodeLook = "idle" | "active" | "strong" | "dim";

// What each stage highlights: context lights the nodes involved, evidence
// singles out the sources the answer depends on.
export const nodeLook = (id: NodeId, scenario: Scenario, stage: number, focus: NodeId | null): NodeLook => {
  if (focus) return id === focus ? "strong" : "dim";
  const inContext = scenario.contextNodes.includes(id);
  const isEvidence = scenario.evidence.some((item) => item.node === id);
  if (stage === 0) return "idle";
  if (stage === 2) return isEvidence ? "strong" : inContext ? "active" : "dim";
  if (stage === 3) return isEvidence ? "active" : "dim";
  return inContext ? "active" : stage === 1 ? "dim" : "idle";
};
