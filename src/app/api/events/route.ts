import type { Readable } from "node:stream";
import { docker, guard } from "@/lib/docker";
export const dynamic = "force-dynamic";

const IGNORE = /^(exec_|health_status)/; // ruido: se disparan constantemente
const enc = new TextEncoder();

/** Eventos de Docker en vivo (SSE). Una conexión por pestaña; sin pestañas abiertas no hay conexión. */
export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  const since = Math.floor(Date.now() / 1000) - 600; // últimos 10 min al conectar
  const up = (await docker.getEvents({ since, filters: { type: ["container", "image", "network", "volume"] } })) as unknown as Readable;
  let buf = "";
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(": ok\n\n"));
      up.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l) continue;
          try {
            const e = JSON.parse(l);
            if (IGNORE.test(e.Action)) continue;
            const a = e.Actor?.Attributes ?? {};
            c.enqueue(enc.encode(`data: ${JSON.stringify({ t: e.timeNano ? Math.floor(e.timeNano / 1e6) : e.time * 1000, type: e.Type, action: e.Action, name: a.name ?? a.image ?? e.Actor?.ID?.slice(0, 12) ?? "" })}\n\n`));
          } catch { /* línea parcial */ }
        }
      });
      up.on("end", () => { try { c.close(); } catch {} });
      up.on("error", () => { try { c.close(); } catch {} });
      req.signal.addEventListener("abort", () => up.destroy());
    },
    cancel() { up.destroy(); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
}
