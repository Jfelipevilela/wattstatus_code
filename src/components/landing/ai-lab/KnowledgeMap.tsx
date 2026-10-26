import { useState, type ReactNode } from "react";
import { NODES, type NodeId, type Scenario } from "./scenarios";
import { NODE_ICONS, nodeLook, type NodeLook } from "./nodeLook";

// Orbit positions (percent of the map) on wide screens.
const POSITION: Record<NodeId, [number, number]> = {
  history: [15, 20],
  appliances: [50, 7],
  rooms: [85, 20],
  quality: [85, 80],
  comparisons: [50, 93],
  simulations: [15, 80],
};

const LOOK_CLASS: Record<NodeLook, string> = {
  idle: "border-[var(--l-line-strong)] bg-[rgb(var(--l-surface-rgb)/0.75)]",
  active: "border-[rgb(var(--l-accent-rgb)/0.45)] bg-[rgb(var(--l-elevated-rgb)/0.9)]",
  strong: "border-[var(--l-accent)] bg-[rgb(var(--l-elevated-rgb))] shadow-[0_0_0_4px_rgb(var(--l-accent-rgb)/0.12),0_18px_40px_-18px_rgb(0_0_0/0.8)]",
  dim: "border-[var(--l-line)] bg-[rgb(var(--l-surface-rgb)/0.55)] opacity-[0.55]",
};

interface Props {
  scenario: Scenario;
  stage: number;
  focus: NodeId | null;
  onPick: (id: NodeId) => void;
  core: ReactNode;
}

export function KnowledgeMap({ scenario, stage, focus, onPick, core }: Props) {
  // Hover previews a node like a selection, without opening its panel.
  const [hover, setHover] = useState<NodeId | null>(null);
  const shown = hover ?? focus;

  return (
    <div className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:block lg:h-[470px] xl:h-[480px]">
      {/* Core: on top of the grid on phones, centred in the orbit on wide screens. */}
      <div className="col-span-2 mx-auto aspect-square w-[170px] sm:col-span-3 sm:w-[210px] lg:absolute lg:left-1/2 lg:top-1/2 lg:w-[250px] lg:-translate-x-1/2 lg:-translate-y-1/2 xl:w-[270px]">
        {core}
      </div>

      {/* Connections from the core to each node. */}
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {NODES.map((node) => {
          const look = nodeLook(node.id, scenario, stage, shown);
          const [x, y] = POSITION[node.id];
          const lit = look === "active" || look === "strong";
          return (
            <line
              key={node.id}
              // Start at the core's edge, not its centre.
              x1={50 + (x - 50) * 0.36}
              y1={50 + (y - 50) * 0.36}
              x2={x}
              y2={y}
              vectorEffect="non-scaling-stroke"
              className={lit ? "l-flow" : undefined}
              stroke={lit ? "var(--l-accent)" : "var(--l-line-strong)"}
              strokeOpacity={look === "strong" ? 0.95 : lit ? 0.6 : look === "dim" ? 0.25 : 0.45}
              strokeWidth={look === "strong" ? 1.6 : 1}
              style={{ transition: "stroke-opacity .5s ease, stroke .5s ease" }}
            />
          );
        })}
      </svg>

      {NODES.map((node) => {
        const Icon = NODE_ICONS[node.id];
        const look = nodeLook(node.id, scenario, stage, shown);
        const [x, y] = POSITION[node.id];
        return (
          <button
            key={node.id}
            type="button"
            data-node={node.id}
            aria-pressed={focus === node.id}
            aria-describedby={`node-${node.id}-short`}
            onClick={() => onPick(node.id)}
            onMouseEnter={() => setHover(node.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(node.id)}
            onBlur={() => setHover(null)}
            style={{ ["--x" as string]: `${x}%`, ["--y" as string]: `${y}%` }}
            className={`group flex min-h-[56px] items-center gap-3 rounded-2xl border px-3 py-2 lg:min-h-[64px] lg:px-3.5 lg:py-2.5 text-left transition-[border-color,background-color,opacity,box-shadow] duration-500 lg:absolute lg:left-[var(--x)] lg:top-[var(--y)] lg:w-[200px] lg:-translate-x-1/2 lg:-translate-y-1/2 xl:w-[214px] ${LOOK_CLASS[look]}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-500 ${look === "strong" || look === "active" ? "bg-[var(--l-accent-subtle)] text-[var(--l-accent)]" : "bg-[rgb(var(--l-line-rgb)/0.08)] text-[var(--l-muted)]"}`}>
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight">{node.label}</span>
              <span id={`node-${node.id}-short`} className="mt-0.5 block text-[13px] leading-snug text-[var(--l-muted)] max-[399px]:sr-only">{node.short}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
