"use client";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { Modal } from "./ui";
import { useT } from "./i18n";

export default function Terminal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const { t } = useT();
  const el = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "connected" | "closed">("connecting");
  useEffect(() => {
    let dispose = () => {}, dead = false;
    const closedMsg = t("term_closed_msg");
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (dead || !el.current) return;
      const term = new XTerm({ cursorBlink: true, fontSize: 13, fontFamily: "ui-monospace, monospace", theme: { background: "#0b0b0e" } });
      const fit = new FitAddon();
      term.loadAddon(fit); term.open(el.current); fit.fit();
      const ws = new WebSocket(`ws://${location.host}/ws/exec?id=${id}`);
      const resize = () => { fit.fit(); if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); };
      ws.onopen = () => { setState("connected"); resize(); term.focus(); };
      ws.onmessage = (e) => term.write(e.data);
      ws.onclose = () => { setState("closed"); term.write(`\r\n\x1b[33m${closedMsg}\x1b[0m\r\n`); };
      term.onData((d) => ws.readyState === 1 && ws.send(JSON.stringify({ type: "input", data: d })));
      const ro = new ResizeObserver(resize); ro.observe(el.current);
      dispose = () => { ro.disconnect(); ws.close(); term.dispose(); };
    })();
    return () => { dead = true; dispose(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal full noEsc title={t("term_title", { name })} onClose={onClose}
      actions={<span className={`mr-2 text-xs ${state === "connected" ? "text-ok" : state === "closed" ? "text-bad" : "text-muted"}`}>● {t(`term_${state}` as "term_connected")}</span>}>
      <div ref={el} className="min-h-64 flex-1 overflow-hidden rounded-lg bg-bg p-2" />
      <p className="mt-2 text-xs text-muted">{t("term_note")}</p>
    </Modal>
  );
}
