"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { sparkPoints } from "./metrics-core.mjs";
import { createPortal } from "react-dom";
import { useT } from "./i18n";

/* ---------- Icons (inline SVG, no dependencies) ---------- */
const P: Record<string, string> = {
  box: "M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 13v-8M3 8l9 5",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  image: "M4 5h16v14H4V5Zm0 11 4-4 3 3 4-5 5 6M9 9h.01",
  disk: "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5",
  db: "M12 3 4 7l8 4 8-4-8-4Zm-8 10 8 4 8-4M4 17l8 4 8-4",
  net: "M12 5v4m0 0H6v4m6-4h6v4M4 13h4v4H4v-4Zm12 0h4v4h-4v-4ZM10 3h4v4h-4V3Z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  play: "M7 4v16l13-8L7 4Z",
  stop: "M6 6h12v12H6z",
  restart: "M4 12a8 8 0 1 0 3-6.2M4 4v5h5",
  logs: "M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5",
  term: "m4 7 5 5-5 5m7 0h9",
  chart: "M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  search: "m21 21-4.3-4.3M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  download: "M12 4v12m0 0 4-4m-4 4-4-4M5 20h14",
  down: "M6 9l6 6 6-6",
  more: "M5 12h2M11 12h2M17 12h2",
  rows: "M4 9h16M4 15h16",
  grip: "M9 6h1.5M9 12h1.5M9 18h1.5M14 6h1.5M14 12h1.5M14 18h1.5",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  info: "M12 8h.01M11 12h1v4h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  gauge: "M12 14l4-4M3.34 17a10 10 0 1 1 17.32 0",
  "bell-off": "M13.7 21a2 2 0 0 1-3.4 0M17 17H3s3-2 3-9a6 6 0 0 1 .3-1.9M8.7 3.2A6 6 0 0 1 18 8c0 2.2.3 4 .8 5.4M2 2l20 20",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
};
export function Icon({ name, className = "size-4" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
export const Spinner = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-[spin_.8s_linear_infinite]`} fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
  </svg>
);

/* ---------- Buttons and small pieces ---------- */
type BtnProps = { children?: React.ReactNode; onClick?: () => void; icon?: string; label?: string; kind?: "default" | "primary" | "danger" | "ghost"; busy?: boolean; disabled?: boolean; type?: "button" | "submit" };
export function Btn({ children, onClick, icon, label, kind = "default", busy, disabled, type = "button" }: BtnProps) {
  const styles = {
    default: "bg-surface2 hover:bg-line text-fg",
    primary: "bg-accent text-accent-fg hover:brightness-110",
    danger: "bg-bad/15 text-bad hover:bg-bad/25",
    ghost: "text-muted hover:bg-surface2 hover:text-fg",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} aria-label={label} title={label}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${children ? "px-3 py-1.5" : "size-8"} ${styles}`}>
      {busy ? <Spinner /> : icon && <Icon name={icon} />}{children}
    </button>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}>
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? "left-[1.125rem]" : "left-0.5"}`} />
    </button>
  );
}
export const Badge = ({ tone, children }: { tone: "ok" | "bad" | "warn" | "muted"; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${{ ok: "bg-ok/15 text-ok", bad: "bg-bad/15 text-bad", warn: "bg-warn/15 text-warn", muted: "bg-surface2 text-muted" }[tone]}`}>
    <span className="size-1.5 rounded-full bg-current" />{children}
  </span>
);
export const Meter = ({ value, max = 100, label, plain }: { value: number; max?: number; label: string; plain?: boolean }) => {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="min-w-24" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2"><div className={`h-full rounded-full ${plain ? "bg-ok" : pct > 85 ? "bg-bad" : pct > 60 ? "bg-warn" : "bg-accent"}`} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
    </div>
  );
};
/** A tiny trend line for the last few minutes. `zoom` frames memory around its own range so small changes show. */
export const Spark = ({ values, label, zoom, className = "" }: { values: number[]; label: string; zoom?: boolean; className?: string }) => {
  const pts = sparkPoints(values, 64, 18, { zoom });
  if (!pts) return <span className="block h-[18px]" aria-hidden />;
  return (
    <svg role="img" aria-label={label} viewBox="0 0 64 18" preserveAspectRatio="none" className={`block h-[18px] w-full ${className}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
export const Empty = ({ icon, title, hint }: { icon: string; title: string; hint?: string }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center text-muted">
    <Icon name={icon} className="size-8 opacity-60" /><p className="font-medium text-fg">{title}</p>{hint && <p className="max-w-sm text-sm">{hint}</p>}
  </div>
);
export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>
);
export function SearchBox({ value, onChange, placeholder, inputRef }: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-md border border-line bg-surface py-2 pl-8 pr-3 text-sm placeholder:text-muted sm:w-64" />
    </label>
  );
}
export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex gap-1 rounded-md bg-surface2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`rounded px-2.5 py-1 text-xs font-medium ${value === o.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
          {o.label}{o.count !== undefined && <span className="ml-1 text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Accessible modal (Esc, click outside, focus) ---------- */
export function Modal({ title, onClose, children, wide, full, actions, noEsc }: { noEsc?: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; full?: boolean; actions?: React.ReactNode }) {
  const id = useId();
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !noEsc) { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [noEsc]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={`animate-pop flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-2xl outline-none ${full ? "h-full max-w-7xl" : wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="truncate font-semibold">{title}</h2>
          <div className="flex items-center gap-1">{actions}<Btn kind="ghost" icon="x" label={noEsc ? t("close") : t("close_esc")} onClick={onClose} /></div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Toasts and confirmations ---------- */
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
type ConfirmOpts = { title: string; body?: string; confirm?: string; danger?: boolean };
type PromptOpts = { title: string; label: string; value?: string; confirm?: string };
const Ctx = createContext<{ toast: (kind: Toast["kind"], text: string) => void; confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> } | null>(null);
export const useUI = () => useContext(Ctx)!;

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOpts & { done: (v: boolean) => void }) | null>(null);
  const [ask2, setAsk2] = useState<(PromptOpts & { done: (v: string | null) => void }) | null>(null);
  const [typed, setTyped] = useState("");
  const seq = useRef(0);
  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((done) => setAsk({ ...o, done })), []);
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((done) => { setTyped(o.value ?? ""); setAsk2({ ...o, done }); }), []);
  const close = (v: boolean) => { ask?.done(v); setAsk(null); };
  const closePrompt = (v: string | null) => { ask2?.done(v); setAsk2(null); };
  return (
    <Ctx.Provider value={{ toast, confirm, prompt }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((toastItem) => (
          <div key={toastItem.id} role={toastItem.kind === "error" ? "alert" : "status"} className={`animate-pop pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface p-3 text-sm shadow-lg ${toastItem.kind === "error" ? "border-bad/50" : toastItem.kind === "ok" ? "border-ok/50" : "border-line"}`}>
            <span className={`mt-1 size-2 shrink-0 rounded-full ${toastItem.kind === "error" ? "bg-bad" : toastItem.kind === "ok" ? "bg-ok" : "bg-accent"}`} />
            <span className="min-w-0 flex-1 break-words">{toastItem.text}</span>
            <button onClick={() => setToasts((l) => l.filter((x) => x.id !== toastItem.id))} aria-label={t("close_toast")} className="text-muted hover:text-fg"><Icon name="x" className="size-3.5" /></button>
          </div>
        ))}
      </div>
      {ask2 && (
        <Modal title={ask2.title} onClose={() => closePrompt(null)}>
          <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) closePrompt(typed.trim()); }}>
            <label className="block text-sm font-medium">{ask2.label}
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={80} className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm font-normal" />
            </label>
            <div className="mt-4 flex justify-end gap-2"><Btn onClick={() => closePrompt(null)}>{t("cancel")}</Btn><Btn type="submit" kind="primary" disabled={!typed.trim()}>{ask2.confirm ?? t("accept")}</Btn></div>
          </form>
        </Modal>
      )}
      {ask && (
        <Modal title={ask.title} onClose={() => close(false)}>
          {ask.body && <p className="mb-4 text-sm text-muted">{ask.body}</p>}
          <div className="flex justify-end gap-2"><Btn onClick={() => close(false)}>{t("cancel")}</Btn><Btn kind={ask.danger ? "danger" : "primary"} onClick={() => close(true)}>{ask.confirm ?? t("accept")}</Btn></div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

/* ---------- Loading skeletons ---------- */
export function ListSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="overflow-hidden rounded-xl border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 border-b border-line px-4 py-3 last:border-0">
          <div className="size-4 rounded bg-surface2" />
          <div className="min-w-0 flex-1 space-y-2"><div className="h-3.5 w-40 rounded bg-surface2" /><div className="h-3 w-64 max-w-full rounded bg-surface2/70" /></div>
          <div className="hidden h-6 w-24 rounded-full bg-surface2 md:block" /><div className="hidden h-3 w-16 rounded bg-surface2 md:block" /><div className="h-8 w-20 rounded bg-surface2" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Actions menu (accessible: roles, arrow keys, Esc, focus return) ---------- */
export type MenuItem = { id: string; label: string; icon?: string; danger?: boolean; disabled?: boolean; separatorBefore?: boolean; onSelect: () => void };
export function Menu({ label, items, icon = "more" }: { label: string; items: MenuItem[]; icon?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const show = () => {
    const r = btn.current!.getBoundingClientRect(), h = items.length * 36 + 12;
    setPos(r.bottom + h > innerHeight - 8 ? { bottom: innerHeight - r.top + 4, right: innerWidth - r.right } : { top: r.bottom + 4, right: innerWidth - r.right });
    setActive(enabled[0] ?? 0); setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: MouseEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const gone = () => setOpen(false);
    document.addEventListener("mousedown", away); window.addEventListener("resize", gone); window.addEventListener("scroll", gone, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", gone); window.removeEventListener("scroll", gone, true); };
  }, [open]);

  const move = (d: number) => { const at = enabled.indexOf(active); setActive(enabled[(at + d + enabled.length) % enabled.length]); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(enabled[0]); }
    else if (e.key === "End") { e.preventDefault(); setActive(enabled[enabled.length - 1]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const it = items[active]; if (it && !it.disabled) { setOpen(false); it.onSelect(); } }
  };

  return (
    <>
      <button ref={btn} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close(false) : show())} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); } }}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface2 hover:text-fg aria-expanded:bg-surface2 aria-expanded:text-fg"><Icon name={icon} /></button>
      {open && createPortal(
        <div ref={list} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKey} style={{ position: "fixed", ...pos }}
          className="animate-pop z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-xl outline-none">
          {items.map((it, i) => (
            <div key={it.id}>
              {it.separatorBefore && <div role="separator" className="my-1 border-t border-line" />}
              <button type="button" role="menuitem" disabled={it.disabled} tabIndex={-1} onMouseMove={() => !it.disabled && setActive(i)} onClick={() => { setOpen(false); it.onSelect(); }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm disabled:opacity-40 ${it.danger ? "text-bad" : ""} ${active === i ? (it.danger ? "bg-bad/15" : "bg-surface2") : ""}`}>
                {it.icon && <Icon name={it.icon} className="size-4 shrink-0" />}{it.label}
              </button>
            </div>
          ))}
        </div>, document.body)}
    </>
  );
}
