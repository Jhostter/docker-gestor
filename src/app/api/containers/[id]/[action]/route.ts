import { docker, guard, json, fail } from "@/lib/docker";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const g = guard(req); if (g) return g;
  const { id, action } = await ctx.params;
  if (!/^[a-f0-9]{12,64}$/.test(id)) return json({ error: "invalid id" }, 400);
  const c = docker.getContainer(id);
  try {
    if (action === "start") await c.start();
    else if (action === "stop") await c.stop();
    else if (action === "restart") await c.restart();
    else if (action === "remove") await c.remove({ force: true });
    else return json({ error: "unknown action" }, 400);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
