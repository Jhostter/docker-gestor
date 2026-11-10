import { docker, guard, json, fail } from "@/lib/docker";
import { BatchError, planLayers, validateBatch } from "@/lib/groups-core.mjs";

type Result = { id: string; name: string; ok: boolean; skipped?: boolean; error?: string };

/**
 * Start / stop / restart / remove several containers at once (a stack, a group or a selection).
 * Works on the containers themselves, so it also covers groups that Compose cannot manage.
 * Containers run in layers that follow Compose's depends_on when it is available (reverse order to stop or remove).
 */
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  let batch;
  try { batch = validateBatch(await req.json().catch(() => null)); }
  catch (e) { const code = e instanceof BatchError ? e.code : "invalid_batch"; return json({ error: code, code }, 400); }
  try {
    const all = await docker.listContainers({ all: true });
    const known = batch.ids.map((id) => ({ id, c: all.filter((x) => x.Id.startsWith(id)) }));
    const results: Result[] = known.filter((k) => k.c.length !== 1).map((k) => ({ id: k.id, name: k.id.slice(0, 12), ok: false, error: "container not found" }));
    const targets = known.filter((k) => k.c.length === 1).map((k) => k.c[0]);
    const byId = new Map(targets.map((c) => [c.Id, c]));

    const act = async (id: string): Promise<Result> => {
      const c = byId.get(id)!, name = (c.Names[0] ?? id).replace(/^\//, ""), running = c.State === "running";
      try {
        if (batch.action === "start") { if (running) return { id, name, ok: true, skipped: true }; await docker.getContainer(id).start(); }
        else if (batch.action === "stop") { if (!running) return { id, name, ok: true, skipped: true }; await docker.getContainer(id).stop(); }
        else if (batch.action === "restart") await docker.getContainer(id).restart();
        else await docker.getContainer(id).remove({ force: true });
        return { id, name, ok: true };
      } catch (e) { return { id, name, ok: false, error: e instanceof Error ? e.message : String(e) }; }
    };

    for (const layer of planLayers(targets.map((c) => ({ id: c.Id, labels: c.Labels })), batch.action)) results.push(...(await Promise.all(layer.map(act))));
    return json({ results });
  } catch (e) { return fail(e); }
}
