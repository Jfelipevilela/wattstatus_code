import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { houseTransition } from "./houseTransition";
import "./persistent-house.css";

const HouseStage = lazy(() => import("./HeroSection").then((module) => ({ default: module.HouseStage })));

type Experience = "landing" | "login" | "signup";
type Bounds = { left: number; top: number; width: number; height: number };

export function PersistentHouseHost() {
  const { pathname } = useLocation();
  const experience: Experience | null = pathname === "/" ? "landing" : pathname === "/login" ? "login" : pathname === "/signup" ? "signup" : null;
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1101px)").matches);
  const eligible = !!experience && (experience === "landing" || desktop);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [stageMounted, setStageMounted] = useState(() => experience === "landing");
  const target = useRef<HTMLElement | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const transition = useRef(0);
  const [frozen, setFrozen] = useState<Bounds | null>(null);
  boundsRef.current = bounds;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1101px)");
    const sync = () => setDesktop(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (experience) window.scrollTo(0, 0);
  }, [experience]);

  useEffect(() => {
    if (experience === "landing") setStageMounted(true);
  }, [experience]);

  useEffect(() => {
    if (!eligible || stageMounted) return;
    let cancelIdle = () => {};
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if ("requestIdleCallback" in window) {
          const idle = window.requestIdleCallback(() => setStageMounted(true), { timeout: 900 });
          cancelIdle = () => window.cancelIdleCallback(idle);
        } else {
          const timeout = window.setTimeout(() => setStageMounted(true), 250);
          cancelIdle = () => window.clearTimeout(timeout);
        }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelIdle(); };
  }, [eligible, stageMounted]);

  // Route change: fade the house out where it is, let the new page lay out
  // while it is hidden, snap the scene to the new framing, then fade it in
  // with a short drift from the old slot. Only opacity/transform animate, so
  // the WebGL canvas resizes once and the compositor runs the motion.
  useLayoutEffect(() => {
    const node = host.current;
    const from = boundsRef.current;
    if (!eligible || !node || !from) return;
    const token = ++transition.current;
    const alive = () => token === transition.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.getAnimations().forEach((animation) => animation.cancel());
    houseTransition.snapping = true;
    setFrozen(from);
    const out = node.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.985)" }], { duration: 180, easing: "ease-in", fill: "forwards" });
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const settled = async () => {
      // Wait for the new slot and for its rect to hold still for a few frames.
      const deadline = performance.now() + 1500;
      let previous = "";
      let stable = 0;
      while (alive() && performance.now() < deadline && stable < 3) {
        await frame();
        const rect = target.current?.getBoundingClientRect();
        const key = rect ? `${rect.left}|${rect.top}|${rect.width}|${rect.height}` : "";
        stable = key && key === previous ? stable + 1 : 0;
        previous = key;
      }
    };
    void Promise.all([out.finished.catch(() => {}), settled()]).then(async () => {
      if (!alive()) return;
      setFrozen(null);
      // Keep snapping until the canvas has its new size, then two more frames
      // so the scene is rendered at the final framing before it shows.
      const sizeDeadline = performance.now() + 600;
      while (alive() && performance.now() < sizeDeadline) {
        await frame();
        const canvas = node.querySelector("canvas");
        if (!canvas || (Math.abs(canvas.clientWidth - node.clientWidth) < 1 && Math.abs(canvas.clientHeight - node.clientHeight) < 1)) break;
      }
      await frame();
      await frame();
      await frame();
      if (!alive()) return;
      houseTransition.snapping = false;
      const to = boundsRef.current ?? from;
      const dx = Math.max(-48, Math.min(48, (from.left + from.width / 2 - (to.left + to.width / 2)) * 0.06));
      const dy = Math.max(-24, Math.min(24, (from.top + from.height / 2 - (to.top + to.height / 2)) * 0.06));
      out.cancel();
      node.animate(
        [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.97)` }, { opacity: 1, transform: "none" }],
        { duration: 560, easing: "cubic-bezier(.16,1,.3,1)" },
      ).finished.then(() => { if (alive()) window.dispatchEvent(new Event("house-moved")); }, () => {});
    });
    return () => {
      houseTransition.snapping = false;
    };
    // Only route changes trigger the transition, never scroll or resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experience]);

  useLayoutEffect(() => {
    if (!eligible || !experience) return;
    let frame = 0;
    let resize: ResizeObserver | null = null;
    const sync = () => {
      frame = 0;
      const node = target.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setBounds((previous) => previous && previous.left === rect.left && previous.top === rect.top && previous.width === rect.width && previous.height === rect.height
        ? previous : { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      setVisible(rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    // Lazy route chunks, fonts and entrance animations move the slot without resizing it,
    // which ResizeObserver never reports. Track the slot every frame until layout settles.
    let settleFrame = 0;
    const settle = () => {
      cancelAnimationFrame(settleFrame);
      const until = performance.now() + 1200;
      const tick = () => {
        sync();
        if (performance.now() < until) settleFrame = requestAnimationFrame(tick);
      };
      settleFrame = requestAnimationFrame(tick);
    };
    const bind = () => {
      const node = document.querySelector<HTMLElement>(`[data-house-slot="${experience}"]`);
      if (!node || node === target.current) return false;
      target.current = node;
      node.dataset.houseReady = ready ? "true" : "false";
      node.dataset.houseContinuous = ready ? "true" : "false";
      resize = new ResizeObserver(schedule);
      resize.observe(node);
      settle();
      return true;
    };
    const mutation = new MutationObserver(() => { if (bind()) mutation.disconnect(); });
    if (!bind()) mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      mutation.disconnect();
      resize?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      target.current = null;
    };
    // Ready is synchronized separately so it never restarts the observers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, experience]);

  useEffect(() => {
    if (target.current) target.current.dataset.houseReady = ready ? "true" : "false";
  }, [ready, experience]);

  const onReadyChange = useCallback((value: boolean) => setReady(value), []);

  if (!eligible || !experience) return null;
  // While fading out, stay in the old slot even if the new page already laid out.
  const shown = frozen ?? bounds;
  return (
    <div
      ref={host}
      className="house-persistent-host landing"
      data-experience={experience}
      data-ready={ready}
      style={shown ? {
        left: shown.left,
        top: shown.top,
        width: shown.width,
        height: shown.height,
        visibility: visible ? "visible" : "hidden",
        transformOrigin: "50% 50%",
        willChange: "transform, opacity",
      } : { visibility: "hidden" }}
    >
      {stageMounted && <Suspense fallback={null}><HouseStage experience={experience} visible={visible} onReadyChange={onReadyChange} /></Suspense>}
    </div>
  );
}
