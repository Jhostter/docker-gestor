"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ago, isMutedNow, post, type Mute } from "./format";
import { useT, type Key } from "./i18n";
import { Badge, Btn, Card, Empty, Modal, Toggle, useUI } from "./ui";

type Common = { exclude: string[]; cooldownMinutes: number | null };
type Rules = {
  died: { enabled: boolean } & Common; oom: { enabled: boolean } & Common; unhealthy: { enabled: boolean } & Common;
  restartLoop: { enabled: boolean; count: number; minutes: number } & Common;
  cpu: { enabled: boolean; percent: number; minutes: number } & Common;
  memory: { enabled: boolean; percent: number; minutes: number } & Common;
};
export type { Mute };
type Chan = { ok?: number; error?: string };
export type AlertsPublic = {
  enabled: boolean; lang: "es" | "en"; rules: Rules; cooldownMinutes: number; recovery: boolean; mutes: Mute[]; watching: boolean;
  channels: { browser: { enabled: boolean }; telegram: { enabled: boolean; chatId: string; hasToken: boolean }; webhook: { enabled: boolean; url: string; format: "json" | "text"; hasAuth: boolean } };
  status: { telegram: Chan; webhook: Chan };
};
type Hist = { ts: number; rule: string; name: string; message: string };
// token / auth: null = keep what is stored, "" = remove it, text = replace it
type Draft = { enabled: boolean; rules: Rules; cooldownMinutes: number; recovery: boolean; browser: boolean; tg: { enabled: boolean; chatId: string; token: string | null }; wh: { enabled: boolean; url: string; format: "json" | "text"; auth: string | null } };

const fromCfg = (c: AlertsPublic): Draft => ({
  enabled: c.enabled, rules: structuredClone(c.rules), cooldownMinutes: c.cooldownMinutes, recovery: c.recovery, browser: c.channels.browser.enabled,
  tg: { enabled: c.channels.telegram.enabled, chatId: c.channels.telegram.chatId, token: null },
  wh: { enabled: c.channels.webhook.enabled, url: c.channels.webhook.url, format: c.channels.webhook.format, auth: null },
});
const toBody = (d: Draft) => ({
  enabled: d.enabled, rules: d.rules, cooldownMinutes: d.cooldownMinutes, recovery: d.recovery,
  channels: { browser: { enabled: d.browser }, telegram: { enabled: d.tg.enabled, chatId: d.tg.chatId, token: d.tg.token ?? undefined }, webhook: { enabled: d.wh.enabled, url: d.wh.url, format: d.wh.format, authorization: d.wh.auth ?? undefined } },
});
const field = "rounded-md border border-line bg-bg px-3 py-1.5 text-sm placeholder:text-muted";

function Num({ label, value, onChange, max = 1440 }: { label: string; value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <label className="text-xs text-muted">{label}
      <input type="number" min={1} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${field} mt-0.5 block w-20 text-fg`} />
    </label>
  );
}
/** Comma-separated names; keeps what you type (a trailing comma) while handing the parsed list upward. */
function Names({ value, onChange, label, placeholder }: { value: string[]; onChange: (v: string[]) => void; label: string; placeholder: string }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <label className="min-w-0 flex-1 basis-56 text-xs text-muted">{label}
      <input value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange([...new Set(e.target.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))]); }} className={`${field} mt-0.5 block w-full text-fg`} />
    </label>
  );
}
function RuleOpts({ r, set }: { r: Common; set: (p: Partial<Common>) => void }) {
  const { t } = useT();
  return (
    <div className="flex basis-full flex-wrap items-end gap-3 border-t border-dashed border-line pt-3 sm:pl-14">
      <Names value={r.exclude} onChange={(exclude) => set({ exclude })} label={t("al_exclude")} placeholder={t("al_exclude_ph")} />
      <label className="text-xs text-muted">{t("al_rule_cooldown")}
        <input type="number" min={0} max={1440} value={r.cooldownMinutes ?? ""} placeholder={t("al_rule_cooldown_ph")} onChange={(e) => set({ cooldownMinutes: e.target.value === "" ? null : Number(e.target.value) })} className={`${field} mt-0.5 block w-24 text-fg`} />
      </label>
    </div>
  );
}
function Row({ on, set, title, hint, children, opts }: { on: boolean; set: (v: boolean) => void; title: string; hint: string; children?: React.ReactNode; opts?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Toggle checked={on} onChange={set} label={title} />
      <div className="min-w-0 flex-1 basis-56"><p className="font-medium">{title}</p><p className="text-xs text-muted">{hint}</p></div>
      <div className={`flex gap-2 ${on ? "" : "pointer-events-none opacity-40"}`}>{children}</div>
      {on && opts}
    </div>
  );
}

export default function AlertsView({ cfg, reload, refreshKey }: { cfg: AlertsPublic | null; reload: () => Promise<void>; refreshKey: number }) {
  const { t, lang } = useT();
  const { toast } = useUI();
  const sig = cfg ? JSON.stringify({ ...cfg, lang: 0, status: 0, watching: 0, mutes: 0 }) : ""; // silences are applied at once, not part of the draft
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => { if (cfg) setDraft(fromCfg(cfg)); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  useEffect(() => { api<Hist[]>("/api/alerts/history").then(setHist).catch(() => setHist([])); }, [refreshKey]);

  const dirty = useMemo(() => !!cfg && !!draft && JSON.stringify(toBody(draft)) !== JSON.stringify(toBody(fromCfg(cfg))), [cfg, draft]);
  if (!cfg || !draft) return <div className="py-10 text-muted">{t("loading")}</div>;

  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const rule = <K extends keyof Rules>(k: K, patch: Partial<Rules[K]>) => up({ rules: { ...draft.rules, [k]: { ...draft.rules[k], ...patch } } });

  const save = async () => {
    setSaving(true);
    try { await api("/api/alerts/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...toBody(draft), lang }) }); toast("ok", t("al_saved")); await reload(); }
    catch (e) { toast("error", (e as Error).message); }
    setSaving(false);
  };
  const test = async (channel: "telegram" | "webhook") => {
    setTesting(channel);
    try { await post("/api/alerts/test", { channel }); toast("ok", t("al_test_ok")); } catch (e) { toast("error", (e as Error).message); }
    await reload(); setTesting(null);
  };
  const askPermission = async () => { try { setPerm(await Notification.requestPermission()); } catch { setPerm("denied"); } };
  const tgReady = (cfg.channels.telegram.hasToken && !!cfg.channels.telegram.chatId), whReady = !!cfg.channels.webhook.url;
  const statusLine = (s: Chan) => s.error ? <p className="text-xs text-bad">{t("al_last_error", { error: s.error })}</p> : s.ok ? <p className="text-xs text-ok">{t("al_last_ok", { ago: ago(s.ok, lang) })}</p> : null;
  const permText = { granted: t("al_perm_granted"), denied: t("al_perm_denied"), default: t("al_perm_default"), unsupported: t("al_perm_unsupported") }[perm];

  return (
    <section aria-label={t("tab_alerts")} className="space-y-4">
      <Card>
        <Row on={draft.enabled} set={(v) => up({ enabled: v })} title={t("al_enabled")} hint={t("al_enabled_hint")}>
          <Badge tone={cfg.watching ? "ok" : "muted"}>{cfg.watching ? t("al_watching") : t("al_off")}</Badge>
        </Row>
      </Card>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("al_rules")}</h3>
        <Card className="divide-y divide-line overflow-hidden">
          <Row on={draft.rules.died.enabled} set={(v) => rule("died", { enabled: v })} title={t("al_r_died")} hint={t("al_r_died_h")} opts={<RuleOpts r={draft.rules.died} set={(p) => rule("died", p)} />} />
          <Row on={draft.rules.oom.enabled} set={(v) => rule("oom", { enabled: v })} title={t("al_r_oom")} hint={t("al_r_oom_h")} opts={<RuleOpts r={draft.rules.oom} set={(p) => rule("oom", p)} />} />
          <Row on={draft.rules.unhealthy.enabled} set={(v) => rule("unhealthy", { enabled: v })} title={t("al_r_unhealthy")} hint={t("al_r_unhealthy_h")} opts={<RuleOpts r={draft.rules.unhealthy} set={(p) => rule("unhealthy", p)} />} />
          <Row on={draft.rules.restartLoop.enabled} set={(v) => rule("restartLoop", { enabled: v })} title={t("al_r_loop")} hint={t("al_r_loop_h")} opts={<RuleOpts r={draft.rules.restartLoop} set={(p) => rule("restartLoop", p)} />}>
            <Num label={t("al_f_count")} value={draft.rules.restartLoop.count} max={20} onChange={(n) => rule("restartLoop", { count: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.restartLoop.minutes} onChange={(n) => rule("restartLoop", { minutes: n })} />
          </Row>
          <Row on={draft.rules.cpu.enabled} set={(v) => rule("cpu", { enabled: v })} title={t("al_r_cpu")} hint={t("al_r_cpu_h")} opts={<RuleOpts r={draft.rules.cpu} set={(p) => rule("cpu", p)} />}>
            <Num label={t("al_f_percent")} value={draft.rules.cpu.percent} max={100} onChange={(n) => rule("cpu", { percent: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.cpu.minutes} onChange={(n) => rule("cpu", { minutes: n })} />
          </Row>
          <Row on={draft.rules.memory.enabled} set={(v) => rule("memory", { enabled: v })} title={t("al_r_mem")} hint={t("al_r_mem_h")} opts={<RuleOpts r={draft.rules.memory} set={(p) => rule("memory", p)} />}>
            <Num label={t("al_f_percent")} value={draft.rules.memory.percent} max={100} onChange={(n) => rule("memory", { percent: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.memory.minutes} onChange={(n) => rule("memory", { minutes: n })} />
          </Row>
          <Row on={draft.recovery} set={(v) => up({ recovery: v })} title={t("al_recovery")} hint={t("al_recovery_h")} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted">{t("al_cooldown")}</span>
            <input aria-label={t("al_cooldown")} type="number" min={0} max={1440} value={draft.cooldownMinutes} onChange={(e) => up({ cooldownMinutes: Number(e.target.value) })} className={`${field} w-20`} />
          </div>
        </Card>
      </div>

      <Mutes cfg={cfg} reload={reload} />

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("al_channels")}</h3>
        <Card className="divide-y divide-line overflow-hidden">
          <Row on={draft.browser} set={(v) => up({ browser: v })} title={t("al_browser")} hint={t("al_browser_h")}>
            <span className="self-center text-xs text-muted">{permText}</span>
            {perm === "default" && <Btn onClick={askPermission}>{t("al_perm_ask")}</Btn>}
          </Row>

          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center gap-3"><Toggle checked={draft.tg.enabled} onChange={(v) => up({ tg: { ...draft.tg, enabled: v } })} label={t("al_telegram")} /><div className="flex-1"><p className="font-medium">{t("al_telegram")}</p><p className="text-xs text-muted">{t("al_tg_hint")}</p></div>
              <Btn onClick={() => test("telegram")} busy={testing === "telegram"} disabled={dirty || !tgReady} label={dirty ? t("al_save_first") : !tgReady ? t("al_incomplete") : t("al_test")}>{t("al_test")}</Btn></div>
            <div className={`grid gap-2 sm:grid-cols-2 ${draft.tg.enabled ? "" : "opacity-60"}`}>
              <label className="text-xs text-muted">{t("al_tg_token")}
                <span className="mt-0.5 flex gap-1.5"><input type="password" autoComplete="off" value={draft.tg.token ?? ""} placeholder={cfg.channels.telegram.hasToken ? t("al_secret_saved") : "123456:ABC-DEF…"} onChange={(e) => up({ tg: { ...draft.tg, token: e.target.value } })} className={`${field} w-full text-fg`} />
                  {cfg.channels.telegram.hasToken && draft.tg.token === null && <Btn onClick={() => up({ tg: { ...draft.tg, token: "", enabled: false } })}>{t("al_remove_secret")}</Btn>}</span></label>
              <label className="text-xs text-muted">{t("al_tg_chat")}<input value={draft.tg.chatId} placeholder="123456789" onChange={(e) => up({ tg: { ...draft.tg, chatId: e.target.value } })} className={`${field} mt-0.5 block w-full text-fg`} /></label>
            </div>
            {statusLine(cfg.status.telegram)}
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center gap-3"><Toggle checked={draft.wh.enabled} onChange={(v) => up({ wh: { ...draft.wh, enabled: v } })} label={t("al_webhook")} /><div className="flex-1"><p className="font-medium">{t("al_webhook")}</p><p className="text-xs text-muted">{t("al_wh_hint")}</p></div>
              <Btn onClick={() => test("webhook")} busy={testing === "webhook"} disabled={dirty || !whReady} label={dirty ? t("al_save_first") : !whReady ? t("al_incomplete") : t("al_test")}>{t("al_test")}</Btn></div>
            <div className={`grid gap-2 sm:grid-cols-[1fr_9rem] ${draft.wh.enabled ? "" : "opacity-60"}`}>
              <label className="text-xs text-muted">{t("al_wh_url")}<input value={draft.wh.url} placeholder="https://…" onChange={(e) => up({ wh: { ...draft.wh, url: e.target.value } })} className={`${field} mt-0.5 block w-full text-fg`} /></label>
              <label className="text-xs text-muted">{t("al_wh_format")}<select value={draft.wh.format} onChange={(e) => up({ wh: { ...draft.wh, format: e.target.value as "json" | "text" } })} className={`${field} mt-0.5 block w-full text-fg`}><option value="json">{t("al_fmt_json")}</option><option value="text">{t("al_fmt_text")}</option></select></label>
              <label className="text-xs text-muted sm:col-span-2">{t("al_wh_auth")}
                <span className="mt-0.5 flex gap-1.5"><input type="password" autoComplete="off" value={draft.wh.auth ?? ""} placeholder={cfg.channels.webhook.hasAuth ? t("al_secret_saved") : "Bearer …"} onChange={(e) => up({ wh: { ...draft.wh, auth: e.target.value } })} className={`${field} w-full text-fg`} />
                  {cfg.channels.webhook.hasAuth && draft.wh.auth === null && <Btn onClick={() => up({ wh: { ...draft.wh, auth: "" } })}>{t("al_remove_secret")}</Btn>}</span></label>
            </div>
            {statusLine(cfg.status.webhook)}
          </div>
        </Card>
        <p className="mt-2 text-xs text-muted">{t("al_security")}</p>
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end"><div className="rounded-lg bg-surface p-1 shadow-lg ring-1 ring-line"><Btn kind="primary" onClick={save} busy={saving} disabled={!dirty}>{t("al_save")}</Btn></div></div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("al_history")}</h3>
        {hist === null ? null : hist.length === 0 ? <Empty icon="bell" title={t("al_history_empty")} />
          : <Card className="divide-y divide-line overflow-hidden">{hist.map((h, i) => (
            <div key={`${h.ts}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
              <time className="w-20 shrink-0 font-mono text-xs text-muted" title={new Date(h.ts).toLocaleString(lang)}>{new Date(h.ts).toLocaleTimeString(lang)}</time>
              <Badge tone={h.rule === "recovered" || h.rule === "back_up" || h.rule === "cpu_ok" || h.rule === "memory_ok" || h.rule === "test" ? "ok" : h.rule === "died" || h.rule === "oom" ? "bad" : "warn"}>{t(`al_b_${h.rule}` as Key)}</Badge>
              <span className="min-w-0 flex-1 truncate" title={h.message}>{h.message}</span>
              <span className="hidden text-xs text-muted md:block">{ago(h.ts, lang)}</span>
              {h.rule !== "test" && <Btn kind="ghost" icon="bell-off" label={t("al_h_mute", { name: h.name })} disabled={isMutedNow(cfg.mutes, h.name)} onClick={async () => { try { await post("/api/alerts/mute", { kind: "container", name: h.name, minutes: 60 }); toast("ok", t("mute_done", { name: h.name })); await reload(); } catch (e) { toast("error", (e as Error).message); } }} />}
            </div>))}</Card>}
      </div>
    </section>
  );
}

const untilText = (m: Mute, lang: string, t: ReturnType<typeof useT>["t"]) =>
  m.until === null ? t("al_mute_forever") : t("al_mute_until", { time: new Date(m.until).toLocaleString(lang, { dateStyle: m.until - Date.now() > 864e5 ? "short" : undefined, timeStyle: "short" }) });

/** The silences in force, with a form to add one by name. They take effect at once; they are not part of "Save". */
function Mutes({ cfg, reload }: { cfg: AlertsPublic; reload: () => Promise<void> }) {
  const { t, lang } = useT();
  const { toast } = useUI();
  const [kind, setKind] = useState<"container" | "stack" | "all">("container");
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState<string>("60");
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => { if (kind === "all") return; api<{ name: string; project?: string | null }[]>("/api/containers").then((l) => setKnown([...new Set(l.map((c) => (kind === "stack" ? c.project : c.name)).filter((x): x is string => !!x))])).catch(() => {}); }, [kind]);
  const active = cfg.mutes.filter((m) => m.until === null || m.until > Date.now());
  const add = async () => {
    const target = kind === "all" ? t("al_mute_everything") : name.trim();
    if (!target) return;
    try { await post("/api/alerts/mute", { kind, name: name.trim(), minutes: minutes === "" ? null : Number(minutes) }); setName(""); toast("ok", t("mute_done", { name: target })); await reload(); }
    catch (e) { toast("error", (e as Error).message); }
  };
  const lift = async (m: Mute) => {
    try { await api("/api/alerts/mute", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: m.kind, name: m.name }) }); toast("ok", t("unmute_done", { name: m.kind === "all" ? t("al_mute_everything") : m.name })); await reload(); }
    catch (e) { toast("error", (e as Error).message); }
  };
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("al_mutes")}</h3>
      <Card className="divide-y divide-line overflow-hidden">
        <p className="px-4 py-2 text-xs text-muted">{t("al_mutes_hint")}</p>
        {active.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("al_mutes_empty")}</p>
          : active.map((m) => (
            <div key={`${m.kind}:${m.name}`} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <Badge tone="muted">{t(m.kind === "stack" ? "al_mute_kind_stack" : m.kind === "all" ? "al_mute_kind_all" : "al_mute_kind_container")}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium" title={m.name}>{m.kind === "all" ? t("al_mute_everything") : m.name}</span>
              <span className="text-xs text-muted">{untilText(m, lang, t)}</span>
              <Btn onClick={() => lift(m)}>{t("al_unmute")}</Btn>
            </div>))}
        <form className="flex flex-wrap items-end gap-2 px-4 py-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <select aria-label={t("mute_scope")} value={kind} onChange={(e) => setKind(e.target.value as "container" | "stack" | "all")} className={`${field}`}><option value="container">{t("al_mute_kind_container")}</option><option value="stack">{t("al_mute_kind_stack")}</option><option value="all">{t("al_mute_kind_all")}</option></select>
          {kind === "all" ? <span className="min-w-0 flex-1 basis-48 self-center text-sm text-muted">{t("al_mute_all_hint")}</span>
            : <input aria-label={t("al_mute_name_ph")} list="mute-names" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("al_mute_name_ph")} maxLength={200} className={`${field} min-w-0 flex-1 basis-48`} />}
          <datalist id="mute-names">{known.map((n) => <option key={n} value={n} />)}</datalist>
          <select aria-label={t("mute_for")} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={field}><option value="60">{t("mute_1h")}</option><option value="480">{t("mute_8h")}</option><option value="1440">{t("mute_24h")}</option><option value="">{t("mute_forever")}</option></select>
          <Btn type="submit" kind="primary" disabled={kind !== "all" && !name.trim()}>{t("al_mute_add")}</Btn>
        </form>
      </Card>
    </div>
  );
}

/** Silence one container (or its whole stack) from the containers list. */
export function MuteDialog({ name, project, onClose, onDone }: { name: string; project?: string | null; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const { toast } = useUI();
  const [scope, setScope] = useState<"container" | "stack">("container");
  const [minutes, setMinutes] = useState<string>("60");
  const [busy, setBusy] = useState(false);
  const target = scope === "stack" && project ? project : name;
  const send = async () => {
    setBusy(true);
    try { await post("/api/alerts/mute", { kind: scope, name: target, minutes: minutes === "" ? null : Number(minutes) }); toast("ok", t("mute_done", { name: target })); onDone(); onClose(); }
    catch (e) { toast("error", (e as Error).message); setBusy(false); }
  };
  const opt = (v: string, label: string) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="mute-for" checked={minutes === v} onChange={() => setMinutes(v)} />{label}</label>;
  return (
    <Modal title={t("mute_title", { name })} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
        {project && (
          <fieldset className="space-y-1.5"><legend className="mb-1 text-sm font-medium">{t("mute_scope")}</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="mute-scope" checked={scope === "container"} onChange={() => setScope("container")} />{t("mute_this")}</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="mute-scope" checked={scope === "stack"} onChange={() => setScope("stack")} />{t("mute_stack", { stack: project })}</label>
          </fieldset>)}
        <fieldset className="space-y-1.5"><legend className="mb-1 text-sm font-medium">{t("mute_for")}</legend>
          {opt("60", t("mute_1h"))}{opt("480", t("mute_8h"))}{opt("1440", t("mute_24h"))}{opt("", t("mute_forever"))}
        </fieldset>
        <div className="flex justify-end gap-2"><Btn onClick={onClose} disabled={busy}>{t("cancel")}</Btn><Btn type="submit" kind="primary" busy={busy}>{t("mute_btn")}</Btn></div>
      </form>
    </Modal>
  );
}
