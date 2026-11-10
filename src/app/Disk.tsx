"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiskReport } from "../lib/disk-core.mjs";
import { api, ago, bytes, post } from "./format";
import { useT, type Key } from "./i18n";
import { Badge, Btn, Card, Empty, Modal, Spinner, useUI } from "./ui";

type Report = DiskReport & { at: number };
type Result = { kind: "container" | "image" | "volume" | "buildCache"; ref: string; ok: boolean; error?: string };
type Row = { key: string; title: React.ReactNode; sub: string; size: number };
const isHash = (s: string) => /^[a-f0-9]{64}$/.test(s);
const pct = (part: number, total: number) => (total > 0 ? Math.floor((part / total) * 100) : 0); // floored, like docker system df

function Group({ title, hint, rows, selected, toggle, setAll, danger }: {
  title: string; hint: string; rows: Row[]; selected: Set<string>; toggle: (k: string) => void; setAll: (on: boolean) => void; danger?: boolean;
}) {
  const { t } = useT();
  const n = rows.filter((r) => selected.has(r.key)).length, all = rows.length > 0 && n === rows.length;
  return (
    <Card className={`overflow-hidden ${danger ? "border-bad/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <input type="checkbox" aria-label={t("dk_select_all")} checked={all} disabled={!rows.length} onChange={(e) => setAll(e.target.checked)} ref={(el) => { if (el) el.indeterminate = n > 0 && !all; }} />
        <div className="min-w-0 flex-1 basis-60"><p className="font-medium">{title} <span className="text-xs font-normal text-muted">{rows.length ? `· ${bytes(rows.reduce((a, r) => a + r.size, 0))}` : ""}</span></p><p className={`text-xs ${danger ? "text-bad" : "text-muted"}`}>{hint}</p></div>
        {rows.length > 0 && <span className="text-xs text-muted">{t("dk_selected_n", { n, total: rows.length })}</span>}
      </div>
      {rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("dk_none")}</p> : (
        <ul className="max-h-80 divide-y divide-line overflow-auto">
          {rows.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface2">
                <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span><span className="block truncate text-xs text-muted">{r.sub}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{t("dk_frees", { size: bytes(r.size) })}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DiskView() {
  const { t, lang } = useT();
  const { toast } = useUI();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({ containers: new Set<string>(), images: new Set<string>(), volumes: new Set<string>(), cache: false });
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Result[] | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    try {
      const r = await api<Report>(`/api/disk${fresh ? "?fresh=1" : ""}`);
      setReport(r);
      // Safe defaults only: untagged images and build cache. Containers, tagged images and volumes are opt-in.
      setSel({ containers: new Set(), images: new Set(r.candidates.images.filter((i) => i.dangling).map((i) => i.id)), volumes: new Set(), cache: !!r.candidates.buildCache });
    } catch (e) { toast("error", (e as Error).message); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(false); }, [load]);

  const c = report?.candidates;
  const groups = useMemo(() => c && ({
    cache: c.buildCache ? [{ key: "cache", title: t("dk_n_cache", { n: c.buildCache.count }), sub: "", size: c.buildCache.size }] : [],
    dangling: c.images.filter((i) => i.dangling).map((i) => ({ key: i.id, title: <span className="font-mono">{i.id.replace("sha256:", "").slice(0, 12)}</span>, sub: t("dk_age", { ago: ago(i.created * 1000, lang) }), size: i.size })),
    containers: c.containers.map((x) => ({ key: x.id, title: x.name, sub: `${x.image} · ${x.state} · ${t("dk_age", { ago: ago(x.created * 1000, lang) })}`, size: x.size })),
    unused: c.images.filter((i) => !i.dangling).map((i) => ({ key: i.id, title: i.tags[0] + (i.tags.length > 1 ? `  +${i.tags.length - 1}` : ""), sub: t("dk_age", { ago: ago(i.created * 1000, lang) }), size: i.size })),
    volumes: c.volumes.map((v) => ({ key: v.name, title: isHash(v.name) ? <span><span className="font-mono">{v.name.slice(0, 12)}…</span> <Badge tone="muted">{t("vol_anon")}</Badge></span> : v.name, sub: "", size: v.size })),
  }) as Record<string, Row[]>, [c, t, lang]);
  if (!report || !c || !groups) return loading ? <div className="flex items-center gap-2 py-10 text-muted"><Spinner />{t("dk_measuring")}</div> : <Empty icon="gauge" title={t("dk_none")} />;

  const toggleIn = (k: "containers" | "images" | "volumes") => (key: string) => setSel((s) => { const n = new Set(s[k]); if (n.has(key)) n.delete(key); else n.add(key); return { ...s, [k]: n }; });
  const setAllIn = (k: "containers" | "images" | "volumes", keys: string[]) => (on: boolean) => setSel((s) => { const n = new Set(s[k]); keys.forEach((x) => (on ? n.add(x) : n.delete(x))); return { ...s, [k]: n }; });
  const keysOf = (rows: Row[]) => rows.map((r) => r.key);
  const dangIds = new Set(keysOf(groups.dangling));
  const size = (rows: Row[], set: Set<string>) => rows.filter((r) => set.has(r.key)).reduce((a, r) => a + r.size, 0);
  const chosenImages = [...sel.images], chosenImageRows = [...groups.dangling, ...groups.unused].filter((r) => sel.images.has(r.key));
  const total = sel.containers.size + chosenImages.length + sel.volumes.size + (sel.cache ? 1 : 0);
  const bytesSel = size(groups.containers, sel.containers) + chosenImageRows.reduce((a, r) => a + r.size, 0) + size(groups.volumes, sel.volumes) + (sel.cache ? c.buildCache?.size ?? 0 : 0);
  const s = report.summary;
  const parts = [{ k: "images", label: t("tab_images"), v: s.images, cls: "bg-accent", sub: t("dk_n_images", { n: s.images.count }) },
    { k: "containers", label: t("tab_containers"), v: s.containers, cls: "bg-warn", sub: t("dk_n_containers", { n: s.containers.count, active: s.containers.active ?? 0 }) },
    { k: "volumes", label: t("tab_volumes"), v: s.volumes, cls: "bg-ok", sub: t("dk_n_volumes", { n: s.volumes.count }) },
    { k: "cache", label: t("dk_cache"), v: s.buildCache, cls: "bg-muted", sub: t("dk_n_cache", { n: s.buildCache.count }) }];

  const run = async () => {
    setBusy(true);
    try {
      const { results } = await post<{ results: Result[] }>("/api/disk/clean", { containers: [...sel.containers], images: chosenImages, volumes: [...sel.volumes], buildCache: sel.cache });
      const bad = results.filter((r) => !r.ok), ok = results.length - bad.length;
      toast(bad.length ? "error" : "ok", bad.length ? t("dk_done_part", { ok, failed: bad.length }) : t("dk_done_ok", { n: ok }));
      if (bad.length) setFailed(bad);
      setConfirming(false); setAck(false);
      await load(true);
    } catch (e) { toast("error", (e as Error).message); }
    setBusy(false);
  };

  return (
    <section aria-label={t("tab_disk")} className="space-y-4 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">{t("dk_intro")}</p>
        <Btn icon="restart" busy={loading} onClick={() => load(true)}>{t("dk_analyze")}</Btn>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold tabular-nums">{t("dk_using", { size: bytes(s.total) })}</p>
          <p className="text-sm text-muted">{t("dk_reclaim_total", { size: bytes(s.reclaimable) })}</p>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface2" role="img" aria-label={t("dk_using", { size: bytes(s.total) })}>
          {parts.map((p) => <div key={p.k} className={p.cls} style={{ width: `${pct(p.v.total, s.total)}%` }} title={`${p.label}: ${bytes(p.v.total)}`} />)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {parts.map((p) => (
            <div key={p.k}>
              <p className="flex items-center gap-1.5 text-xs text-muted"><span className={`size-2 rounded-full ${p.cls}`} />{p.label}</p>
              <p className="text-lg font-semibold tabular-nums">{bytes(p.v.total)}</p>
              <p className="text-xs text-muted">{p.sub}</p>
              <p className="text-xs text-accent">{t("dk_reclaimable", { size: bytes(p.v.reclaimable), pct: pct(p.v.reclaimable, p.v.total) })}</p>
            </div>
          ))}
        </div>
      </Card>

      <Group title={t("dk_g_cache")} hint={t("dk_g_cache_h")} rows={groups.cache} selected={sel.cache ? new Set(["cache"]) : new Set()} toggle={() => setSel((x) => ({ ...x, cache: !x.cache }))} setAll={(on) => setSel((x) => ({ ...x, cache: on }))} />
      <Group title={t("dk_g_dangling")} hint={t("dk_g_dangling_h")} rows={groups.dangling} selected={sel.images} toggle={toggleIn("images")} setAll={setAllIn("images", keysOf(groups.dangling))} />
      <Group title={t("dk_g_stopped")} hint={t("dk_g_stopped_h")} rows={groups.containers} selected={sel.containers} toggle={toggleIn("containers")} setAll={setAllIn("containers", keysOf(groups.containers))} />
      <Group title={t("dk_g_unused")} hint={t("dk_g_unused_h")} rows={groups.unused} selected={sel.images} toggle={toggleIn("images")} setAll={setAllIn("images", keysOf(groups.unused))} />
      <Group danger title={t("dk_g_volumes")} hint={t("dk_g_volumes_h")} rows={groups.volumes} selected={sel.volumes} toggle={toggleIn("volumes")} setAll={setAllIn("volumes", keysOf(groups.volumes))} />
      <p className="text-xs text-muted">{t("dk_estimate_note")}</p>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-2 pl-4 shadow-lg ring-1 ring-line">
          <span className="text-sm">{total ? t("dk_footer", { n: total, size: bytes(bytesSel) }) : t("dk_none")}</span>
          {total > 0 && <Btn kind="ghost" onClick={() => setSel({ containers: new Set(), images: new Set(), volumes: new Set(), cache: false })}>{t("dk_clear")}</Btn>}
          <Btn kind="danger" icon="trash" disabled={!total} onClick={() => { setAck(false); setConfirming(true); }}>{t("dk_clean")}</Btn>
        </div>
      </div>

      {confirming && (
        <Modal title={t("dk_confirm_title")} onClose={() => !busy && setConfirming(false)}>
          <p className="mb-2 text-sm text-muted">{t("dk_confirm_body")}</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
            {sel.containers.size > 0 && <li>{t("dk_i_containers", { n: sel.containers.size })}</li>}
            {chosenImages.length > 0 && <li>{t("dk_i_images", { n: chosenImages.length })}{chosenImages.filter((i) => !dangIds.has(i)).length > 0 && <span className="text-muted"> ({chosenImages.filter((i) => !dangIds.has(i)).length} {t("dk_g_unused").toLowerCase()})</span>}</li>}
            {sel.volumes.size > 0 && <li className="text-bad">{t("dk_i_volumes", { n: sel.volumes.size })}</li>}
            {sel.cache && <li>{t("dk_i_cache")}</li>}
          </ul>
          {sel.volumes.size > 0 && (
            <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-md border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />{t("dk_ack", { n: sel.volumes.size })}
            </label>
          )}
          <div className="flex justify-end gap-2"><Btn onClick={() => setConfirming(false)} disabled={busy}>{t("cancel")}</Btn><Btn kind="danger" icon="trash" busy={busy} disabled={sel.volumes.size > 0 && !ack} onClick={run}>{t("delete")}</Btn></div>
        </Modal>
      )}
      {failed && (
        <Modal wide title={t("dk_failed_title")} onClose={() => setFailed(null)}>
          <p className="mb-3 text-sm text-muted">{t("dk_failed_hint")}</p>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">{failed.map((f, i) => (
            <li key={i} className="px-3 py-2"><span className="text-xs text-muted">{t(`dk_k_${f.kind}` as Key)} · </span><span className="font-medium">{f.ref}</span><p className="text-xs text-bad">{f.error}</p></li>))}</ul>
        </Modal>
      )}
    </section>
  );
}
