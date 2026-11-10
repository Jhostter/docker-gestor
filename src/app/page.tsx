"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

type Container = { id: string; name: string; image: string; state: string; status: string; ports: string[]; project: string | null };
type Image = { id: string; tags: string[]; size: number; created: number };
type Volume = { name: string; driver: string; mountpoint: string };
type Stack = { name: string; dir: string; containers: number; running: number };
type Network = { id: string; name: string; driver: string; scope: string; subnet: string | null; containers: string[]; builtin: boolean };
type Ev = { t: number; type: string; action: string; name: string };
type Stat = { id: string; cpu: number; mem: number; limit: number };

const Terminal = dynamic(() => import("./Terminal"), { ssr: false });
const HistoryChart = dynamic(() => import("./HistoryChart"), { ssr: false });
const CreateForm = dynamic(() => import("./CreateForm"), { ssr: false });

const TABS = ["Contenedores", "Compose", "Imágenes", "Volúmenes", "Redes", "Eventos"] as const;
const mb = (n: number) => (n / 1048576).toFixed(n > 1e9 ? 0 : 1) + " MB";

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? r.statusText);
  return d as T;
}
const post = (url: string, body?: unknown) =>
  api(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded px-2 py-1 text-xs ${danger ? "bg-red-900/60 hover:bg-red-800" : "bg-zinc-800 hover:bg-zinc-700"}`}>
      {children}
    </button>
  );
}

function Logs({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const es = new EventSource(`/api/containers/${id}/logs`);
    es.onmessage = (e) => setLines((l) => [...l.slice(-1999), JSON.parse(e.data)]);
    return () => es.close();
  }, [id]);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [lines]);
  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-black/80 p-6">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Logs · {name}</h2><Btn onClick={onClose}>Cerrar</Btn></div>
      <div ref={box} className="flex-1 overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs whitespace-pre-wrap">
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Contenedores");
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [networks, setNetworks] = useState<Network[]>([]);
  const [logs, setLogs] = useState<Container | null>(null);
  const [term, setTerm] = useState<Container | null>(null);
  const [chart, setChart] = useState<Container | null>(null);
  const [creating, setCreating] = useState(false);
  const [netName, setNetName] = useState("");
  const [msg, setMsg] = useState("");
  const [pull, setPull] = useState("");
  const [events, setEvents] = useState<Ev[]>([]);
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Solo se pide lo que la pestaña activa necesita, y nada si la página está oculta.
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      switch (tabRef.current) {
        case "Contenedores": setContainers(await api<Container[]>("/api/containers")); break;
        case "Compose": setStacks(await api<Stack[]>("/api/compose")); break;
        case "Imágenes": setImages(await api<Image[]>("/api/images")); break;
        case "Volúmenes": setVolumes(await api<Volume[]>("/api/volumes")); break;
        case "Redes": setNetworks(await api<Network[]>("/api/networks")); break;
      }
    } catch (e) { setMsg((e as Error).message); }
  }, []);

  useEffect(() => { refresh(); }, [tab, refresh]);

  // Un único flujo de eventos de Docker: alimenta la pestaña Eventos y dispara el refresco (sin sondeo).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      setEvents((l) => [JSON.parse(m.data) as Ev, ...l].slice(0, 300));
      clearTimeout(timer); timer = setTimeout(refresh, 500);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const fallback = setInterval(refresh, 60000);
    return () => { es.close(); clearTimeout(timer); clearInterval(fallback); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  // CPU/RAM en vivo: solo en la pestaña Contenedores y con la página visible.
  useEffect(() => {
    if (tab !== "Contenedores") return;
    const load = () => { if (!document.hidden) api<Stat[]>("/api/stats").then((l) => setStats(Object.fromEntries(l.map((x) => [x.id, x])))).catch(() => {}); };
    load(); const t = setInterval(load, 10000); return () => clearInterval(t);
  }, [tab]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg("Trabajando…");
    try { const r = (await fn()) as { output?: string }; setMsg(r?.output ?? ok ?? "Hecho"); } catch (e) { setMsg((e as Error).message); }
    refresh();
  };
  const confirmDo = (what: string, fn: () => Promise<unknown>) => { if (confirm(`¿${what}?`)) act(fn); };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">🐳 Docker Gestor</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1.5 text-sm ${tab === t ? "bg-sky-700" : "bg-zinc-900 hover:bg-zinc-800"}`}>{t}</button>
          ))}
        </nav>
      </header>
      {msg && <pre className="mb-3 max-h-40 overflow-auto rounded bg-zinc-900 p-2 text-xs whitespace-pre-wrap" onClick={() => setMsg("")}>{msg}</pre>}

      {tab === "Contenedores" && (
        <>
        <div className="mb-3"><button onClick={() => { api<Network[]>("/api/networks").then(setNetworks).catch(() => {}); setCreating(true); }} className="rounded bg-sky-700 px-3 py-1.5 text-sm">+ Nuevo contenedor</button></div>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400"><tr><th>Nombre</th><th>Imagen</th><th>Estado</th><th>CPU</th><th>RAM</th><th>Puertos</th><th></th></tr></thead>
          <tbody>
            {containers.map((c) => {
              const s = stats[c.id], up = c.state === "running";
              return (
                <tr key={c.id} className="border-t border-zinc-800">
                  <td className="py-2">{c.name}</td><td className="text-zinc-400">{c.image}</td>
                  <td><span className={up ? "text-emerald-400" : "text-zinc-500"}>● {c.status}</span></td>
                  <td>{s ? s.cpu.toFixed(1) + "%" : "–"}</td><td>{s ? mb(s.mem) : "–"}</td>
                  <td className="text-xs">{c.ports.join(", ")}</td>
                  <td className="flex gap-1 py-2">
                    {up ? <Btn onClick={() => act(() => post(`/api/containers/${c.id}/stop`))}>Parar</Btn> : <Btn onClick={() => act(() => post(`/api/containers/${c.id}/start`))}>Iniciar</Btn>}
                    <Btn onClick={() => act(() => post(`/api/containers/${c.id}/restart`))}>Reiniciar</Btn>
                    <Btn onClick={() => setLogs(c)}>Logs</Btn>
                    <Btn onClick={() => setChart(c)}>Gráfica</Btn>
                    {up && <Btn onClick={() => setTerm(c)}>Terminal</Btn>}
                    <Btn danger onClick={() => confirmDo(`Eliminar ${c.name}`, () => post(`/api/containers/${c.id}/remove`))}>Eliminar</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}

      {tab === "Compose" && (
        <ul className="space-y-2">
          {stacks.length === 0 && <li className="text-zinc-500">No hay stacks de Compose.</li>}
          {stacks.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded bg-zinc-900 p-3">
              <div><div className="font-medium">{s.name} <span className="text-xs text-zinc-400">{s.running}/{s.containers} activos</span></div><div className="text-xs text-zinc-500">{s.dir}</div></div>
              <div className="flex gap-1">
                {(["up", "restart", "stop", "pull"] as const).map((a) => <Btn key={a} onClick={() => act(() => post("/api/compose", { project: s.name, action: a }))}>{a}</Btn>)}
                <Btn danger onClick={() => confirmDo(`docker compose down de ${s.name}`, () => post("/api/compose", { project: s.name, action: "down" }))}>down</Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "Imágenes" && (
        <>
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pull) act(() => post("/api/images", { ref: pull }), "Imagen descargada"); }}>
            <input value={pull} onChange={(e) => setPull(e.target.value)} placeholder="nginx:latest" className="flex-1 rounded bg-zinc-900 px-3 py-1.5 text-sm" />
            <button className="rounded bg-sky-700 px-3 text-sm">Descargar</button>
          </form>
          <ul className="space-y-1 text-sm">
            {images.map((i) => (
              <li key={i.id} className="flex items-center justify-between border-t border-zinc-800 py-2">
                <span>{i.tags.join(", ") || i.id.slice(7, 19)} <span className="text-zinc-500">{mb(i.size)}</span></span>
                <Btn danger onClick={() => confirmDo("Eliminar imagen", () => api(`/api/images?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }))}>Eliminar</Btn>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "Volúmenes" && (
        <ul className="space-y-1 text-sm">
          {volumes.map((v) => (
            <li key={v.name} className="flex items-center justify-between border-t border-zinc-800 py-2">
              <span className="truncate">{v.name} <span className="text-zinc-500">{v.driver}</span></span>
              <Btn danger onClick={() => confirmDo(`Eliminar volumen ${v.name}`, () => api(`/api/volumes?name=${encodeURIComponent(v.name)}`, { method: "DELETE" }))}>Eliminar</Btn>
            </li>
          ))}
        </ul>
      )}

      {tab === "Redes" && (
        <>
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (netName) { act(() => post("/api/networks", { name: netName }), "Red creada"); setNetName(""); } }}>
            <input value={netName} onChange={(e) => setNetName(e.target.value)} placeholder="nombre-de-la-red" className="flex-1 rounded bg-zinc-900 px-3 py-1.5 text-sm" />
            <button className="rounded bg-sky-700 px-3 text-sm">Crear red</button>
          </form>
          <ul className="space-y-1 text-sm">
            {networks.map((n) => (
              <li key={n.id} className="flex items-center justify-between border-t border-zinc-800 py-2">
                <span>{n.name} <span className="text-zinc-500">{n.driver} · {n.subnet ?? "sin subred"}</span>
                  <span className="block text-xs text-zinc-400">{n.containers.length ? n.containers.join(", ") : "sin contenedores"}</span></span>
                {!n.builtin && <Btn danger onClick={() => confirmDo(`Eliminar red ${n.name}`, () => api(`/api/networks?id=${n.id}`, { method: "DELETE" }))}>Eliminar</Btn>}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "Eventos" && (
        <ul className="space-y-1 font-mono text-xs">
          {events.length === 0 && <li className="text-zinc-500">Esperando eventos de Docker…</li>}
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 border-t border-zinc-800 py-1.5">
              <span className="text-zinc-500">{new Date(e.t).toLocaleTimeString()}</span>
              <span className="w-20 text-zinc-400">{e.type}</span>
              <span className={`w-24 ${/die|kill|destroy|stop|delete|remove|oom/.test(e.action) ? "text-red-400" : /start|create|pull|connect/.test(e.action) ? "text-emerald-400" : "text-amber-300"}`}>{e.action}</span>
              <span className="truncate">{e.name}</span>
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateForm networks={networks.filter((n) => !["host", "none"].includes(n.name)).map((n) => n.name)} onClose={() => setCreating(false)} onSubmit={(b) => act(() => post("/api/containers", b), "Contenedor creado")} />}
      {term && <Terminal id={term.id} name={term.name} onClose={() => setTerm(null)} />}
      {chart && <HistoryChart name={chart.name} onClose={() => setChart(null)} />}
      {logs && <Logs id={logs.id} name={logs.name} onClose={() => setLogs(null)} />}
    </main>
  );
}
