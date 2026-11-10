"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, post, bytes, ago } from "./format";
import { useT, setLang, type Key } from "./i18n";
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
const AlertsView = dynamic(() => import("./Alerts"), { ssr: false });
type AlertsPublic = import("./Alerts").AlertsPublic;

const TABS = [
  { id: "containers", icon: "box" }, { id: "compose", icon: "layers" }, { id: "images", icon: "image" },
  { id: "volumes", icon: "disk" }, { id: "networks", icon: "net" }, { id: "events", icon: "pulse" }, { id: "alerts", icon: "bell" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const tabKey = (id: Tab) => `tab_${id}` as Key;

const hostPort = (p: string) => p.split(":")[0];
const isHash = (s: string) => /^[a-f0-9]{64}$/.test(s);
const Loading = ({ label }: { label: string }) => <div className="flex items-center gap-2 py-10 text-muted"><Spinner />{label}</div>;

export default function Page() { return <UIProvider><App /></UIProvider>; }

function App() {
  const { toast, confirm } = useUI();
  const { t, lang } = useT();
  const [tab, setTab] = useState<Tab>("containers");
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
  const [alertsCfg, setAlertsCfg] = useState<AlertsPublic | null>(null);
  const [alertsTick, setAlertsTick] = useState(0);
  const tabRef = useRef(tab);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  /* ---- data: only what the active tab needs, nothing while the page is hidden ---- */
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      switch (tabRef.current) {
        case "containers": setContainers(await api<Container[]>("/api/containers")); break;
        case "compose": setStacks(await api<Stack[]>("/api/compose")); break;
        case "images": { const [i, c] = await Promise.all([api<Image[]>("/api/images"), api<Container[]>("/api/containers")]); setImages(i); setContainers(c); break; }
        case "volumes": setVolumes(await api<Volume[]>("/api/volumes")); break;
        case "networks": setNetworks(await api<Network[]>("/api/networks")); break;
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
    if (tab !== "containers") return;
    const load = () => { if (!document.hidden) api<Stat[]>("/api/stats").then((l) => setStats(Object.fromEntries(l.map((x) => [x.id, x])))).catch(() => {}); };
    load(); const i = setInterval(load, 10000); return () => clearInterval(i);
  }, [tab]);

  /* ---- alerts: config for the browser channel; the stream is open only while it is enabled ---- */
  const reloadAlerts = useCallback(async () => { try { setAlertsCfg(await api<AlertsPublic>("/api/alerts/config")); } catch { /* alerts are optional */ } }, []);
  useEffect(() => { reloadAlerts(); }, [reloadAlerts]);
  const browserAlerts = !!alertsCfg?.enabled && !!alertsCfg.channels.browser.enabled;
  useEffect(() => {
    if (!browserAlerts) return;
    const es = new EventSource("/api/alerts/stream");
    es.onmessage = (m) => {
      const a = JSON.parse(m.data) as { rule: string; name: string; message: string };
      toast("error", a.message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification("Docker Gestor", { body: a.message, tag: `${a.rule}:${a.name}` });
      setAlertsTick((n) => n + 1);
    };
    return () => es.close();
  }, [browserAlerts, toast]);
  // Messages sent by the server use the language chosen here
  useEffect(() => {
    if (alertsCfg && alertsCfg.lang !== lang) api("/api/alerts/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang }) }).then(reloadAlerts).catch(() => {});
  }, [lang, alertsCfg, reloadAlerts]);

  useEffect(() => { setSearch(""); }, [tab]);
  useEffect(() => { setDark(document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches); }, []);
  useEffect(() => { const n = containers?.filter((c) => c.state === "running").length; document.title = n === undefined ? "Docker Gestor" : `(${n}) Docker Gestor`; }, [containers]);

  const toggleTheme = () => { const next = dark ? "light" : "dark"; document.documentElement.dataset.theme = next; try { localStorage.setItem("theme", next); } catch {} setDark(!dark); };
  const toggleLang = () => setLang(lang === "es" ? "en" : "es");

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(el.tagName) || document.querySelector('[role="dialog"]')) return;
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

  /* ---- actions ---- */
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
  const ctl = (c: Container, action: "start" | "stop" | "restart") =>
    run(c.id, () => post(`/api/containers/${c.id}/${action}`), `${c.name}: ${t(({ start: "ok_started", stop: "ok_stopped", restart: "ok_restarted" } as const)[action])}`);
  const del = async (c: Container) => {
    if (await confirm({ title: t("del_title", { name: c.name }), body: t("del_body"), confirm: t("delete"), danger: true }))
      run(c.id, () => post(`/api/containers/${c.id}/remove`), t("del_done", { name: c.name }));
  };

  const running = containers?.filter((c) => c.state === "running").length ?? 0;
  const langBtn = <Btn kind="ghost" label={t("lang_label")} onClick={toggleLang}>{lang.toUpperCase()}</Btn>;

  return (
    <div className="mx-auto flex min-h-screen max-w-[88rem] flex-col md:flex-row">
      <aside className="shrink-0 border-b border-line md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-3 md:py-5"><span className="text-xl" aria-hidden>🐳</span><h1 className="font-bold">Docker Gestor</h1></div>
        <nav aria-label={t("nav_sections")} className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {TABS.map((x, i) => (
            <button key={x.id} onClick={() => setTab(x.id)} aria-current={tab === x.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${tab === x.id ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface2 hover:text-fg"}`}>
              <Icon name={x.icon} /><span>{t(tabKey(x.id))}</span><kbd className="ml-auto hidden text-[10px] opacity-50 md:inline">{i + 1}</kbd>
            </button>
          ))}
        </nav>
        <div className="hidden flex-col gap-2 border-t border-line p-3 md:absolute md:bottom-0 md:left-0 md:right-0 md:flex">
          <div className="flex items-center gap-2 text-xs text-muted" role="status">
            <span className={`size-2 rounded-full ${online === null ? "bg-warn" : online ? "bg-ok" : "bg-bad"}`} />
            {online === null ? t("conn_connecting") : online ? t("conn_ok") : t("conn_lost")}
          </div>
          <div className="flex gap-1"><Btn kind="ghost" icon={dark ? "sun" : "moon"} label={dark ? t("theme_light") : t("theme_dark")} onClick={toggleTheme} />{langBtn}<Btn kind="ghost" icon="help" label={t("help_label")} onClick={() => setHelp(true)} /></div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-20 md:p-6">
        {online === false && <div role="alert" className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{t("lost_banner")} <code>systemctl --user status docker-gestor</code>.</div>}
        {tab === "containers" && <ContainersView {...{ containers, stats, busy, search, setSearch, searchRef, ctl, del, openCreate, setLogs, setTerm, setChart, running }} />}
        {tab === "compose" && <ComposeView {...{ stacks, busy, run, confirm, setOutput, goTo: (name: string) => { setTab("containers"); setTimeout(() => setSearch(name), 0); } }} />}
        {tab === "images" && <ImagesView {...{ images, containers, busy, run, confirm, search, setSearch, searchRef }} />}
        {tab === "volumes" && <VolumesView {...{ volumes, busy, run, confirm, search, setSearch, searchRef }} />}
        {tab === "networks" && <NetworksView {...{ networks, busy, run, confirm }} />}
        {tab === "events" && <EventsView events={events} clear={() => setEvents([])} />}
        {tab === "alerts" && <AlertsView cfg={alertsCfg} reload={reloadAlerts} refreshKey={alertsTick} />}
      </main>

      <div className="fixed bottom-3 left-3 flex gap-1 rounded-lg bg-surface p-1 shadow-lg ring-1 ring-line md:hidden"><Btn icon={dark ? "sun" : "moon"} label={t("theme_toggle")} onClick={toggleTheme} /><Btn label={t("lang_label")} onClick={toggleLang}>{lang.toUpperCase()}</Btn></div>

      {logs && <Logs id={logs.id} name={logs.name} onClose={() => setLogs(null)} />}
      {term && <Terminal id={term.id} name={term.name} onClose={() => setTerm(null)} />}
      {chart && <HistoryChart name={chart.name} onClose={() => setChart(null)} />}
      {creating && <CreateForm networks={(networks ?? []).filter((n) => !["host", "none"].includes(n.name)).map((n) => n.name)} images={(images ?? []).flatMap((i) => i.tags)} onClose={() => setCreating(false)}
        onSubmit={async (b) => { await post("/api/containers", b); toast("ok", t("created_ok")); refresh(); }} />}
      {output && <Modal wide title={output.title} onClose={() => setOutput(null)}><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 font-mono text-xs">{output.text.trim() || t("no_output")}</pre></Modal>}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ================= Containers ================= */
type CV = {
  containers: Container[] | null; stats: Record<string, Stat>; busy: Set<string>; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement>; running: number;
  ctl: (c: Container, a: "start" | "stop" | "restart") => void; del: (c: Container) => void; openCreate: () => void;
  setLogs: (c: Container) => void; setTerm: (c: Container) => void; setChart: (c: Container) => void;
};
function ContainersView({ containers, stats, busy, search, setSearch, searchRef, running, ctl, del, openCreate, setLogs, setTerm, setChart }: CV) {
  const { t } = useT();
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
    <section aria-label={t("tab_containers")} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[t("stat_running"), `${running}`, t("stat_of", { n: all.length })], [t("stat_cpu"), live.length ? cpu.toFixed(1) + "%" : "–", t("stat_active")], [t("stat_mem"), live.length ? bytes(mem) : "–", t("stat_in_use")], [t("stat_stacks"), `${new Set(all.map((c) => c.project).filter(Boolean)).size}`, t("stat_compose")]].map(([title, v, s]) => (
          <Card key={title} className="p-3"><p className="text-xs text-muted">{title}</p><p className="text-2xl font-semibold tabular-nums">{containers ? v : "…"}</p><p className="text-xs text-muted">{s}</p></Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder={t("search")} inputRef={searchRef} />
        <Chips value={filter} onChange={setFilter} options={[{ id: "all", label: t("f_all"), count: all.length }, { id: "up", label: t("f_up"), count: running }, { id: "down", label: t("f_down"), count: all.length - running }]} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />{t("group_by")}</label>
        <div className="ml-auto"><Btn kind="primary" icon="plus" onClick={openCreate}>{t("new_container")}</Btn></div>
      </div>
      {containers === null ? <Loading label={t("loading")} />
        : list.length === 0 ? <Empty icon="box" title={all.length ? t("empty_nomatch") : t("empty_none")} hint={all.length ? t("empty_nomatch_hint") : t("empty_none_hint")} />
        : groups.map(([name, items]) => (
          <div key={name}>
            {group && <h3 className="mb-1.5 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name="layers" className="size-3.5" />{name || t("no_stack")}<span className="font-normal">({items.length})</span></h3>}
            <Card className="divide-y divide-line overflow-hidden">
              {items.map((c) => <Row key={c.id} {...{ c, s: stats[c.id], busy: busy.has(c.id), ctl, del, setLogs, setTerm, setChart }} />)}
            </Card>
          </div>
        ))}
    </section>
  );
}

function Row({ c, s, busy, ctl, del, setLogs, setTerm, setChart }: { c: Container; s?: Stat; busy: boolean; ctl: CV["ctl"]; del: CV["del"]; setLogs: CV["setLogs"]; setTerm: CV["setTerm"]; setChart: CV["setChart"] }) {
  const { t } = useT();
  const up = c.state === "running";
  const tone = up ? (/unhealthy/.test(c.status) ? "bad" : /starting/.test(c.status) ? "warn" : "ok") : c.state === "exited" || c.state === "created" ? "muted" : "warn";
  return (
    <div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_7rem_auto]">
      <div className="min-w-0">
        <p className="truncate font-medium" title={c.name}>{c.name}</p>
        <p className="truncate text-xs text-muted" title={c.image}>{c.image}</p>
        {c.ports.length > 0 && <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">{c.ports.map((p) => /\/tcp$/.test(p)
          ? <a key={p} href={`http://localhost:${hostPort(p)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline" title={t("open_url", { port: hostPort(p) })}>:{p.replace("/tcp", "")}<Icon name="link" className="size-3" /></a>
          : <span key={p} className="text-muted">:{p}</span>)}</p>}
      </div>
      <div className="min-w-0"><Badge tone={tone}>{up ? t("badge_running") : c.state === "exited" ? t("badge_stopped") : c.state}</Badge><p className="mt-0.5 truncate text-xs text-muted" title={c.status}>{c.status}</p></div>
      <div className="text-xs"><span className="text-muted">{t("cpu")} </span><span className="tabular-nums">{s ? s.cpu.toFixed(1) + "%" : "–"}</span><Meter value={s?.cpu ?? 0} label={t("cpu_use")} /></div>
      <div className="text-xs"><span className="text-muted">{t("ram")} </span><span className="tabular-nums">{s ? bytes(s.mem) : "–"}</span><Meter value={s?.mem ?? 0} max={s?.limit || 1} label={t("mem_use")} /></div>
      <div className="flex items-center gap-0.5 justify-self-end">
        {up ? <Btn kind="ghost" icon="stop" label={t("act_stop")} busy={busy} onClick={() => ctl(c, "stop")} /> : <Btn kind="ghost" icon="play" label={t("act_start")} busy={busy} onClick={() => ctl(c, "start")} />}
        <Btn kind="ghost" icon="restart" label={t("act_restart")} disabled={busy} onClick={() => ctl(c, "restart")} />
        <Btn kind="ghost" icon="logs" label={t("act_logs")} onClick={() => setLogs(c)} />
        {up && <Btn kind="ghost" icon="term" label={t("act_term")} onClick={() => setTerm(c)} />}
        <Btn kind="ghost" icon="chart" label={t("act_chart")} onClick={() => setChart(c)} />
        <Btn kind="ghost" icon="trash" label={t("delete")} disabled={busy} onClick={() => del(c)} />
      </div>
    </div>
  );
}

/* ================= Compose ================= */
type Common = { busy: Set<string>; run: (k: string, fn: () => Promise<unknown>, ok: string) => Promise<void>; confirm: ReturnType<typeof useUI>["confirm"] };
function ComposeView({ stacks, busy, run, confirm, setOutput, goTo }: Common & { stacks: Stack[] | null; setOutput: (o: { title: string; text: string }) => void; goTo: (n: string) => void }) {
  const { t } = useT();
  const act = (s: Stack, action: string, ok: string) =>
    run(`${s.name}:${action}`, async () => { const r = await post<{ output: string }>("/api/compose", { project: s.name, action }); setOutput({ title: `docker compose ${action} · ${s.name}`, text: r.output }); }, `${s.name}: ${ok}`);
  if (stacks === null) return <Loading label={t("loading")} />;
  if (!stacks.length) return <Empty icon="layers" title={t("cmp_empty")} hint={t("cmp_empty_hint")} />;
  return (
    <section aria-label={t("tab_compose")} className="space-y-3">
      {stacks.map((s) => {
        const manageable = s.files.length > 0, b = [...busy].some((k) => k.startsWith(s.name + ":"));
        return (
          <Card key={s.name} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.name} <Badge tone={s.running === s.containers ? "ok" : s.running ? "warn" : "muted"}>{t("cmp_active", { running: s.running, total: s.containers })}</Badge></p>
                <p className="truncate text-xs text-muted" title={s.dir}>{manageable ? s.dir : t("cmp_foreign")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Btn onClick={() => goTo(s.name)}>{t("cmp_view")}</Btn>
                {manageable && <>
                  <Btn icon="play" busy={b} onClick={() => act(s, "up", t("ok_started"))}>{t("act_start")}</Btn>
                  <Btn icon="restart" disabled={b} onClick={() => act(s, "restart", t("ok_restarted"))}>{t("act_restart")}</Btn>
                  <Btn icon="stop" disabled={b} onClick={() => act(s, "stop", t("ok_stopped"))}>{t("act_stop")}</Btn>
                  <Btn icon="download" disabled={b} onClick={() => act(s, "pull", t("cmp_ok_pull"))}>{t("cmp_pull")}</Btn>
                  <Btn kind="danger" icon="trash" disabled={b} onClick={async () => { if (await confirm({ title: t("cmp_down_title", { name: s.name }), body: t("cmp_down_body"), confirm: t("cmp_down_confirm"), danger: true })) act(s, "down", t("cmp_ok_down")); }}>{t("cmp_down")}</Btn>
                </>}
              </div>
            </div>
            <div className="mt-3"><Meter plain value={s.running} max={s.containers || 1} label={t("cmp_active_aria")} /></div>
          </Card>
        );
      })}
    </section>
  );
}

/* ================= Images ================= */
function ImagesView({ images, containers, busy, run, confirm, search, setSearch, searchRef }: Common & { images: Image[] | null; containers: Container[] | null; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement> }) {
  const { t, lang } = useT();
  const [ref, setRef] = useState(""), [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const inUse = (i: Image) => (containers ?? []).some((c) => i.tags.includes(c.image) || c.image === i.id || i.id.includes(c.image));
  const list = useMemo(() => (images ?? []).filter((i) => {
    const q = search.toLowerCase();
    return (!q || i.tags.join(" ").toLowerCase().includes(q) || i.id.includes(q)) && (filter === "all" || (filter === "used") === inUse(i));
  }).sort((a, b) => b.created - a.created), [images, containers, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (images ?? []).reduce((a, i) => a + i.size, 0);
  return (
    <section aria-label={t("tab_images")} className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = ref.trim(); if (r) run("pull", async () => { await post("/api/images", { ref: r }); setRef(""); }, t("img_pulled", { ref: r })); }}>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("img_pull_ph")} aria-label={t("img_pull_aria")} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted" />
        <Btn type="submit" kind="primary" icon="download" busy={busy.has("pull")} disabled={!ref.trim()}>{busy.has("pull") ? t("img_pulling") : t("img_pull")}</Btn>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder={t("search")} inputRef={searchRef} />
        <Chips value={filter} onChange={setFilter} options={[{ id: "all", label: t("i_all") }, { id: "used", label: t("i_used") }, { id: "unused", label: t("i_unused") }]} />
        <span className="ml-auto text-xs text-muted">{images ? t("img_count", { n: images.length, size: bytes(total) }) : ""}</span>
      </div>
      {images === null ? <Loading label={t("loading")} />
        : list.length === 0 ? <Empty icon="image" title={t("img_empty")} hint={t("img_empty_hint")} />
        : <Card className="divide-y divide-line overflow-hidden">{list.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={i.tags.join(", ")}>{i.tags[0] ?? <span className="text-muted">{t("untagged")}</span>}{i.tags.length > 1 && <span className="ml-1 text-xs text-muted">+{i.tags.length - 1}</span>}</p>
              <p className="text-xs text-muted">{t("img_meta", { id: i.id.replace("sha256:", "").slice(0, 12), size: bytes(i.size), ago: ago(i.created * 1000, lang) })}</p>
            </div>
            <Badge tone={inUse(i) ? "ok" : "muted"}>{inUse(i) ? t("i_used") : t("i_unused")}</Badge>
            <Btn kind="ghost" icon="trash" label={t("img_del_label")} busy={busy.has(i.id)} onClick={async () => { if (await confirm({ title: t("img_del_title"), body: t("img_del_body", { name: i.tags[0] ?? i.id.slice(7, 19), size: bytes(i.size) }), confirm: t("delete"), danger: true })) run(i.id, () => api(`/api/images?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }), t("img_deleted")); }} />
          </div>))}</Card>}
    </section>
  );
}

/* ================= Volumes ================= */
function VolumesView({ volumes, busy, run, confirm, search, setSearch, searchRef }: Common & { volumes: Volume[] | null; search: string; setSearch: (s: string) => void; searchRef: React.Ref<HTMLInputElement> }) {
  const { t } = useT();
  const list = (volumes ?? []).filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <section aria-label={t("tab_volumes")} className="space-y-4">
      <div className="flex items-center gap-2"><SearchBox value={search} onChange={setSearch} placeholder={t("search")} inputRef={searchRef} /><span className="ml-auto text-xs text-muted">{volumes ? t("vol_count", { n: volumes.length }) : ""}</span></div>
      {volumes === null ? <Loading label={t("loading")} />
        : list.length === 0 ? <Empty icon="disk" title={t("vol_empty")} />
        : <Card className="divide-y divide-line overflow-hidden">{list.map((v) => (
          <div key={v.name} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={v.name}>{isHash(v.name) ? <span className="font-mono">{v.name.slice(0, 12)}…</span> : v.name} {isHash(v.name) && <Badge tone="muted">{t("vol_anon")}</Badge>}</p>
              <p className="truncate text-xs text-muted" title={v.mountpoint}>{v.driver} · {v.mountpoint}</p>
            </div>
            <Btn kind="ghost" icon="trash" label={t("vol_del_label")} busy={busy.has(v.name)} onClick={async () => { if (await confirm({ title: t("vol_del_title"), body: t("vol_del_body", { name: isHash(v.name) ? v.name.slice(0, 12) : v.name }), confirm: t("vol_del_confirm"), danger: true })) run(v.name, () => api(`/api/volumes?name=${encodeURIComponent(v.name)}`, { method: "DELETE" }), t("vol_deleted")); }} />
          </div>))}</Card>}
    </section>
  );
}

/* ================= Networks ================= */
function NetworksView({ networks, busy, run, confirm }: Common & { networks: Network[] | null }) {
  const { t } = useT();
  const [name, setName] = useState("");
  return (
    <section aria-label={t("tab_networks")} className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) run("net", async () => { await post("/api/networks", { name: n }); setName(""); }, t("net_created", { name: n })); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("net_ph")} aria-label={t("net_aria")} pattern="[\w.\-]{1,64}" title={t("net_pattern")} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted" />
        <Btn type="submit" kind="primary" icon="plus" busy={busy.has("net")} disabled={!name.trim()}>{t("net_create")}</Btn>
      </form>
      {networks === null ? <Loading label={t("loading")} />
        : <Card className="divide-y divide-line overflow-hidden">{networks.map((n) => (
          <div key={n.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{n.name} <span className="text-xs font-normal text-muted">{n.driver} · {n.subnet ?? t("net_nosubnet")}</span> {n.builtin && <Badge tone="muted">{t("net_system")}</Badge>}</p>
              <p className="mt-0.5 flex flex-wrap gap-1">{n.containers.length ? n.containers.map((c) => <span key={c} className="rounded bg-surface2 px-1.5 py-0.5 text-xs">{c}</span>) : <span className="text-xs text-muted">{t("net_none")}</span>}</p>
            </div>
            {!n.builtin && <Btn kind="ghost" icon="trash" label={t("net_del_label")} busy={busy.has(n.id)} onClick={async () => { if (await confirm({ title: t("net_del_title", { name: n.name }), body: t("net_del_body"), confirm: t("delete"), danger: true })) run(n.id, () => api(`/api/networks?id=${n.id}`, { method: "DELETE" }), t("net_deleted")); }} />}
          </div>))}</Card>}
    </section>
  );
}

/* ================= Events ================= */
function EventsView({ events, clear }: { events: Ev[]; clear: () => void }) {
  const { t, lang } = useT();
  const [type, setType] = useState<"all" | "container" | "image" | "network" | "volume">("all");
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 15000); return () => clearInterval(i); }, []);
  const list = events.filter((e) => type === "all" || e.type === type);
  const tone = (a: string) => (/die|kill|destroy|stop|delete|remove|oom|disconnect/.test(a) ? "text-bad" : /start|create|pull|connect|unpause/.test(a) ? "text-ok" : "text-warn");
  return (
    <section aria-label={t("tab_events")} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chips value={type} onChange={setType} options={[{ id: "all", label: t("ev_all") }, { id: "container", label: t("tab_containers") }, { id: "image", label: t("tab_images") }, { id: "network", label: t("tab_networks") }, { id: "volume", label: t("tab_volumes") }]} />
        <span className="ml-auto text-xs text-muted">{t("ev_count", { n: list.length })}</span>
        <Btn kind="ghost" icon="trash" onClick={clear}>{t("ev_clear")}</Btn>
      </div>
      {list.length === 0 ? <Empty icon="pulse" title={t("ev_empty")} hint={t("ev_empty_hint")} />
        : <Card className="divide-y divide-line overflow-hidden font-mono text-xs">{list.map((e, i) => (
          <div key={`${e.t}-${i}`} className="flex gap-3 px-4 py-2">
            <time className="w-20 shrink-0 text-muted" title={new Date(e.t).toLocaleString(lang)}>{new Date(e.t).toLocaleTimeString(lang)}</time>
            <span className="hidden w-20 shrink-0 text-muted sm:block">{e.type}</span>
            <span className={`w-24 shrink-0 font-semibold ${tone(e.action)}`}>{e.action}</span>
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="hidden text-muted md:block">{ago(e.t, lang)}</span>
          </div>))}</Card>}
    </section>
  );
}

/* ================= Help ================= */
function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const keys: [string, string][] = [[`1 – ${TABS.length}`, t("k_tabs")], ["/", t("k_search")], ["n", t("new_container")], ["r", t("k_refresh")], ["?", t("k_help")], ["Esc", t("k_esc")]];
  return (
    <Modal title={t("help_title")} onClose={onClose}>
      <dl className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        {keys.map(([k, d]) => <div key={k} className="contents"><dt><kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt><dd className="text-muted">{d}</dd></div>)}
      </dl>
      <p className="text-sm text-muted">{t("help_foot")}</p>
    </Modal>
  );
}
