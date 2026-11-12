import { BRAND, SHAPES } from "./monkey.mjs";

/** The Docker Gestor monkey, drawn from the same shapes as the favicon and the tray icons. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {SHAPES.map((s, i) => {
        const c = BRAND[s.role as keyof typeof BRAND];
        if (s.t === "circle") return <circle key={i} cx={s.cx as number} cy={s.cy as number} r={s.r as number} fill={c} />;
        if (s.t === "ellipse") return <ellipse key={i} cx={s.cx as number} cy={s.cy as number} rx={s.rx as number} ry={s.ry as number} fill={c} />;
        const cx = s.cx as number, cy = s.cy as number, r = s.r as number, dy = 2, dx = Math.sqrt(r * r - dy * dy);
        return <path key={i} d={`M${cx - dx} ${cy + dy}A${r} ${r} 0 0 0 ${cx + dx} ${cy + dy}`} fill="none" stroke={c} strokeWidth={s.w as number} strokeLinecap="round" />;
      })}
    </svg>
  );
}
