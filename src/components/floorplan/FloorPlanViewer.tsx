import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Box, Flame, Home, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloorPlan2D, type FloorPlanProps } from "./FloorPlan2D";
import { heatColor, supportsWebGL, type HeatMetric } from "./heat";

const FloorPlan3D = lazy(() => import("./FloorPlan3D"));

const VIEW_KEY = "wattstatus:floorplan-view";

// Any failure inside the 3D scene falls back to the 2D plan.
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props extends Omit<FloorPlanProps, "heat"> {
  heat: HeatMetric | null;
  onHeatChange: (metric: HeatMetric | null) => void;
  toolbar?: ReactNode;
}

export function FloorPlanViewer({ heat, onHeatChange, toolbar, editing, ...plan }: Props) {
  const [webgl] = useState(supportsWebGL);
  const [view, setView] = useState<"2d" | "3d">(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as "2d" | "3d") || "3d";
    } catch {
      return "3d";
    }
  });
  const [failed, setFailed] = useState(false);
  const use3D = view === "3d" && webgl && !failed && !editing;

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Preference only.
    }
  }, [view]);

  const segment = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div role="group" aria-label="Modo de visualização" className="flex rounded-full border bg-card p-1 shadow-sm">
          <button type="button" aria-pressed={!use3D} className={segment(!use3D)} onClick={() => setView("2d")}>
            <Square className="h-3.5 w-3.5" /> 2D
          </button>
          <button
            type="button"
            aria-pressed={use3D}
            disabled={!webgl || failed || editing}
            title={!webgl || failed ? "3D indisponível neste dispositivo" : editing ? "Edite a planta em 2D" : undefined}
            className={cn(segment(use3D), "disabled:opacity-40")}
            onClick={() => setView("3d")}
          >
            <Box className="h-3.5 w-3.5" /> 3D
          </button>
        </div>
        <div role="group" aria-label="Modo da planta" className="flex rounded-full border bg-card p-1 shadow-sm">
          <button type="button" aria-pressed={heat === null} className={segment(heat === null)} onClick={() => onHeatChange(null)}>
            <Home className="h-3.5 w-3.5" /> Casa
          </button>
          <button type="button" aria-pressed={heat === "estimated"} className={segment(heat === "estimated")} onClick={() => onHeatChange("estimated")}>
            <Flame className="h-3.5 w-3.5" /> <span className="sm:hidden">Estimada</span>
            <span className="hidden sm:inline">Energia estimada</span>
          </button>
          <button type="button" aria-pressed={heat === "measured"} className={segment(heat === "measured")} onClick={() => onHeatChange("measured")}>
            <Flame className="h-3.5 w-3.5" /> <span className="sm:hidden">Medida</span>
            <span className="hidden sm:inline">Energia medida</span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      {(!webgl || failed) && view === "3d" && (
        <p role="status" className="mx-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          {failed ? "O 3D parou de responder neste dispositivo." : "Seu navegador não oferece WebGL."} Mostrando a planta 2D, com as
          mesmas informações.
        </p>
      )}

      <div className="relative min-h-[360px] flex-1">
        {use3D ? (
          <SceneBoundary onError={() => setFailed(true)}>
            <Suspense
              fallback={
                <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Montando sua casa em 3D…
                </div>
              }
            >
              <FloorPlan3D {...plan} heat={heat} onContextLost={() => setFailed(true)} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="absolute inset-0 p-3">
            <FloorPlan2D {...plan} heat={heat} editing={editing} />
          </div>
        )}
      </div>

      {heat && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-xs text-muted-foreground" aria-label="Legenda do mapa de consumo">
          <span className="font-medium text-foreground">
            Mapa de consumo · {heat === "estimated" ? "estimativa do mês (cadastro atual)" : "medido no período (SmartThings)"}
          </span>
          <span className="flex items-center gap-1.5">
            Menor
            <span
              aria-hidden="true"
              className="h-2.5 w-24 rounded-full"
              style={{ background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }}
            />
            Maior
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-4 rounded bg-[repeating-linear-gradient(45deg,#d4d4d8_0_3px,transparent_3px_6px)]" />
            {heat === "measured" ? "sem medição (não é consumo zero)" : "sem aparelhos"}
          </span>
          {heat === "measured" && (
            <span>"parcial": só parte dos aparelhos do cômodo tem medidor. Cômodos só se comparam quando ambos têm medição.</span>
          )}
        </div>
      )}
    </div>
  );
}
