"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { highlight, rank } from "../lib/palette-core.mjs";
import { api } from "./format";
import { useT } from "./i18n";
import { Icon } from "./ui";

type C = { id: string; name: string; image: string; state: string };
type Entry = { id: string; label: string; hint?: string; keywords?: string[]; icon: string; section: "nav" | "action" | "container"; run: () => void };

export type PaletteProps = {
  tabs: { id: string; label: string; icon: string }[];
  onGo: (id: string) => void; onNew: () => void; onRefresh: () => void; onTheme: () => void; onLang: () => void; onHelp: () => void;
  onDetails: (c: C) => void; onLogs: (c: C) => void; onTerm: (c: C) => void; onToggle: (c: C) => void; onClose: () => void;
};

/** Ctrl/⌘+K: jump to any section, container or action from the keyboard. */
export default function Palette(p: PaletteProps) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [containers, setContainers] = useState<C[]>([]);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const listId = "palette-list";

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    api<C[]>("/api/containers").then(setContainers).catch(() => {});
    return () => prev?.focus?.();
  }, []);

  const close = p.onClose;
  const go = (fn: () => void) => () => { close(); fn(); };
  const all = useMemo<Entry[]>(() => {
    const nav = p.tabs.map((x) => ({ id: `nav:${x.id}`, label: t("pal_go", { tab: x.label }), keywords: [x.label], icon: x.icon, section: "nav" as const, run: go(() => p.onGo(x.id)) }));
    const act: Entry[] = [
      { id: "a:new", label: t("pal_new"), icon: "plus", section: "action", run: go(p.onNew) }, { id: "a:refresh", label: t("pal_refresh"), icon: "restart", section: "action", run: go(p.onRefresh) },
      { id: "a:theme", label: t("pal_theme"), keywords: ["dark", "light", "tema", "oscuro", "claro"], icon: "sun", section: "action", run: go(p.onTheme) },
      { id: "a:lang", label: t("pal_lang"), keywords: ["language", "idioma", "español", "english"], icon: "help", section: "action", run: go(p.onLang) },
      { id: "a:help", label: t("pal_help"), keywords: ["shortcuts", "atajos"], icon: "help", section: "action", run: go(p.onHelp) },
    ];
    const cs = containers.flatMap((c): Entry[] => [
      { id: `c:d:${c.id}`, label: t("pal_details", { name: c.name }), hint: c.image, icon: "info", section: "container", run: go(() => p.onDetails(c)) },
      { id: `c:l:${c.id}`, label: t("pal_logs", { name: c.name }), hint: c.image, icon: "logs", section: "container", run: go(() => p.onLogs(c)) },
      ...(c.state === "running" ? [{ id: `c:t:${c.id}`, label: t("pal_term", { name: c.name }), hint: c.image, icon: "term", section: "container" as const, run: go(() => p.onTerm(c)) }] : []),
      { id: `c:s:${c.id}`, label: t(c.state === "running" ? "pal_stop" : "pal_start", { name: c.name }), hint: c.image, icon: c.state === "running" ? "stop" : "play", section: "container", run: go(() => p.onToggle(c)) },
    ]);
    return [...nav, ...act, ...cs];
  }, [containers, p, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Without a query: sections and actions only (a list of every container action would be noise)
  const shown = useMemo(() => (q.trim() ? rank(q, all, 40) : all.filter((e) => e.section !== "container")), [q, all]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); shown[active]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const title = { nav: t("pal_sec_nav"), action: t("pal_sec_actions"), container: t("pal_sec_containers") };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label={t("pal_trigger")} onKeyDown={onKey} className="animate-pop flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="size-4 shrink-0 text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pal_placeholder")} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={shown[active] ? `pal-${active}` : undefined} className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted" />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <div ref={list} id={listId} role="listbox" className="overflow-auto p-1.5">
          {shown.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">{t("pal_empty")}</p>}
          {shown.map((e, i) => (
            <div key={e.id}>
              {!q.trim() && (i === 0 || shown[i - 1].section !== e.section) && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title[e.section]}</p>}
              <div id={`pal-${i}`} data-i={i} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={e.run}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-accent/15 text-fg" : ""}`}>
                <Icon name={e.icon} className={`size-4 shrink-0 ${i === active ? "text-accent" : "text-muted"}`} />
                <span className="min-w-0 flex-1 truncate">{highlight(e.label, q).map((s, k) => (s.hit ? <mark key={k} className="rounded-sm bg-accent/25 text-fg">{s.text}</mark> : <span key={k}>{s.text}</span>))}</span>
                {e.hint && <span className="hidden max-w-[40%] truncate text-xs text-muted sm:block">{e.hint}</span>}
              </div>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{t("pal_hint")}</p>
      </div>
    </div>
  );
}
