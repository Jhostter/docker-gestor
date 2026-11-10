import { guard } from "@/lib/docker";
import { startAlerts, subscribe } from "@/lib/alerts";
export const dynamic = "force-dynamic";

/** New alerts for the browser channel (SSE). Only open while a tab with the UI is open. */
export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  const enc = new TextEncoder();
  let off = () => {};
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(": ok\n\n"));
      off = subscribe((a) => { try { c.enqueue(enc.encode(`data: ${JSON.stringify(a)}\n\n`)); } catch { off(); } });
      req.signal.addEventListener("abort", () => off());
    },
    cancel() { off(); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
}
