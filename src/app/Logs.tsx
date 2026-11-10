"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Modal, SearchBox } from "./ui";
import { useT } from "./i18n";

const MAX = 2000;
const LEVEL = /\b(error|err|fatal|panic|exception|fail(ed)?)\b/i;
const WARN = /\b(warn(ing)?)\b/i;

export default function Logs({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const { t } = useT();
  const [lines, setLines] = useState<string[]>([]);
  const [live, setLive] = useState<"live" | "ended" | "off">("off");
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [ts, setTs] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/containers/${id}/logs`);
    let dropped = false;
    es.onopen = () => { setLive("live"); if (dropped) { setLines([]); dropped = false; } }; // on reconnect the tail is resent: clear first to avoid duplicates
    es.onerror = () => { dropped = true; setLive("off"); };
    es.addEventListener("end", () => { es.close(); setLive("ended"); });
    es.onmessage = (e) => setLines((l) => { const n = [...l, JSON.parse(e.data) as string]; return n.length > MAX ? n.slice(-MAX) : n; });
    return () => es.close();
  }, [id]);

  const shown = useMemo(() => {
    const f = dq.toLowerCase();
    return lines.filter((l) => !f || l.toLowerCase().includes(f)).map((l) => (ts ? l : l.replace(/^\S+Z /, "")));
  }, [lines, dq, ts]);

  useEffect(() => { if (follow) box.current?.scrollTo(0, box.current.scrollHeight); }, [shown, follow]);

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([shown.join("\n")], { type: "text/plain" }));
    a.download = `${name}.log`; a.click(); URL.revokeObjectURL(a.href);
  };
  const toggle = "flex items-center gap-1.5 text-xs text-muted select-none cursor-pointer";

  return (
    <Modal full title={t("logs_title", { name })} onClose={onClose}
      actions={<><Btn kind="ghost" icon="download" label={t("logs_download")} onClick={download} /><Btn kind="ghost" icon="trash" label={t("logs_clear")} onClick={() => setLines([])} /></>}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("logs_filter")} />
        <label className={toggle}><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />{t("logs_follow")}</label>
        <label className={toggle}><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />{t("logs_wrap")}</label>
        <label className={toggle}><input type="checkbox" checked={ts} onChange={(e) => setTs(e.target.checked)} />{t("logs_ts")}</label>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted"><span className={`size-2 rounded-full ${live === "live" ? "bg-ok" : live === "ended" ? "bg-muted" : "bg-bad"}`} />{live === "live" ? t("logs_live") : live === "ended" ? t("logs_ended") : t("logs_reconn")} · {dq ? t("logs_count_f", { shown: shown.length, total: lines.length }) : t("logs_count", { n: shown.length })}</span>
      </div>
      <div ref={box} onWheel={() => setFollow(false)} className={`min-h-64 flex-1 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
        {shown.length === 0 && <div className="text-muted">{lines.length ? t("logs_nomatch") : t("logs_waiting")}</div>}
        {shown.map((l, i) => <div key={i} className={LEVEL.test(l) ? "text-bad" : WARN.test(l) ? "text-warn" : ""}>{l}</div>)}
      </div>
    </Modal>
  );
}
