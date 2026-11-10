"use client";
import { useEffect, useState } from "react";
import { Chips, Modal, Spinner } from "./ui";
import { bytes } from "./format";

type Point = { t: number; cpu: number; mem: number };
const W = 720, H = 150, PAD = 6;
const clock = (t: number, long: boolean) => new Date(t).toLocaleString([], long ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });

function Line({ pts, label, fmt, color, long }: { pts: { t: number; v: number }[]; label: string; fmt: (v: number) => string; color: string; long: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...pts.map((p) => p.v), 0.0001) * 1.15;
  const t0 = pts[0].t, span = Math.max(pts[pts.length - 1].t - t0, 1);
  const x = (t: number) => ((t - t0) / span) * W;
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const cur = hover !== null ? pts[hover] : pts[pts.length - 1];
  return (
    <figure className="mb-5">
      <figcaption className="mb-1 flex flex-wrap justify-between gap-x-4 text-xs text-muted">
        <span className="font-medium text-fg">{label}</span>
        <span>{hover !== null ? clock(cur.t, long) + " · " : "ahora · "}<b className="text-fg">{fmt(cur.v)}</b> · máx {fmt(Math.max(...pts.map((p) => p.v)))}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none rounded-lg border border-line bg-bg" role="img" aria-label={`${label}: actual ${fmt(cur.v)}`}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const t = t0 + ((e.clientX - r.left) / r.width) * span; let best = 0; pts.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(pts[best].t - t)) best = i; }); setHover(best); }}
        onPointerLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--color-line)" strokeDasharray="3 4" />)}
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} opacity=".12" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && <><line x1={x(cur.t)} x2={x(cur.t)} y1="0" y2={H} stroke="var(--color-muted)" /><circle cx={x(cur.t)} cy={y(cur.v)} r="4" fill={color} /></>}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{clock(pts[0].t, long)}</span><span>{clock(pts[pts.length - 1].t, long)}</span></div>
    </figure>
  );
}

export default function HistoryChart({ name, onClose }: { name: string; onClose: () => void }) {
  const [pts, setPts] = useState<Point[] | null>(null);
  const [range, setRange] = useState<"1h" | "24h" | "7d">("1h");
  useEffect(() => {
    setPts(null);
    const load = () => { if (!document.hidden) fetch(`/api/history?name=${encodeURIComponent(name)}&range=${range}`).then((r) => r.json()).then(setPts).catch(() => {}); };
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [name, range]);
  return (
    <Modal wide title={`Consumo · ${name}`} onClose={onClose}
      actions={<Chips value={range} onChange={setRange} options={[{ id: "1h", label: "1 h" }, { id: "24h", label: "24 h" }, { id: "7d", label: "7 días" }]} />}>
      {pts === null ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>
        : pts.length < 2 ? <p className="py-10 text-center text-sm text-muted">Aún no hay suficientes datos. Se toma una muestra cada 15 s y se guardan 7 días.</p>
        : <>
          <Line long={range !== "1h"} pts={pts.map((p) => ({ t: p.t, v: p.cpu }))} label="CPU (%)" fmt={(v) => v.toFixed(1) + "%"} color="var(--color-accent)" />
          <Line long={range !== "1h"} pts={pts.map((p) => ({ t: p.t, v: p.mem }))} label="Memoria" fmt={bytes} color="var(--color-ok)" />
        </>}
    </Modal>
  );
}
