import { useId } from "react";

// Static isometric drawing of the demo house. Shown while the 3D scene loads
// and as the permanent view on devices without WebGL.
const iso = (x: number, z: number, y = 0): [number, number] => [300 + (x - z) * 26, 170 + (x + z) * 15 - y * 30];
const pts = (list: Array<[number, number, number?]>) => list.map(([x, z, y]) => iso(x, z, y ?? 0).join(",")).join(" ");

const ROOMS: Array<{ x: number; z: number; w: number; d: number; fill: string }> = [
  { x: 0, z: 0, w: 4, d: 3.6, fill: "#3a2d22" },
  { x: 4, z: 0, w: 2.3, d: 3.6, fill: "#7d7a72" },
  { x: 6.3, z: 0, w: 3.7, d: 3.6, fill: "#3a2d22" },
  { x: 0, z: 3.6, w: 5.6, d: 4.2, fill: "#3f3124" },
  { x: 5.6, z: 3.6, w: 4.4, d: 4.2, fill: "#8a867d" },
];

// `tight` crops the empty margin around the drawing for small placements.
// `highlight` and `onPick` turn it into the no-WebGL room explorer: the
// picked room lights up, and rooms are clickable (keyboard uses the HTML
// room buttons next to it).
export function HouseIllustration({ className, tight = false, highlight = -1, onPick }: { className?: string; tight?: boolean; highlight?: number; onPick?: (index: number) => void }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={tight ? "8 52 606 442" : "-10 10 630 500"} className={className} role="img" aria-label="Ilustração de uma casa demonstrativa vista em perspectiva isométrica">
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e6dfd2" />
          <stop offset="1" stopColor="#a99f8f" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#45e0a4" stopOpacity="0.35" />
          <stop offset="1" stopColor="#45e0a4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="300" rx="260" ry="90" fill={`url(#${id}-glow)`} />
      <polygon points={pts([[-0.9, -0.9], [10.9, -0.9], [10.9, 10.1], [-0.9, 10.1]])} fill="#0d1d17" stroke="#45e0a4" strokeOpacity="0.5" />
      <polygon points={pts([[6.05, 8.3], [9.75, 8.3], [9.75, 9.6], [6.05, 9.6]])} fill="#1e8f6a" opacity="0.8" />
      {ROOMS.map((room, index) => (
        <polygon
          key={`${room.x}-${room.z}`}
          points={pts([[room.x, room.z], [room.x + room.w, room.z], [room.x + room.w, room.z + room.d], [room.x, room.z + room.d]])}
          fill={room.fill}
          stroke={index === highlight ? "#45e0a4" : "#0d1d17"}
          strokeWidth={index === highlight ? 2.5 : 1}
          onClick={onPick ? () => onPick(index) : undefined}
          style={onPick ? { cursor: "pointer" } : undefined}
        />
      ))}
      {highlight >= 0 && (() => {
        const room = ROOMS[highlight];
        return <polygon points={pts([[room.x, room.z], [room.x + room.w, room.z], [room.x + room.w, room.z + room.d], [room.x, room.z + room.d]])} fill="#45e0a4" fillOpacity="0.22" pointerEvents="none" />;
      })()}
      {/* Back and left walls */}
      <polygon points={pts([[0, 0, 0], [10, 0, 0], [10, 0, 2.6], [0, 0, 2.6]])} fill={`url(#${id}-wall)`} opacity="0.92" />
      <polygon points={pts([[0, 0, 0], [0, 7.8, 0], [0, 7.8, 2.6], [0, 0, 2.6]])} fill="#c9c0b1" opacity="0.9" />
      <polygon points={pts([[-0.45, -0.5, 2.7], [10.45, -0.5, 2.7], [10.45, 1.5, 2.7], [-0.45, 1.5, 2.7]])} fill="#18221e" />
      <polyline points={pts([[-0.45, 1.5, 2.66], [10.45, 1.5, 2.66]])} stroke="#ffc58a" strokeWidth="2" />
      {/* Energy traces */}
      <polyline className="l-flow" points={pts([[5, 4.15], [2, 4.15], [2, 1.8]])} fill="none" stroke="#45e0a4" strokeWidth="1.5" />
      <polyline className="l-flow" points={pts([[5, 4.15], [8.15, 4.15], [8.15, 1.8]])} fill="none" stroke="#45e0a4" strokeWidth="1.5" />
      <polyline className="l-flow" points={pts([[5, 4.15], [5, 6.6], [2.8, 6.6], [2.8, 5.7]])} fill="none" stroke="#45e0a4" strokeWidth="1.5" />
      <polyline className="l-flow" points={pts([[5, 4.15], [5, 6.6], [7.8, 6.6], [7.8, 5.7]])} fill="none" stroke="#45e0a4" strokeWidth="1.5" />
      <circle cx={iso(5, 4.15)[0]} cy={iso(5, 4.15)[1]} r="4" fill="#d9ffef" />
      {/* Glass facades */}
      <polygon points={pts([[0, 7.8, 0], [10, 7.8, 0], [10, 7.8, 2.6], [0, 7.8, 2.6]])} fill="#cfe9dd" fillOpacity="0.07" stroke="#cfe9dd" strokeOpacity="0.35" />
      <polygon points={pts([[10, 0, 0], [10, 7.8, 0], [10, 7.8, 2.6], [10, 0, 2.6]])} fill="#cfe9dd" fillOpacity="0.07" stroke="#cfe9dd" strokeOpacity="0.35" />
    </svg>
  );
}
