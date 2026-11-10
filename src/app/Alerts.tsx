"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ago, post } from "./format";
import { useT, type Key } from "./i18n";
import { Badge, Btn, Card, Empty, Toggle, useUI } from "./ui";

type Rules = {
  died: { enabled: boolean }; oom: { enabled: boolean }; unhealthy: { enabled: boolean };
  restartLoop: { enabled: boolean; count: number; minutes: number };
  cpu: { enabled: boolean; percent: number; minutes: number };
  memory: { enabled: boolean; percent: number; minutes: number };
};
type Chan = { ok?: number; error?: string };
export type AlertsPublic = {
  enabled: boolean; lang: "es" | "en"; rules: Rules; cooldownMinutes: number; watching: boolean;
  channels: { browser: { enabled: boolean }; telegram: { enabled: boolean; chatId: string; hasToken: boolean }; webhook: { enabled: boolean; url: string; format: "json" | "text"; hasAuth: boolean } };
  status: { telegram: Chan; webhook: Chan };
};
type Hist = { ts: number; rule: string; name: string; message: string };
// token / auth: null = keep what is stored, "" = remove it, text = replace it
type Draft = { enabled: boolean; rules: Rules; cooldownMinutes: number; browser: boolean; tg: { enabled: boolean; chatId: string; token: string | null }; wh: { enabled: boolean; url: string; format: "json" | "text"; auth: string | null } };

const fromCfg = (c: AlertsPublic): Draft => ({
  enabled: c.enabled, rules: structuredClone(c.rules), cooldownMinutes: c.cooldownMinutes, browser: c.channels.browser.enabled,
  tg: { enabled: c.channels.telegram.enabled, chatId: c.channels.telegram.chatId, token: null },
  wh: { enabled: c.channels.webhook.enabled, url: c.channels.webhook.url, format: c.channels.webhook.format, auth: null },
});
const toBody = (d: Draft) => ({
  enabled: d.enabled, rules: d.rules, cooldownMinutes: d.cooldownMinutes,
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
function Row({ on, set, title, hint, children }: { on: boolean; set: (v: boolean) => void; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Toggle checked={on} onChange={set} label={title} />
      <div className="min-w-0 flex-1 basis-56"><p className="font-medium">{title}</p><p className="text-xs text-muted">{hint}</p></div>
      <div className={`flex gap-2 ${on ? "" : "pointer-events-none opacity-40"}`}>{children}</div>
    </div>
  );
}

export default function AlertsView({ cfg, reload, refreshKey }: { cfg: AlertsPublic | null; reload: () => Promise<void>; refreshKey: number }) {
  const { t, lang } = useT();
  const { toast } = useUI();
  const sig = cfg ? JSON.stringify({ ...cfg, lang: 0, status: 0, watching: 0 }) : "";
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
          <Row on={draft.rules.died.enabled} set={(v) => rule("died", { enabled: v })} title={t("al_r_died")} hint={t("al_r_died_h")} />
          <Row on={draft.rules.oom.enabled} set={(v) => rule("oom", { enabled: v })} title={t("al_r_oom")} hint={t("al_r_oom_h")} />
          <Row on={draft.rules.unhealthy.enabled} set={(v) => rule("unhealthy", { enabled: v })} title={t("al_r_unhealthy")} hint={t("al_r_unhealthy_h")} />
          <Row on={draft.rules.restartLoop.enabled} set={(v) => rule("restartLoop", { enabled: v })} title={t("al_r_loop")} hint={t("al_r_loop_h")}>
            <Num label={t("al_f_count")} value={draft.rules.restartLoop.count} max={20} onChange={(n) => rule("restartLoop", { count: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.restartLoop.minutes} onChange={(n) => rule("restartLoop", { minutes: n })} />
          </Row>
          <Row on={draft.rules.cpu.enabled} set={(v) => rule("cpu", { enabled: v })} title={t("al_r_cpu")} hint={t("al_r_cpu_h")}>
            <Num label={t("al_f_percent")} value={draft.rules.cpu.percent} max={100} onChange={(n) => rule("cpu", { percent: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.cpu.minutes} onChange={(n) => rule("cpu", { minutes: n })} />
          </Row>
          <Row on={draft.rules.memory.enabled} set={(v) => rule("memory", { enabled: v })} title={t("al_r_mem")} hint={t("al_r_mem_h")}>
            <Num label={t("al_f_percent")} value={draft.rules.memory.percent} max={100} onChange={(n) => rule("memory", { percent: n })} />
            <Num label={t("al_f_minutes")} value={draft.rules.memory.minutes} onChange={(n) => rule("memory", { minutes: n })} />
          </Row>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted">{t("al_cooldown")}</span>
            <input aria-label={t("al_cooldown")} type="number" min={0} max={1440} value={draft.cooldownMinutes} onChange={(e) => up({ cooldownMinutes: Number(e.target.value) })} className={`${field} w-20`} />
          </div>
        </Card>
      </div>

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
              <Badge tone={h.rule === "recovered" || h.rule === "test" ? "ok" : h.rule === "died" || h.rule === "oom" ? "bad" : "warn"}>{t(`al_b_${h.rule}` as Key)}</Badge>
              <span className="min-w-0 flex-1 truncate" title={h.message}>{h.message}</span>
              <span className="hidden text-xs text-muted md:block">{ago(h.ts, lang)}</span>
            </div>))}</Card>}
      </div>
    </section>
  );
}
