"use client";
import { useEffect, useState } from "react";

type Point = { t: number; cpu: number; mem: number };

function Line({ pts, label, fmt, color }: { pts: { t: number; v: number }[]; label: string; fmt: (v: number) => string; color: string }) {
  const W = 700, H = 140;
  const max = Math.max(...pts.map((p) => p.v), 0.0001) * 1.15;
  const t0 = pts[0]?.t ?? 0, span = Math.max((pts.at(-1)?.t ?? 1) - t0, 1);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / span) * W).toFixed(1)},${(H - (p.v / max) * H).toFixed(1)}`).join(" ");
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>{label}</span><span>actual {fmt(pts.at(-1)?.v ?? 0)} · máx {fmt(Math.max(...pts.map((p) => p.v), 0))}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-zinc-950" role="img" aria-label={label}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#27272a" />)}
        {pts.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth="2" />}
      </svg>
    </div>
  );
}

export default function HistoryChart({ name, onClose }: { name: string; onClose: () => void }) {
  const [pts, setPts] = useState<Point[]>([]);
  const [range, setRange] = useState("1h");
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch(`/api/history?name=${encodeURIComponent(name)}&range=${range}`).then((r) => r.json()).then(setPts).catch(() => {}); };
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [name, range]);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-3xl rounded bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Consumo · {name} </h2>
          <div className="flex gap-1">{["1h", "24h", "7d"].map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded px-2 py-1 text-xs ${range === r ? "bg-sky-700" : "bg-zinc-800 hover:bg-zinc-700"}`}>{r}</button>)}
          <button onClick={onClose} className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">Cerrar</button></div></div>
        {pts.length < 2 ? <p className="text-sm text-zinc-500">Recopilando datos… (una muestra cada 15 s; se guardan 7 días)</p> : <>
          <Line pts={pts.map((p) => ({ t: p.t, v: p.cpu }))} label="CPU (%)" fmt={(v) => v.toFixed(1) + "%"} color="#38bdf8" />
          <Line pts={pts.map((p) => ({ t: p.t, v: p.mem / 1048576 }))} label="RAM (MB)" fmt={(v) => v.toFixed(0) + " MB"} color="#34d399" />
        </>}
      </div>
    </div>
  );
}
