"use client";
import { useState } from "react";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const field = "w-full rounded bg-zinc-950 px-3 py-1.5 text-sm";

export default function CreateForm({ networks, onClose, onSubmit }: { networks: string[]; onClose: () => void; onSubmit: (body: object) => void }) {
  const [f, setF] = useState({ image: "", name: "", ports: "", env: "", volumes: "", restart: "no", network: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/80 p-6">
      <form className="w-full max-w-lg space-y-3 rounded bg-zinc-900 p-5" onSubmit={(e) => { e.preventDefault(); onSubmit({ image: f.image, name: f.name || undefined, ports: lines(f.ports), env: lines(f.env), volumes: lines(f.volumes), restart: f.restart, network: f.network || undefined }); onClose(); }}>
        <h2 className="font-semibold">Nuevo contenedor</h2>
        <input required placeholder="Imagen (nginx:latest)" value={f.image} onChange={set("image")} className={field} />
        <input placeholder="Nombre (opcional)" value={f.name} onChange={set("name")} className={field} />
        <textarea placeholder={"Puertos, uno por línea (se publican en 127.0.0.1)\n8080:80"} rows={2} value={f.ports} onChange={set("ports")} className={field} />
        <textarea placeholder={"Variables, una por línea\nCLAVE=valor"} rows={2} value={f.env} onChange={set("env")} className={field} />
        <textarea placeholder={"Volúmenes, uno por línea\nmi_volumen:/data"} rows={2} value={f.volumes} onChange={set("volumes")} className={field} />
        <div className="flex gap-2">
          <select value={f.restart} onChange={set("restart")} className={field}>{["no", "always", "unless-stopped", "on-failure"].map((r) => <option key={r}>{r}</option>)}</select>
          <select value={f.network} onChange={set("network")} className={field}><option value="">red por defecto</option>{networks.map((n) => <option key={n}>{n}</option>)}</select>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded bg-zinc-800 px-3 py-1.5 text-sm">Cancelar</button><button className="rounded bg-sky-700 px-3 py-1.5 text-sm">Crear e iniciar</button></div>
      </form>
    </div>
  );
}
