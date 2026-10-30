import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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
  const flipFrom = useRef<Bounds | null>(null);

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

  // Only animate between route slots, never while the page scrolls.
  useLayoutEffect(() => {
    if (eligible && bounds) flipFrom.current = bounds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experience]);

  // FLIP: jump to the new slot at once (so the canvas resizes a single time)
  // and animate only a compositor transform from the old slot. Animating
  // left/top/width/height resized the WebGL canvas on every frame and stalled.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    const node = host.current;
    if (!from || !bounds || !node) return;
    if (from.left === bounds.left && from.top === bounds.top && from.width === bounds.width && from.height === bounds.height) return;
    flipFrom.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scale = Math.min(from.width / bounds.width, from.height / bounds.height);
    const x = from.left + from.width / 2 - (bounds.left + bounds.width / 2);
    const y = from.top + from.height / 2 - (bounds.top + bounds.height / 2);
    node.animate(
      [{ transform: `translate(${x}px, ${y}px) scale(${scale})` }, { transform: "none" }],
      { duration: 720, easing: "cubic-bezier(.22,.8,.24,1)" },
    ).finished.then(() => window.dispatchEvent(new Event("house-moved")), () => {});
  }, [bounds]);

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
  return (
    <div
      ref={host}
      className="house-persistent-host landing"
      data-experience={experience}
      data-ready={ready}
      style={bounds ? {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        visibility: visible ? "visible" : "hidden",
        transformOrigin: "50% 50%",
        willChange: "transform",
      } : { visibility: "hidden" }}
    >
      {stageMounted && <Suspense fallback={null}><HouseStage experience={experience} visible={visible} onReadyChange={onReadyChange} /></Suspense>}
    </div>
  );
}
