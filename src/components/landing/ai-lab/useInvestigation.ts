import { useCallback, useEffect, useState } from "react";
import { SCENARIOS, STAGES, type NodeId, type ScenarioId } from "./scenarios";

const STEP_MS = 3800;
const LAST = STAGES.length - 1;

/**
 * Demo state. `exploring` false means the complete view: every stage shown
 * at once, which is also the initial state, so nothing waits on animation.
 * Exploring walks the stages; autoplay is opt-in, stops at the end, pauses
 * when the section leaves the screen and never runs under reduced motion.
 */
export const useInvestigation = ({ reducedMotion, visible }: { reducedMotion: boolean; visible: boolean }) => {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("spending");
  const [exploring, setExploring] = useState(false);
  const [stage, setStage] = useState(LAST);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<NodeId | null>(null);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId)!;
  const current = exploring ? stage : LAST;

  useEffect(() => {
    if (!playing || !visible || reducedMotion) return;
    if (stage >= LAST) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStage((value) => value + 1), STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, visible, reducedMotion, stage]);

  const start = useCallback(() => {
    setFocus(null);
    setExploring(true);
    setStage(0);
    setPlaying(!reducedMotion);
  }, [reducedMotion]);

  const goTo = useCallback((index: number) => {
    setExploring(true);
    setPlaying(false);
    setStage(Math.max(0, Math.min(LAST, index)));
  }, []);

  const finish = useCallback(() => {
    setExploring(false);
    setPlaying(false);
    setStage(LAST);
  }, []);

  const chooseScenario = useCallback((id: ScenarioId) => {
    setScenarioId(id);
    setFocus(null);
  }, []);

  return {
    scenario,
    stage: current,
    exploring,
    playing,
    focus,
    setFocus,
    chooseScenario,
    start,
    goTo,
    finish,
    toggle: () => setPlaying((value) => (stage >= LAST ? false : !value)),
    canPlay: !reducedMotion,
    last: LAST,
  };
};
