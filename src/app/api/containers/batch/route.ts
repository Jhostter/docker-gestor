import { docker, guard, json, fail } from "@/lib/docker";
import { BatchError, dependencyRequirements, planLayers, validateBatch, waitForDependency, type BatchAction } from "@/lib/groups-core.mjs";

type Vars = Record<string, string | number>;
type Result = { id: string; name: string; ok: boolean; skipped?: boolean; error?: string; code?: string; vars?: Vars };
type Ev =
  | { t: "plan"; action: BatchAction; layers: { id: string; name: string }[][] }
  | { t: "item"; id: string; name: string; state: "waiting" | "working" | "ok" | "skipped" | "failed"; dep?: string; waited?: number; max?: number; error?: string; code?: string; vars?: Vars }
  | { t: "done"; results: Result[]; cancelled: boolean }
  | { t: "error"; error: string };

/** How long to wait for a dependency to become healthy (or to finish, for init containers). */
const WAIT_MS = Math.min(600, Math.max(1, Number(process.env.HEALTH_WAIT_SECONDS ?? 90) || 90)) * 1000;
const WHY: Record<string, (v: Vars) => string> = {
  dep_timeout: (v) => `waited ${v.seconds} s for '${v.dep}' to be ready, but it was not`,
  dep_unhealthy: (v) => `'${v.dep}' became unhealthy`,
  dep_exited: (v) => `'${v.dep}' stopped before it was ready`,
  dep_failed: (v) => `not started because '${v.dep}' failed`,
  dep_missing: (v) => `could not check '${v.dep}'`,
};

/**
 * Runs the batch. `emit` receives progress events (ignored in plain JSON mode); `signal` cancels it: what is already
 * running finishes, but no further layer or container is started.
 */
async function runBatch(batch: { action: BatchAction; ids: string[] }, emit: (e: Ev) => void, signal: AbortSignal) {
  const all = await docker.listContainers({ all: true });
  const known = batch.ids.map((id) => ({ id, c: all.filter((x) => x.Id.startsWith(id)) }));
  const results: Result[] = known.filter((k) => k.c.length !== 1).map((k) => ({ id: k.id, name: k.id.slice(0, 12), ok: false, error: "container not found" }));
  for (const r of results) emit({ t: "item", id: r.id, name: r.name, state: "failed", error: r.error });
  const targets = known.filter((k) => k.c.length === 1).map((k) => k.c[0]);
  const byId = new Map(targets.map((c) => [c.Id, c]));
  const nameOf = (id: string) => (byId.get(id)!.Names[0] ?? id).replace(/^\//, "");

  const act = async (id: string): Promise<Result> => {
    const c = byId.get(id)!, name = nameOf(id), running = c.State === "running";
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
  const refuse = (id: string, code: string, vars: Vars): Result => ({ id, name: nameOf(id), ok: false, code, vars, error: WHY[code](vars) });
  const layers = planLayers(items, batch.action);
  emit({ t: "plan", action: batch.action, layers: layers.map((l) => l.map((id) => ({ id, name: nameOf(id) }))) });

  let cancelled = false;
  for (const layer of layers) {
    if (signal.aborted) { cancelled = true; break; }
    const done = await Promise.all(layer.map(async (id): Promise<Result> => {
      const name = nameOf(id);
      if (waits) for (const r of reqs.get(id) ?? []) {
        if (failed.has(r.id)) return refuse(id, "dep_failed", { dep: r.service });
        if (r.condition === "service_started") continue;
        const w = await waitForDependency(r.condition, async () => (await docker.getContainer(r.id).inspect()).State, {
          timeoutMs: WAIT_MS, signal, onWait: (ms) => emit({ t: "item", id, name, state: "waiting", dep: r.service, waited: Math.round(ms / 1000), max: Math.round(WAIT_MS / 1000) }),
        });
        if (!w.ok) return w.code === "cancelled" ? { id, name, ok: false, code: "cancelled", error: "cancelled" } : refuse(id, w.code, { dep: r.service, seconds: Math.round(WAIT_MS / 1000) });
      }
      if (signal.aborted) return { id, name, ok: false, code: "cancelled", error: "cancelled" };
      emit({ t: "item", id, name, state: "working" });
      return act(id);
    }));
    for (const r of done) {
      results.push(r);
      if (r.code === "cancelled") { cancelled = true; continue; }
      if (!r.ok) failed.add(r.id);
      emit({ t: "item", id: r.id, name: r.name, state: r.ok ? (r.skipped ? "skipped" : "ok") : "failed", error: r.error, code: r.code, vars: r.vars });
    }
  }
  return { results: results.filter((r) => r.code !== "cancelled"), cancelled };
}

/**
 * Start / stop / restart / remove several containers at once (a stack, a group or a selection).
 * Works on the containers themselves, so it also covers groups that Compose cannot manage.
 * Containers run in layers that follow Compose's depends_on when it is available (reverse order to stop or remove).
 * When starting or restarting, a dependency declared as service_healthy (or service_completed_successfully) is waited for
 * before its dependents start; if it never gets ready, the dependents (and what depends on them) are NOT started.
 *
 * With `?stream=1` the response is newline-delimited JSON progress events (plan, item..., done) and the request can be
 * cancelled by closing the connection. Without it, a single JSON `{ results }` as before.
 */
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  let batch;
  try { batch = validateBatch(await req.json().catch(() => null)); }
  catch (e) { const code = e instanceof BatchError ? e.code : "invalid_batch"; return json({ error: code, code }, 400); }

  if (new URL(req.url).searchParams.get("stream") !== "1") {
    try { return json({ results: (await runBatch(batch, () => {}, req.signal)).results }); } catch (e) { return fail(e); }
  }

  const enc = new TextEncoder(), ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());
  const stream = new ReadableStream({
    start(c) {
      const send = (e: Ev) => { try { c.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* the client went away */ } };
      runBatch(batch, send, ac.signal)
        .then(({ results, cancelled }) => send({ t: "done", results, cancelled }))
        .catch((e) => send({ t: "error", error: e instanceof Error ? e.message : String(e) }))
        .finally(() => { try { c.close(); } catch { /* already closed */ } });
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache, no-transform" } });
}
