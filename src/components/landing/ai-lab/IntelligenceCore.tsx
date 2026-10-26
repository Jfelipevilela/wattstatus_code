import { useEffect, useRef } from "react";
import { createCoreRenderer, type CoreRenderer } from "./coreRenderer";
import type { CoreMessage } from "./coreWorker";

/**
 * The WattStatus AI core canvas. Measured on an Intel Iris Xe (ANGLE/D3D11):
 * creating a second WebGL context took ~420 ms on the main thread. When the
 * browser supports OffscreenCanvas, the whole core runs in a Worker and the
 * page never waits for it; otherwise it falls back to the main thread.
 *
 * Plain WebGL 2, three small programs, a canvas of a few hundred pixels,
 * 30 fps at most and only while the section is on screen. Under reduced
 * motion it draws one still frame per state change.
 */
export interface IntelligenceCoreProps {
  energy: number;
  active: boolean;
  reducedMotion: boolean;
  onFail: () => void;
}

const canUseWorker = () =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  "transferControlToOffscreen" in HTMLCanvasElement.prototype;

export default function IntelligenceCore({ energy, active, reducedMotion, onFail }: IntelligenceCoreProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const send = useRef<(message: CoreMessage) => void>(() => undefined);
  const props = useRef({ energy, running: active && !reducedMotion });
  props.current = { energy, running: active && !reducedMotion };
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    // A canvas can hand its control to a worker only once, so each mount
    // creates its own element (React may mount effects twice in development).
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = () => ({ width: canvas.clientWidth * dpr, height: canvas.clientHeight * dpr });
    let cleanup: () => void;
    performance.mark?.("ai-core-init");

    if (canUseWorker()) {
      const worker = new Worker(new URL("./coreWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ type: string }>) => {
        if (event.data.type === "failed") failRef.current();
        if (event.data.type === "ready") performance.mark?.("ai-core-first-frame");
      };
      worker.onerror = () => failRef.current();
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: "init", canvas: offscreen, ...size(), energy: props.current.energy, running: props.current.running } satisfies CoreMessage, [offscreen]);
      send.current = (message) => worker.postMessage(message);
      cleanup = () => {
        worker.postMessage({ type: "dispose" } satisfies CoreMessage);
        // Give the worker a moment to free its GL objects, then stop it.
        setTimeout(() => worker.terminate(), 500);
      };
    } else {
      const core: CoreRenderer | null = createCoreRenderer(canvas, {
        onLost: () => failRef.current(),
        onReady: () => performance.mark?.("ai-core-first-frame"),
      });
      if (!core) {
        canvas.remove();
        failRef.current();
        return;
      }
      const { width, height } = size();
      core.resize(width, height);
      core.setEnergy(props.current.energy);
      core.setRunning(props.current.running);
      send.current = (message) => {
        if (message.type === "resize") core.resize(message.width, message.height);
        else if (message.type === "energy") core.setEnergy(message.value);
        else if (message.type === "running") core.setRunning(message.value);
      };
      cleanup = () => core.dispose();
    }

    const observer = new ResizeObserver(() => send.current({ type: "resize", ...size() }));
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      send.current = () => undefined;
      cleanup();
      canvas.remove();
    };
  }, []);

  useEffect(() => send.current({ type: "energy", value: energy }), [energy]);
  useEffect(() => send.current({ type: "running", value: active && !reducedMotion }), [active, reducedMotion]);

  return <div ref={hostRef} className="h-full w-full" aria-hidden="true" />;
}
