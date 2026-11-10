"use client";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

export default function Terminal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose = () => {};
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (!el.current) return;
      const term = new XTerm({ cursorBlink: true, fontSize: 13, theme: { background: "#09090b" } });
      const fit = new FitAddon();
      term.loadAddon(fit); term.open(el.current); fit.fit();
      const ws = new WebSocket(`ws://${location.host}/ws/exec?id=${id}`);
      const resize = () => { fit.fit(); if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); };
      ws.onopen = () => { resize(); term.focus(); };
      ws.onmessage = (e) => term.write(e.data);
      ws.onclose = () => term.write("\r\n\x1b[33m[sesión cerrada]\x1b[0m\r\n");
      term.onData((d) => ws.readyState === 1 && ws.send(JSON.stringify({ type: "input", data: d })));
      window.addEventListener("resize", resize);
      dispose = () => { window.removeEventListener("resize", resize); ws.close(); term.dispose(); };
    })();
    return () => dispose();
  }, [id]);
  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-black/80 p-6">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Terminal · {name}</h2>
        <button onClick={onClose} className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">Cerrar</button></div>
      <div ref={el} className="flex-1 overflow-hidden rounded bg-zinc-950 p-2" />
    </div>
  );
}
