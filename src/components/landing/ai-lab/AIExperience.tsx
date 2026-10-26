import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { Chapter } from "../Chapter";
import { supportsWebGL, useReducedMotion } from "../motion";
import { useLiteMode } from "../renderMode";
import { InvestigationPanel, NodeDetail } from "./InvestigationPanel";
import { KnowledgeMap } from "./KnowledgeMap";
import { DISCLAIMER, SCENARIOS, STAGES, type NodeId } from "./scenarios";
import { useInvestigation } from "./useInvestigation";

const IntelligenceCore = lazy(() => import("./IntelligenceCore"));

// How lively the core is at each stage: a pulse for the question, calm for
// the explanation, steady for the actions.
const STAGE_ENERGY = [0.9, 0.6, 0.8, 0.3, 0.5];

class CoreBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
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

// Light-mode / no-WebGL core: the same silhouette in CSS, still reacting to
// the stage through its brightness.
function CoreFallback({ energy }: { energy: number }) {
  return (
    <div className="absolute inset-[16%] transition-[filter] duration-700" style={{ filter: `brightness(${0.75 + energy * 0.5})` }}>
      <div className="l-orb l-orb-core h-full w-full" />
    </div>
  );
}

const useSectionVisibility = (ref: React.RefObject<HTMLElement>) => {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setVisible(true);
      return;
    }
    // Load the core a little before it scrolls in; animate only while seen.
    const nearObserver = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "600px 0px" });
    const visibleObserver = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && document.visibilityState === "visible"));
    nearObserver.observe(node);
    visibleObserver.observe(node);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [ref]);
  return { near, visible };
};

export function AIExperience() {
  const section = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const lite = useLiteMode();
  const [webgl] = useState(supportsWebGL);
  const [coreFailed, setCoreFailed] = useState(false);
  const { near, visible } = useSectionVisibility(section);
  const demo = useInvestigation({ reducedMotion, visible });
  const { scenario, stage, exploring, playing, focus } = demo;
  const lastNode = useRef<string | null>(null);
  const energy = focus ? 0.7 : STAGE_ENERGY[stage];
  const liveCore = webgl && !lite && !coreFailed && near;

  const openNode = (id: NodeId) => {
    lastNode.current = id;
    demo.setFocus(id);
  };
  const closeNode = () => {
    demo.setFocus(null);
    // Return focus to the node that opened the detail.
    requestAnimationFrame(() => (document.querySelector(`[data-node="${lastNode.current}"]`) as HTMLElement | null)?.focus());
  };

  const core = (
    <div className="relative h-full w-full">
      <div className="absolute inset-[-14%] rounded-full bg-[radial-gradient(closest-side,rgb(var(--l-accent-rgb)/0.16),transparent)]" aria-hidden="true" />
      {liveCore ? (
        <CoreBoundary onError={() => setCoreFailed(true)}>
          <Suspense fallback={<CoreFallback energy={energy} />}>
            <IntelligenceCore energy={energy} active={visible} reducedMotion={reducedMotion} onFail={() => setCoreFailed(true)} />
          </Suspense>
        </CoreBoundary>
      ) : (
        <CoreFallback energy={energy} />
      )}
      {/* Fine orbit rings: crisp SVG over the core. */}
      <svg className="pointer-events-none absolute inset-[-6%] h-[112%] w-[112%]" viewBox="0 0 100 100" aria-hidden="true">
        <g className="l-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          <ellipse cx="50" cy="50" rx="48" ry="48" fill="none" stroke="var(--l-accent)" strokeOpacity="0.18" strokeWidth="0.3" />
          <circle cx="50" cy="2" r="0.9" fill="var(--l-accent)" />
        </g>
        <g className="l-spin-slower" style={{ transformOrigin: "50px 50px" }}>
          <ellipse cx="50" cy="50" rx="48" ry="16" fill="none" stroke="var(--l-accent)" strokeOpacity="0.14" strokeWidth="0.3" transform="rotate(-18 50 50)" />
        </g>
      </svg>
    </div>
  );

  return (
    <section ref={section} id="wattstatus-ai" aria-labelledby="ai-title" className="l-ai relative scroll-mt-20 overflow-hidden py-20 md:py-24">
      <div className="l-container-wide relative grid grid-cols-[minmax(0,1fr)] gap-12 xl:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] xl:gap-14">
        {/* Editorial layer */}
        <div className="xl:pt-8">
          <Chapter index={4} label="Inteligência" />
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[rgb(var(--l-accent-rgb)/0.3)] bg-[var(--l-accent-subtle)] px-3 py-1.5 text-sm font-semibold text-[var(--l-accent)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            WattStatus AI · Energy Intelligence Lab
          </p>
          <h2 id="ai-title" className="l-h2 mt-6 max-w-[22ch] xl:max-w-none xl:!text-[clamp(2.2rem,1.1rem+1.9vw,3.3rem)]">
            Não é apenas uma resposta. É uma nova forma de <span className="l-gradient-text">entender sua energia.</span>
          </h2>
          <p className="l-lead mt-5">
            O WattStatus AI relaciona informações do seu imóvel, considera a qualidade dos dados e ajuda a investigar mudanças no consumo — transformando análises em explicações e possibilidades de economia.
          </p>

          <fieldset className="mt-7 min-w-0">
            <legend className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--l-faint)]">Escolha uma investigação</legend>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] xl:flex-col xl:overflow-visible">
              {SCENARIOS.map((item) => {
                const on = item.id === scenario.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => demo.chooseScenario(item.id)}
                    className={`min-w-[240px] shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors xl:min-w-0 ${on ? "border-[var(--l-accent)] bg-[rgb(var(--l-elevated-rgb)/0.9)]" : "border-[var(--l-line-strong)] bg-[rgb(var(--l-surface-rgb)/0.5)] hover:border-[rgb(var(--l-accent-rgb)/0.4)]"}`}
                  >
                    <span className={`block text-sm font-semibold ${on ? "text-[var(--l-accent)]" : "text-[var(--l-muted)]"}`}>{item.tab}</span>
                    <span className="mt-1 block text-[15px] leading-snug">{item.question}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Stage: map, controls and investigation as one surface. */}
        <div className="l-ai-stage relative rounded-[28px] border border-[var(--l-line)] p-4 sm:p-6 xl:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--l-faint)]">{DISCLAIMER}</p>
          </div>

          <div className="mt-4">
            <KnowledgeMap scenario={scenario} stage={stage} focus={focus} onPick={(id) => (focus === id ? closeNode() : openNode(id))} core={core} />
          </div>

          {/* Investigation controls */}
          <div className="mt-6 flex flex-col gap-3 border-t border-[var(--l-line)] pt-5 xl:flex-row xl:items-center xl:justify-between">
            <ol className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" aria-label="Etapas da investigação">
              {STAGES.map((item, index) => {
                const on = exploring && index === stage;
                const done = !exploring || index < stage;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={on ? "step" : undefined}
                      onClick={() => demo.goTo(index)}
                      className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${on ? "border-[var(--l-accent)] bg-[var(--l-accent)] text-[#052117]" : done ? "border-[rgb(var(--l-accent-rgb)/0.35)] text-[var(--l-text)]" : "border-[var(--l-line-strong)] text-[var(--l-faint)]"}`}
                    >
                      <span className="tabular-nums">{index + 1}</span>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Controles da investigação">
              {!exploring ? (
                <button type="button" onClick={demo.start} className="l-btn l-btn-primary !min-h-[44px] !px-5 !text-[15px]">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Explorar investigação
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => demo.goTo(stage - 1)} disabled={stage === 0} aria-label="Etapa anterior" className="l-ai-ctl"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
                  {demo.canPlay && (
                    <button type="button" onClick={demo.toggle} disabled={stage === demo.last} aria-label={playing ? "Pausar" : "Reproduzir"} className="l-ai-ctl">
                      {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  )}
                  <button type="button" onClick={() => demo.goTo(stage + 1)} disabled={stage === demo.last} aria-label="Próxima etapa" className="l-ai-ctl"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
                  <button type="button" onClick={demo.start} aria-label="Reiniciar" className="l-ai-ctl"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={demo.finish} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--l-line-strong)] px-4 text-[15px] font-semibold hover:border-[rgb(var(--l-accent-rgb)/0.5)]">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Ver tudo
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Announces manual steps only; silent while autoplay runs. */}
          <p className="sr-only" aria-live={playing ? "off" : "polite"}>
            {exploring ? `Etapa ${stage + 1} de ${STAGES.length}: ${STAGES[stage].label}` : ""}
          </p>

          {/* Reserved height: switching between the investigation and a node
              detail does not move the rest of the page on wide screens. */}
          <div className="mt-5 xl:min-h-[420px]">
            {focus ? (
              <NodeDetail id={focus} onClose={closeNode} />
            ) : (
              <InvestigationPanel scenario={scenario} stage={stage} exploring={exploring} onNode={openNode} onScenario={demo.chooseScenario} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
