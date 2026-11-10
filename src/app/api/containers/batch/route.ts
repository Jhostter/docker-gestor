import { docker, guard, json, fail } from "@/lib/docker";
import { BatchError, dependencyRequirements, planLayers, validateBatch, waitForDependency } from "@/lib/groups-core.mjs";

type Result = { id: string; name: string; ok: boolean; skipped?: boolean; error?: string; code?: string; vars?: Record<string, string | number> };

/** How long to wait for a dependency to become healthy (or to finish, for init containers). */
const WAIT_MS = Math.min(600, Math.max(1, Number(process.env.HEALTH_WAIT_SECONDS ?? 90) || 90)) * 1000;
const WHY: Record<string, (v: Record<string, string | number>) => string> = {
  dep_timeout: (v) => `waited ${v.seconds} s for '${v.dep}' to be ready, but it was not`,
  dep_unhealthy: (v) => `'${v.dep}' became unhealthy`,
  dep_exited: (v) => `'${v.dep}' stopped before it was ready`,
  dep_failed: (v) => `not started because '${v.dep}' failed`,
  dep_missing: (v) => `could not check '${v.dep}'`,
};

/**
 * Start / stop / restart / remove several containers at once (a stack, a group or a selection).
 * Works on the containers themselves, so it also covers groups that Compose cannot manage.
 * Containers run in layers that follow Compose's depends_on when it is available (reverse order to stop or remove).
 * When starting or restarting, a dependency declared as service_healthy (or service_completed_successfully) is waited for
 * before its dependents start; if it never gets ready, the dependents (and what depends on them) are NOT started.
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

    const items = targets.map((c) => ({ id: c.Id, labels: c.Labels }));
    const reqs = dependencyRequirements(items, all.map((c) => ({ id: c.Id, labels: c.Labels }))), waits = batch.action === "start" || batch.action === "restart";
    const failed = new Set<string>(); // containers that did not start: whoever depends on them must not start either
    const refuse = (id: string, code: string, vars: Record<string, string | number>): Result => ({ id, name: (byId.get(id)!.Names[0] ?? id).replace(/^\//, ""), ok: false, code, vars, error: WHY[code](vars) });

    for (const layer of planLayers(items, batch.action)) {
      const done = await Promise.all(layer.map(async (id): Promise<Result> => {
        if (waits) for (const r of reqs.get(id) ?? []) {
          if (failed.has(r.id)) return refuse(id, "dep_failed", { dep: r.service });
          if (r.condition === "service_started") continue;
          const w = await waitForDependency(r.condition, async () => (await docker.getContainer(r.id).inspect()).State, { timeoutMs: WAIT_MS });
          if (!w.ok) return refuse(id, w.code, { dep: r.service, seconds: Math.round(WAIT_MS / 1000) });
        }
        return act(id);
      }));
      for (const r of done) { results.push(r); if (!r.ok) failed.add(r.id); }
    }
    return json({ results });
  } catch (e) { return fail(e); }
}
