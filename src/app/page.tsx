"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, post, bytes, ago } from "./format";
import { Badge, Btn, Card, Chips, Empty, Icon, Meter, Modal, SearchBox, Spinner, UIProvider, useUI } from "./ui";

type Container = { id: string; name: string; image: string; state: string; status: string; ports: string[]; project: string | null };
type Image = { id: string; tags: string[]; size: number; created: number };
type Volume = { name: string; driver: string; mountpoint: string };
type Stack = { name: string; dir: string; files: string[]; containers: number; running: number };
type Network = { id: string; name: string; driver: string; scope: string; subnet: string | null; containers: string[]; builtin: boolean };
type Ev = { t: number; type: string; action: string; name: string };
type Stat = { id: string; cpu: number; mem: number; limit: number };

const Terminal = dynamic(() => import("./Terminal"), { ssr: false });
const HistoryChart = dynamic(() => import("./HistoryChart"), { ssr: false });
const CreateForm = dynamic(() => import("./CreateForm"), { ssr: false });
const Logs = dynamic(() => import("./Logs"), { ssr: false });

const TABS = [
  { id: "Contenedores", icon: "box" }, { id: "Compose", icon: "layers" }, { id: "Imágenes", icon: "image" },
  { id: "Volúmenes", icon: "disk" }, { id: "Redes", icon: "net" }, { id: "Eventos", icon: "pulse" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const hostPort = (p: string) => p.split(":")[0];
const isHash = (s: string) => /^[a-f0-9]{64}$/.test(s);

export default function Page() { return <UIProvider><App /></UIProvider>; }

function App() {
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<Tab>("Contenedores");
  const [containers, setContainers] = useState<Container[] | null>(null);
  const [images, setImages] = useState<Image[] | null>(null);
  const [volumes, setVolumes] = useState<Volume[] | null>(null);
  const [stacks, setStacks] = useState<Stack[] | null>(null);
  const [networks, setNetworks] = useState<Network[] | null>(null);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [events, setEvents] = useState<Ev[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<Container | null>(null);
  const [term, setTerm] = useState<Container | null>(null);
  const [chart, setChart] = useState<Container | null>(null);
  const [creating, setCreating] = useState(false);
  const [help, setHelp] = useState(false);
  const [output, setOutput] = useState<{ title: string; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(true);
  const tabRef = useRef(tab);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  /* ---- datos: solo lo que necesita la pestaña activa, nada si la página está oculta ---- */
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      switch (tabRef.current) {
        case "Contenedores": setContainers(await api<Container[]>("/api/containers")); break;
        case "Compose": setStacks(await api<Stack[]>("/api/compose")); break;
        case "Imágenes": { const [i, c] = await Promise.all([api<Image[]>("/api/images"), api<Container[]>("/api/containers")]); setImages(i); setContainers(c); break; }
        case "Volúmenes": setVolumes(await api<Volume[]>("/api/volumes")); break;
        case "Redes": setNetworks(await api<Network[]>("/api/networks")); break;
      }
    } catch (e) { toast("error", (e as Error).message); }
  }, [toast]);
  useEffect(() => { refresh(); }, [tab, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const es = new EventSource("/api/events");
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (m) => { setEvents((l) => [JSON.parse(m.data) as Ev, ...l].slice(0, 300)); clearTimeout(timer); timer = setTimeout(refresh, 500); };
    const vis = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", vis);
    const fallback = setInterval(refresh, 60000);
    return () => { es.close(); clearTimeout(timer); clearInterval(fallback); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);

  useEffect(() => {
    if (tab !== "Contenedores") return;
    const load = () => { if (!document.hidden) api<Stat[]>("/api/stats").then((l) => setStats(Object.fromEntries(l.map((x) => [x.id, x])))).catch(() => {}); };
    load(); const t = setInterval(load, 10000); return () => clearInterval(t);
  }, [tab]);

  useEffect(() => { setSearch(""); }, [tab]);
  useEffect(() => { setDark(document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches); }, []);
  useEffect(() => { const n = containers?.filter((c) => c.state === "running").length; document.title = n === undefined ? "Docker Gestor" : `(${n}) Docker Gestor`; }, [containers]);

  const toggleTheme = () => { const next = dark ? "light" : "dark"; document.documentElement.dataset.theme = next; try { localStorage.setItem("theme", next); } catch {} setDark(!dark); };

  /* ---- atajos de teclado ---- */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || document.querySelector('[role="dialog"]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id);
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "?") setHelp(true);
      else if (e.key === "r") refresh();
      else if (e.key === "n") openCreate();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  /* ---- acciones ---- */
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy((b) => new Set(b).add(key));
    try { await fn(); toast("ok", ok); } catch (e) { toast("error", (e as Error).message); }
    setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    refresh();
  };
  const openCreate = () => {
    api<Network[]>("/api/networks").then(setNetworks).catch(() => {});
    api<Image[]>("/api/images").then(setImages).catch(() => {});
    setCreating(true);
  };
  const ctl = (c: Container, action: "start" | "stop" | "restart", ok: string) => run(c.id, () => post(`/api/containers/${c.id}/${action}`), `${c.name}: ${ok}`);
  const del = async (c: Container) => {
    if (await confirm({ title: `Eliminar ${c.name}`, body: "Se eliminará el contenedor (aunque esté en marcha). Los volúmenes con nombre se conservan.", confirm: "Eliminar", danger: true }))
      run(c.id, () => post(`/api/containers/${c.id}/remove`), `${c.name} eliminado`);
  };

  const running = containers?.filter((c) => c.state === "running").length ?? 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-[88rem] flex-col md:flex-row">
      <aside className="shrink-0 border-b border-line md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-3 md:py-5"><span className="text-xl" aria-hidden>🐳</span><h1 className="font-bold">Docker Gestor</h1></div>
        <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {TABS.map((t, i) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface2 hover:text-fg"}`}>
              <Icon name={t.icon} /><span>{t.id}</span><kbd className="ml-auto hidden text-[10px] opacity-50 md:inline">{i + 1}</kbd>
            </button>
          ))}
        </nav>
        <div className="hidden flex-col gap-2 border-t border-line p-3 md:absolute md:bottom-0 md:left-0 md:right-0 md:flex">
          <div className="flex items-center gap-2 text-xs text-muted" role="status">
            <span className={`size-2 rounded-full ${online === null ? "bg-warn" : online ? "bg-ok" : "bg-bad"}`} />
            {online === null ? "Conectando…" : online ? "Docker conectado" : "Sin conexión con el gestor"}
          </div>
          <div className="flex gap-1"><Btn kind="ghost" icon={dark ? "sun" : "moon"} label={dark ? "Tema claro" : "Tema oscuro"} onClick={toggleTheme} /><Btn kind="ghost" icon="help" label="Ayuda y atajos (?)" onClick={() => setHelp(true)} /></div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        {online === false && <div role="alert" className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">Se perdió la conexión con el servidor. Reintentando automáticamente… Si persiste: <code>systemctl --user status docker-gestor</code>.</div>}
        {tab === "Contenedores" && <ContainersView {...{ containers, stats, busy, search, setSearch, searchRef, ctl, del, openCreate, setLogs, setTerm, setChart, running }} />}
        {tab === "Compose" && <ComposeView {...{ stacks, busy, run, confirm, setOutput, goTo: (name: string) => { setTab("Contenedores"); setTimeout(() => setSearch(name), 0); } }} />}
        {tab === "Imágenes" && <ImagesView {...{ images, containers, busy, run, confirm, search, setSearch, searchRef }} />}
        {tab === "Volúmenes" && <VolumesView {...{ volumes, busy, run, confirm, search, setSearch, searchRef }} />}
        {tab === "Redes" && <NetworksView {...{ networks, busy, run, confirm }} />}
        {tab === "Eventos" && <EventsView events={events} clear={() => setEvents([])} />}
      </main>

      <div className="fixed bottom-3 left-3 md:hidden"><Btn icon={dark ? "sun" : "moon"} label="Cambiar tema" onClick={toggleTheme} /></div>

      {logs && <Logs id={logs.id} name={logs.name} onClose={() => setLogs(null)} />}
      {term && <Terminal id={term.id} name={term.name} onClose={() => setTerm(null)} />}
      {chart && <HistoryChart name={chart.name} onClose={() => setChart(null)} />}
      {creating && <CreateForm networks={(networks ?? []).filter((n) => !["host", "none"].includes(n.name)).map((n) => n.name)} images={(images ?? []).flatMap((i) => i.tags)} onClose={() => setCreating(false)}
        onSubmit={async (b) => { await post("/api/containers", b); toast("ok", "Contenedor creado e iniciado"); refresh(); }} />}
      {output && <Modal wide title={output.title} onClose={() => setOutput(null)}><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 font-mono text-xs">{output.text.trim() || "(sin salida)"}</pre></Modal>}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ================= Contenedores ================= */
type CV = {
  containers: Container[] | null; stats: Record<string, Stat>; busy: Set<string>; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement>; running: number;
  ctl: (c: Container, a: "start" | "stop" | "restart", ok: string) => void; del: (c: Container) => void; openCreate: () => void;
  setLogs: (c: Container) => void; setTerm: (c: Container) => void; setChart: (c: Container) => void;
};
function ContainersView({ containers, stats, busy, search, setSearch, searchRef, running, ctl, del, openCreate, setLogs, setTerm, setChart }: CV) {
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");
  const [group, setGroup] = useState(true);
  const all = containers ?? [];
  const list = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((c) => (filter === "all" || (filter === "up") === (c.state === "running")) && (!q || `${c.name} ${c.image} ${c.project ?? ""}`.toLowerCase().includes(q)));
  }, [all, filter, search]);
  const live = Object.values(stats);
  const cpu = live.reduce((a, s) => a + s.cpu, 0), mem = live.reduce((a, s) => a + s.mem, 0);
  const groups = useMemo(() => {
    if (!group) return [["", list] as const];
    const m = new Map<string, Container[]>();
    for (const c of list) { const k = c.project ?? ""; m.set(k, [...(m.get(k) ?? []), c]); }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [list, group]);

  return (
    <section aria-label="Contenedores" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["En marcha", `${running}`, `de ${all.length} contenedores`], ["CPU total", live.length ? cpu.toFixed(1) + "%" : "–", "contenedores activos"], ["Memoria", live.length ? bytes(mem) : "–", "en uso"], ["Stacks", `${new Set(all.map((c) => c.project).filter(Boolean)).size}`, "de Compose"]].map(([t, v, s]) => (
          <Card key={t} className="p-3"><p className="text-xs text-muted">{t}</p><p className="text-2xl font-semibold tabular-nums">{containers ? v : "…"}</p><p className="text-xs text-muted">{s}</p></Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar ( / )" inputRef={searchRef} />
        <Chips value={filter} onChange={setFilter} options={[{ id: "all", label: "Todos", count: all.length }, { id: "up", label: "Activos", count: running }, { id: "down", label: "Detenidos", count: all.length - running }]} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />Agrupar por stack</label>
        <div className="ml-auto"><Btn kind="primary" icon="plus" onClick={openCreate}>Nuevo contenedor</Btn></div>
      </div>
      {containers === null ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>
        : list.length === 0 ? <Empty icon="box" title={all.length ? "Ningún contenedor coincide" : "Aún no hay contenedores"} hint={all.length ? "Prueba con otro filtro o búsqueda." : "Crea el primero con «Nuevo contenedor» o con docker compose."} />
        : groups.map(([name, items]) => (
          <div key={name}>
            {group && <h3 className="mb-1.5 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name="layers" className="size-3.5" />{name || "Sin stack"}<span className="font-normal">({items.length})</span></h3>}
            <Card className="divide-y divide-line overflow-hidden">
              {items.map((c) => <Row key={c.id} {...{ c, s: stats[c.id], busy: busy.has(c.id), ctl, del, setLogs, setTerm, setChart }} />)}
            </Card>
          </div>
        ))}
    </section>
  );
}

function Row({ c, s, busy, ctl, del, setLogs, setTerm, setChart }: { c: Container; s?: Stat; busy: boolean; ctl: CV["ctl"]; del: CV["del"]; setLogs: CV["setLogs"]; setTerm: CV["setTerm"]; setChart: CV["setChart"] }) {
  const up = c.state === "running";
  const tone = up ? (/unhealthy/.test(c.status) ? "bad" : /starting/.test(c.status) ? "warn" : "ok") : c.state === "exited" || c.state === "created" ? "muted" : "warn";
  return (
    <div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_7rem_auto]">
      <div className="min-w-0">
        <p className="truncate font-medium" title={c.name}>{c.name}</p>
        <p className="truncate text-xs text-muted" title={c.image}>{c.image}</p>
        {c.ports.length > 0 && <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">{c.ports.map((p) => /\/tcp$/.test(p)
          ? <a key={p} href={`http://localhost:${hostPort(p)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline" title={`Abrir http://localhost:${hostPort(p)}`}>:{p.replace("/tcp", "")}<Icon name="link" className="size-3" /></a>
          : <span key={p} className="text-muted">:{p}</span>)}</p>}
      </div>
      <div className="min-w-0"><Badge tone={tone}>{up ? "En marcha" : c.state === "exited" ? "Detenido" : c.state}</Badge><p className="mt-0.5 truncate text-xs text-muted" title={c.status}>{c.status}</p></div>
      <div className="text-xs"><span className="text-muted">CPU </span><span className="tabular-nums">{s ? s.cpu.toFixed(1) + "%" : "–"}</span><Meter value={s?.cpu ?? 0} label="Uso de CPU" /></div>
      <div className="text-xs"><span className="text-muted">RAM </span><span className="tabular-nums">{s ? bytes(s.mem) : "–"}</span><Meter value={s?.mem ?? 0} max={s?.limit || 1} label="Uso de memoria" /></div>
      <div className="flex items-center gap-0.5 justify-self-end">
        {up ? <Btn kind="ghost" icon="stop" label="Detener" busy={busy} onClick={() => ctl(c, "stop", "detenido")} /> : <Btn kind="ghost" icon="play" label="Iniciar" busy={busy} onClick={() => ctl(c, "start", "iniciado")} />}
        <Btn kind="ghost" icon="restart" label="Reiniciar" disabled={busy} onClick={() => ctl(c, "restart", "reiniciado")} />
        <Btn kind="ghost" icon="logs" label="Ver logs" onClick={() => setLogs(c)} />
        {up && <Btn kind="ghost" icon="term" label="Abrir terminal" onClick={() => setTerm(c)} />}
        <Btn kind="ghost" icon="chart" label="Gráfica de consumo" onClick={() => setChart(c)} />
        <Btn kind="ghost" icon="trash" label="Eliminar" disabled={busy} onClick={() => del(c)} />
      </div>
    </div>
  );
}

/* ================= Compose ================= */
type Common = { busy: Set<string>; run: (k: string, fn: () => Promise<unknown>, ok: string) => Promise<void>; confirm: ReturnType<typeof useUI>["confirm"] };
function ComposeView({ stacks, busy, run, confirm, setOutput, goTo }: Common & { stacks: Stack[] | null; setOutput: (o: { title: string; text: string }) => void; goTo: (n: string) => void }) {
  const act = (s: Stack, action: string, ok: string) =>
    run(`${s.name}:${action}`, async () => { const r = await post<{ output: string }>("/api/compose", { project: s.name, action }); setOutput({ title: `docker compose ${action} · ${s.name}`, text: r.output }); }, `${s.name}: ${ok}`);
  if (stacks === null) return <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>;
  if (!stacks.length) return <Empty icon="layers" title="No hay stacks de Compose" hint="Aparecerán aquí los proyectos levantados con docker compose." />;
  return (
    <section aria-label="Compose" className="space-y-3">
      {stacks.map((s) => {
        const manageable = s.files.length > 0, b = [...busy].some((k) => k.startsWith(s.name + ":"));
        return (
          <Card key={s.name} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.name} <Badge tone={s.running === s.containers ? "ok" : s.running ? "warn" : "muted"}>{s.running}/{s.containers} activos</Badge></p>
                <p className="truncate text-xs text-muted" title={s.dir}>{manageable ? s.dir : "Creado con otra herramienta (p. ej. Supabase CLI): solo se puede consultar"}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Btn onClick={() => goTo(s.name)}>Ver contenedores</Btn>
                {manageable && <>
                  <Btn icon="play" busy={b} onClick={() => act(s, "up", "iniciado")}>Iniciar</Btn>
                  <Btn icon="restart" disabled={b} onClick={() => act(s, "restart", "reiniciado")}>Reiniciar</Btn>
                  <Btn icon="stop" disabled={b} onClick={() => act(s, "stop", "detenido")}>Detener</Btn>
                  <Btn icon="download" disabled={b} onClick={() => act(s, "pull", "imágenes actualizadas")}>Actualizar imágenes</Btn>
                  <Btn kind="danger" icon="trash" disabled={b} onClick={async () => { if (await confirm({ title: `Bajar ${s.name}`, body: "Ejecuta «docker compose down»: detiene y elimina los contenedores y redes del stack. Los volúmenes se conservan.", confirm: "Bajar stack", danger: true })) act(s, "down", "eliminado"); }}>Bajar</Btn>
                </>}
              </div>
            </div>
            <div className="mt-3"><Meter plain value={s.running} max={s.containers || 1} label="Contenedores activos" /></div>
          </Card>
        );
      })}
    </section>
  );
}

/* ================= Imágenes ================= */
function ImagesView({ images, containers, busy, run, confirm, search, setSearch, searchRef }: Common & { images: Image[] | null; containers: Container[] | null; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement> }) {
  const [ref, setRef] = useState(""), [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const inUse = (i: Image) => (containers ?? []).some((c) => i.tags.includes(c.image) || c.image === i.id || i.id.includes(c.image));
  const list = useMemo(() => (images ?? []).filter((i) => {
    const q = search.toLowerCase();
    return (!q || i.tags.join(" ").toLowerCase().includes(q) || i.id.includes(q)) && (filter === "all" || (filter === "used") === inUse(i));
  }).sort((a, b) => b.created - a.created), [images, containers, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (images ?? []).reduce((a, i) => a + i.size, 0);
  return (
    <section aria-label="Imágenes" className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = ref.trim(); if (r) run("pull", async () => { await post("/api/images", { ref: r }); setRef(""); }, `Imagen ${r} descargada`); }}>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Descargar imagen, p. ej. nginx:latest" aria-label="Imagen a descargar" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted" />
        <Btn type="submit" kind="primary" icon="download" busy={busy.has("pull")} disabled={!ref.trim()}>{busy.has("pull") ? "Descargando…" : "Descargar"}</Btn>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar ( / )" inputRef={searchRef} />
        <Chips value={filter} onChange={setFilter} options={[{ id: "all", label: "Todas" }, { id: "used", label: "En uso" }, { id: "unused", label: "Sin usar" }]} />
        <span className="ml-auto text-xs text-muted">{images ? `${images.length} imágenes · ${bytes(total)}` : ""}</span>
      </div>
      {images === null ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>
        : list.length === 0 ? <Empty icon="image" title="Sin resultados" hint="Cambia el filtro o descarga una imagen." />
        : <Card className="divide-y divide-line overflow-hidden">{list.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={i.tags.join(", ")}>{i.tags[0] ?? <span className="text-muted">&lt;sin etiqueta&gt;</span>}{i.tags.length > 1 && <span className="ml-1 text-xs text-muted">+{i.tags.length - 1}</span>}</p>
              <p className="text-xs text-muted">{i.id.replace("sha256:", "").slice(0, 12)} · {bytes(i.size)} · creada {ago(i.created * 1000)}</p>
            </div>
            <Badge tone={inUse(i) ? "ok" : "muted"}>{inUse(i) ? "En uso" : "Sin usar"}</Badge>
            <Btn kind="ghost" icon="trash" label="Eliminar imagen" busy={busy.has(i.id)} onClick={async () => { if (await confirm({ title: "Eliminar imagen", body: `${i.tags[0] ?? i.id.slice(7, 19)} (${bytes(i.size)}). Docker rechazará la acción si algún contenedor la usa.`, confirm: "Eliminar", danger: true })) run(i.id, () => api(`/api/images?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }), "Imagen eliminada"); }} />
          </div>))}</Card>}
    </section>
  );
}

/* ================= Volúmenes ================= */
function VolumesView({ volumes, busy, run, confirm, search, setSearch, searchRef }: Common & { volumes: Volume[] | null; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement> }) {
  const list = (volumes ?? []).filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <section aria-label="Volúmenes" className="space-y-4">
      <div className="flex items-center gap-2"><SearchBox value={search} onChange={setSearch} placeholder="Buscar ( / )" inputRef={searchRef} /><span className="ml-auto text-xs text-muted">{volumes ? `${volumes.length} volúmenes` : ""}</span></div>
      {volumes === null ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>
        : list.length === 0 ? <Empty icon="disk" title="Sin volúmenes" />
        : <Card className="divide-y divide-line overflow-hidden">{list.map((v) => (
          <div key={v.name} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={v.name}>{isHash(v.name) ? <span className="font-mono">{v.name.slice(0, 12)}…</span> : v.name} {isHash(v.name) && <Badge tone="muted">anónimo</Badge>}</p>
              <p className="truncate text-xs text-muted" title={v.mountpoint}>{v.driver} · {v.mountpoint}</p>
            </div>
            <Btn kind="ghost" icon="trash" label="Eliminar volumen" busy={busy.has(v.name)} onClick={async () => { if (await confirm({ title: "Eliminar volumen", body: `${isHash(v.name) ? v.name.slice(0, 12) : v.name}: se perderán sus datos de forma permanente. Docker rechazará la acción si está en uso.`, confirm: "Eliminar para siempre", danger: true })) run(v.name, () => api(`/api/volumes?name=${encodeURIComponent(v.name)}`, { method: "DELETE" }), "Volumen eliminado"); }} />
          </div>))}</Card>}
    </section>
  );
}

/* ================= Redes ================= */
function NetworksView({ networks, busy, run, confirm }: Common & { networks: Network[] | null }) {
  const [name, setName] = useState("");
  return (
    <section aria-label="Redes" className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) run("net", async () => { await post("/api/networks", { name: n }); setName(""); }, `Red ${n} creada`); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la nueva red" aria-label="Nombre de la red" pattern="[\w.\-]{1,64}" title="Letras, números, punto, guion y guion bajo" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted" />
        <Btn type="submit" kind="primary" icon="plus" busy={busy.has("net")} disabled={!name.trim()}>Crear red</Btn>
      </form>
      {networks === null ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />Cargando…</div>
        : <Card className="divide-y divide-line overflow-hidden">{networks.map((n) => (
          <div key={n.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{n.name} <span className="text-xs font-normal text-muted">{n.driver} · {n.subnet ?? "sin subred"}</span> {n.builtin && <Badge tone="muted">del sistema</Badge>}</p>
              <p className="mt-0.5 flex flex-wrap gap-1">{n.containers.length ? n.containers.map((c) => <span key={c} className="rounded bg-surface2 px-1.5 py-0.5 text-xs">{c}</span>) : <span className="text-xs text-muted">Sin contenedores conectados</span>}</p>
            </div>
            {!n.builtin && <Btn kind="ghost" icon="trash" label="Eliminar red" busy={busy.has(n.id)} onClick={async () => { if (await confirm({ title: `Eliminar red ${n.name}`, body: "Docker rechazará la acción si hay contenedores conectados.", confirm: "Eliminar", danger: true })) run(n.id, () => api(`/api/networks?id=${n.id}`, { method: "DELETE" }), "Red eliminada"); }} />}
          </div>))}</Card>}
    </section>
  );
}

/* ================= Eventos ================= */
function EventsView({ events, clear }: { events: Ev[]; clear: () => void }) {
  const [type, setType] = useState<"all" | "container" | "image" | "network" | "volume">("all");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 15000); return () => clearInterval(t); }, []);
  const list = events.filter((e) => type === "all" || e.type === type);
  const tone = (a: string) => (/die|kill|destroy|stop|delete|remove|oom|disconnect/.test(a) ? "text-bad" : /start|create|pull|connect|unpause/.test(a) ? "text-ok" : "text-warn");
  return (
    <section aria-label="Eventos" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chips value={type} onChange={setType} options={[{ id: "all", label: "Todos" }, { id: "container", label: "Contenedores" }, { id: "image", label: "Imágenes" }, { id: "network", label: "Redes" }, { id: "volume", label: "Volúmenes" }]} />
        <span className="ml-auto text-xs text-muted">{list.length} eventos · en vivo</span>
        <Btn kind="ghost" icon="trash" onClick={clear}>Limpiar</Btn>
      </div>
      {list.length === 0 ? <Empty icon="pulse" title="Esperando eventos de Docker…" hint="Inicia, detén o crea algo y aparecerá aquí al instante." />
        : <Card className="divide-y divide-line overflow-hidden font-mono text-xs">{list.map((e, i) => (
          <div key={`${e.t}-${i}`} className="flex gap-3 px-4 py-2">
            <time className="w-20 shrink-0 text-muted" title={new Date(e.t).toLocaleString()}>{new Date(e.t).toLocaleTimeString()}</time>
            <span className="hidden w-20 shrink-0 text-muted sm:block">{e.type}</span>
            <span className={`w-24 shrink-0 font-semibold ${tone(e.action)}`}>{e.action}</span>
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="hidden text-muted md:block">{ago(e.t)}</span>
          </div>))}</Card>}
    </section>
  );
}

/* ================= Ayuda ================= */
function HelpModal({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [["1 – 6", "Cambiar de sección"], ["/", "Ir al buscador"], ["n", "Nuevo contenedor"], ["r", "Refrescar datos"], ["?", "Esta ayuda"], ["Esc", "Cerrar ventanas"]];
  return (
    <Modal title="Ayuda y atajos" onClose={onClose}>
      <dl className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        {keys.map(([k, d]) => <div key={k} className="contents"><dt><kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt><dd className="text-muted">{d}</dd></div>)}
      </dl>
      <p className="text-sm text-muted">Guía completa: <code>docs/GUIA.md</code> en el proyecto (<code>~/docker-gestor</code>). Los atajos de una tecla no actúan mientras escribes en un campo o hay una ventana abierta.</p>
    </Modal>
  );
}
