import { PassThrough } from "node:stream";
import { docker, guard, json } from "@/lib/docker";
export const dynamic = "force-dynamic";

/** Live logs over Server-Sent Events. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = guard(req); if (g) return g;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{12,64}$/.test(id)) return json({ error: "invalid id" }, 400);
  const enc = new TextEncoder();
  const c = docker.getContainer(id);
  let info, raw: NodeJS.ReadableStream & { destroy(): void };
  try {
    info = await c.inspect();
    raw = (await c.logs({ follow: true, stdout: true, stderr: true, tail: 200, timestamps: true })) as unknown as NodeJS.ReadableStream & { destroy(): void };
  } catch {
    // the container is gone or Docker is unreachable: end the stream (an HTTP error would make the browser retry forever)
    return new Response(enc.encode("event: end\ndata: 1\n\n"), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
  }
  let out: PassThrough | undefined;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": ok\n\n"));
      const send = (b: Buffer) => {
        for (const line of b.toString("utf8").split("\n")) if (line) controller.enqueue(enc.encode(`data: ${JSON.stringify(line)}\n\n`));
      };
      if (info.Config.Tty) raw.on("data", send);
      else {
        out = new PassThrough(); out.on("data", send);
        docker.modem.demuxStream(raw, out, out);
      }
      raw.on("end", () => { try { controller.enqueue(enc.encode("event: end\ndata: 1\n\n")); controller.close(); } catch {} });
      raw.on("error", () => { try { controller.close(); } catch {} });
      req.signal.addEventListener("abort", () => { raw.destroy(); out?.destroy(); });
    },
    cancel() { raw.destroy(); out?.destroy(); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
}
