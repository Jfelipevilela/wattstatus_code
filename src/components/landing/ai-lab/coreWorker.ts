/// <reference lib="webworker" />
// Runs the AI core off the main thread: GL context creation, shader
// compilation and drawing all happen here, so the page never stalls.
import { createCoreRenderer, type CoreRenderer } from "./coreRenderer";

export type CoreMessage =
  | { type: "init"; canvas: OffscreenCanvas; width: number; height: number; energy: number; running: boolean }
  | { type: "resize"; width: number; height: number }
  | { type: "energy"; value: number }
  | { type: "running"; value: boolean }
  | { type: "dispose" };

let core: CoreRenderer | null = null;

self.onmessage = (event: MessageEvent<CoreMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    core = createCoreRenderer(message.canvas, {
      onLost: () => self.postMessage({ type: "failed" }),
      onReady: () => self.postMessage({ type: "ready" }),
    });
    if (!core) {
      self.postMessage({ type: "failed" });
      return;
    }
    core.resize(message.width, message.height);
    core.setEnergy(message.energy);
    core.setRunning(message.running);
    return;
  }
  if (!core) return;
  if (message.type === "resize") core.resize(message.width, message.height);
  else if (message.type === "energy") core.setEnergy(message.value);
  else if (message.type === "running") core.setRunning(message.value);
  else if (message.type === "dispose") {
    core.dispose();
    core = null;
    self.close();
  }
};
