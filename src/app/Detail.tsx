"use client";
import { useEffect, useMemo, useState } from "react";
import type { Inspect } from "../lib/inspect-core.mjs";
import { api, ago, bytes } from "./format";
import { useT, type Key } from "./i18n";
import { Badge, Btn, Chips, Modal, Spinner, useUI } from "./ui";

type Tab = "overview" | "env" | "mounts" | "network" | "health" | "labels" | "raw";
const TABS: Tab[] = ["overview", "env", "mounts", "network", "health", "labels", "raw"];
const EXIT: Record<number, Key> = { 0: "dt_exit_0", 1: "dt_exit_1", 125: "dt_exit_125", 126: "dt_exit_126", 127: "dt_exit_127", 137: "dt_exit_137", 139: "dt_exit_139", 143: "dt_exit_143" };
const when = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) && t > 0 && !iso.startsWith("0001") ? t : null; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-sm">{children}</dd></div>;
}

export default function Detail({ id, name, onClose, onLogs, onTerminal, onChart }: { id: string; name: string; onClose: () => void; onLogs: () => void; onTerminal: () => void; onChart: () => void }) {
  const { t, lang } = useT();
  const { toast } = useUI();
  const [d, setD] = useState<Inspect | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api<Inspect>(`/api/containers/${id}/inspect`).then(setD).catch((e) => { toast("error", (e as Error).message); onClose(); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = async (n: string) => {
    setBusy(n);
    try { const r = await api<{ value: string }>(`/api/containers/${id}/env?name=${encodeURIComponent(n)}`); setShown((s) => ({ ...s, [n]: r.value })); }
    catch (e) { toast("error", (e as Error).message); }
    setBusy(null);
  };
  const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); toast("ok", t("dt_copied")); } catch { /* clipboard unavailable */ } };
  const env = useMemo(() => (d?.env ?? []).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())), [d, q]);

  const head = (
    <>
      <Btn kind="ghost" icon="logs" label={t("act_logs")} onClick={onLogs} />
      {d?.state.running && <Btn kind="ghost" icon="term" label={t("act_term")} onClick={onTerminal} />}
      <Btn kind="ghost" icon="chart" label={t("act_chart")} onClick={onChart} />
    </>
  );

  return (
    <Modal wide title={t("dt_title", { name })} onClose={onClose} actions={head}>
      {!d ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />{t("loading")}</div> : (
        <>
          <div className="mb-4 overflow-x-auto"><Chips value={tab} onChange={setTab} options={TABS.map((x) => ({ id: x, label: t(`dt_t_${x}` as Key) }))} /></div>

          {tab === "overview" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={d.state.running ? (d.health?.status === "unhealthy" ? "bad" : "ok") : "muted"}>{d.state.running ? t("badge_running") : t("badge_stopped")}</Badge>
                {d.health && <Badge tone={d.health.status === "healthy" ? "ok" : d.health.status === "unhealthy" ? "bad" : "warn"}>{t(`dt_health_${d.health.status}` as Key)}</Badge>}
                {d.state.oomKilled && <Badge tone="bad">{t("dt_f_oom")}</Badge>}
              </div>
              {!d.state.running && (
                <div className={`rounded-lg border p-3 text-sm ${d.state.oomKilled || d.state.exitCode > 1 ? "border-bad/40 bg-bad/10" : "border-line bg-surface2"}`}>
                  <p className="font-medium">{t("dt_f_exit")}: {d.state.exitCode} — {t(EXIT[d.state.exitCode] ?? "dt_exit_other", { code: d.state.exitCode })}</p>
                  {d.state.oomKilled && <p className="mt-1 text-bad">{t("dt_oom_hint")}</p>}
                  {d.state.error && <p className="mt-1 text-xs text-muted">{d.state.error}</p>}
                </div>
              )}
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label={t("dt_f_image")}>{d.image}</Field>
                <Field label={t("dt_f_imageid")}><span className="font-mono text-xs">{(d.imageId ?? "").replace("sha256:", "").slice(0, 12)}</span></Field>
                <Field label={t("dt_f_created")}>{when(d.created) ? `${new Date(when(d.created)!).toLocaleString(lang)} (${ago(when(d.created)!, lang)})` : t("dt_none")}</Field>
                <Field label={t("dt_f_started")}>{when(d.state.startedAt) ? ago(when(d.state.startedAt)!, lang) : t("dt_none")}</Field>
                {!d.state.running && <Field label={t("dt_f_finished")}>{when(d.state.finishedAt) ? ago(when(d.state.finishedAt)!, lang) : t("dt_none")}</Field>}
                <Field label={t("dt_f_restarts")}>{d.restartCount}</Field>
                <Field label={t("dt_f_policy")}>{d.restartPolicy.name}{d.restartPolicy.max ? ` (max ${d.restartPolicy.max})` : ""}</Field>
                <Field label={t("dt_f_limits")}>{[d.limits.memory && t("dt_lim_mem", { size: bytes(d.limits.memory) }), d.limits.nanoCpus && t("dt_lim_cpu", { n: (d.limits.nanoCpus / 1e9).toFixed(1) }), d.limits.pids && t("dt_lim_pids", { n: d.limits.pids })].filter(Boolean).join(" · ") || t("dt_lim_none")}</Field>
                <Field label={t("dt_f_user")}>{d.user || t("dt_root")}</Field>
                <Field label={t("dt_f_workdir")}>{d.workingDir || t("dt_none")}</Field>
                <Field label={t("dt_f_host")}><span className="font-mono text-xs">{d.hostname}</span></Field>
                <Field label={t("dt_f_platform")}>{d.platform || t("dt_none")}</Field>
                <div className="sm:col-span-2"><Field label={t("dt_f_cmd")}><code className="text-xs">{[d.path, ...d.args].filter(Boolean).join(" ") || t("dt_none")}</code></Field></div>
                {d.entrypoint.length > 0 && <div className="sm:col-span-2"><Field label={t("dt_f_entry")}><code className="text-xs">{d.entrypoint.join(" ")}</code></Field></div>}
              </dl>
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("dt_notable")}</h3>
                {d.flags.length === 0 ? <p className="text-sm text-muted">{t("dt_no_flags")}</p> : (
                  <ul className="space-y-1.5">{d.flags.map((f) => (
                    <li key={f.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${f.level === "danger" ? "border-bad/40 bg-bad/10" : "border-warn/40 bg-warn/10"}`}>
                      <span aria-hidden>{f.level === "danger" ? "⛔" : "⚠️"}</span><span>{t(`dt_flag_${f.id}` as Key, { mode: f.detail ?? "", caps: f.detail ?? "" })}</span>
                    </li>))}</ul>
                )}
              </div>
            </div>
          )}

          {tab === "env" && (
            <div className="space-y-3">
              <p className="text-xs text-muted">{t("dt_env_note")}</p>
              <div className="flex items-center gap-3">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dt_env_filter")} aria-label={t("dt_env_filter")} className="w-full max-w-xs rounded-md border border-line bg-bg px-3 py-1.5 text-sm placeholder:text-muted" />
                <span className="text-xs text-muted">{t("dt_env_count", { n: env.length })}</span>
              </div>
              {d.env.length === 0 ? <p className="text-sm text-muted">{t("dt_env_none")}</p> : (
                <ul className="divide-y divide-line rounded-lg border border-line">{env.map((e) => {
                  const v = e.secret ? shown[e.name] : (e.value ?? undefined);
                  return (
                    <li key={e.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="w-56 shrink-0 break-all font-mono text-xs font-medium">{e.name}</span>
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{v === undefined ? <span className="text-muted">••••••••</span> : v === "" ? <span className="text-muted">{t("dt_empty_value")}</span> : v}</span>
                      {e.secret && <Badge tone="warn">{t("dt_secret")}</Badge>}
                      {e.secret && (v === undefined
                        ? <Btn busy={busy === e.name} onClick={() => reveal(e.name)}>{t("dt_show")}</Btn>
                        : <Btn onClick={() => setShown((s) => { const n = { ...s }; delete n[e.name]; return n; })}>{t("dt_hide")}</Btn>)}
                      {v !== undefined && v !== "" && <Btn kind="ghost" onClick={() => copy(v)}>{t("dt_copy")}</Btn>}
                    </li>
                  );
                })}</ul>
              )}
            </div>
          )}

          {tab === "mounts" && (d.mounts.length === 0 ? <p className="text-sm text-muted">{t("dt_mounts_none")}</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line">{d.mounts.map((m, i) => (
              <li key={i} className="space-y-0.5 px-3 py-2 text-sm">
                <p className="flex flex-wrap items-center gap-2"><Badge tone="muted">{t(`dt_m_${m.type}` as Key)}</Badge><Badge tone={m.rw ? "ok" : "warn"}>{m.rw ? t("dt_rw") : t("dt_ro")}</Badge>{m.name && <span className="font-medium">{m.name}</span>}</p>
                <p className="break-all font-mono text-xs">{m.source} <span className="text-muted">→</span> {m.destination}</p>
              </li>))}</ul>
          ))}

          {tab === "network" && (
            <div className="space-y-5">
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("dt_ports")}</h3>
                {d.ports.length === 0 ? <p className="text-sm text-muted">{t("dt_ports_none")}</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line">{d.ports.map((p) => (
                    <li key={p.container} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-24 font-mono text-xs">{p.container}</span>
                      {p.host.length === 0 ? <span className="text-xs text-muted">{t("dt_port_exposed")}</span> : p.host.map((h) => (
                        /\/tcp$/.test(p.container) ? <a key={h.ip + h.port} href={`http://localhost:${h.port}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline">{h.ip}:{h.port} ↗</a> : <span key={h.ip + h.port} className="font-mono text-xs">{h.ip}:{h.port}</span>))}
                    </li>))}</ul>
                )}
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("dt_networks")}</h3>
                {d.networks.length === 0 ? <p className="text-sm text-muted">{t("dt_net_none")}</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line">{d.networks.map((n) => (
                    <li key={n.name} className="px-3 py-2 text-sm">
                      <p className="font-medium">{n.name}</p>
                      <p className="text-xs text-muted">{t("dt_net_ip")} <span className="font-mono text-fg">{n.ip || "—"}</span> · {t("dt_net_gw")} <span className="font-mono text-fg">{n.gateway || "—"}</span>{n.aliases.length > 0 && <> · {t("dt_net_alias")} <span className="text-fg">{n.aliases.join(", ")}</span></>}</p>
                    </li>))}</ul>
                )}
              </div>
            </div>
          )}

          {tab === "health" && (!d.health ? <p className="text-sm text-muted">{t("dt_health_none")}</p> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={d.health.status === "healthy" ? "ok" : d.health.status === "unhealthy" ? "bad" : "warn"}>{t(`dt_health_${d.health.status}` as Key)}</Badge>
                {d.health.failingStreak > 0 && <span className="text-sm text-bad">{t("dt_h_streak", { n: d.health.failingStreak })}</span>}
                <span className="text-sm text-muted">{t("dt_f_restarts")}: {d.restartCount}</span>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("dt_h_last")}</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">{d.health.log.map((l, i) => (
                <li key={i} className="space-y-0.5 px-3 py-2 text-sm">
                  <p className="flex items-center gap-2"><Badge tone={l.exitCode === 0 ? "ok" : "bad"}>{l.exitCode === 0 ? t("dt_h_ok") : t("dt_h_fail", { code: l.exitCode })}</Badge><span className="text-xs text-muted">{when(l.start) ? ago(when(l.start)!, lang) : ""}</span></p>
                  {l.output.trim() && <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted">{l.output.trim()}</pre>}
                </li>))}</ul>
            </div>
          ))}

          {tab === "labels" && (Object.keys(d.labels).length === 0 ? <p className="text-sm text-muted">{t("dt_labels_none")}</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line">{Object.entries(d.labels).sort().map(([k, v]) => (
              <li key={k} className="flex flex-wrap gap-x-3 px-3 py-2"><span className="break-all font-mono text-xs font-medium">{k}</span><span className="min-w-0 flex-1 break-all font-mono text-xs text-muted">{v}</span></li>))}</ul>
          ))}

          {tab === "raw" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">{t("dt_raw_note")}</p><Btn onClick={() => copy(JSON.stringify(d.raw, null, 2))}>{t("dt_raw_copy")}</Btn></div>
              <pre className="max-h-[55vh] overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs">{JSON.stringify(d.raw, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
