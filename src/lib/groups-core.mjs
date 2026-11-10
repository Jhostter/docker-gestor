// Group (stack) actions with no I/O: validation and the order in which containers must be started or stopped.
// Compose records dependencies in the `com.docker.compose.depends_on` label ("db:service_healthy:false,cache:service_started:false").

export const ACTIONS = ["start", "stop", "restart", "remove"];
export const MAX_IDS = 200;
const ID = /^[a-f0-9]{12,64}$/;

export class BatchError extends Error { constructor(code) { super(code); this.code = code; } }

/** Validates what the browser asks for; throws BatchError("invalid_batch" | "empty_batch"). */
export function validateBatch(body) {
  const b = body ?? {};
  if (!ACTIONS.includes(b.action)) throw new BatchError("invalid_batch");
  if (!Array.isArray(b.ids) || b.ids.length > MAX_IDS || !b.ids.every((x) => typeof x === "string" && ID.test(x))) throw new BatchError("invalid_batch");
  const ids = [...new Set(b.ids)];
  if (!ids.length) throw new BatchError("empty_batch");
  return { action: b.action, ids };
}

/** "db:service_healthy:false,cache:service_started:false" -> ["db", "cache"] */
export function parseDependsOn(label) {
  return String(label ?? "").split(",").map((p) => p.split(":")[0].trim()).filter(Boolean);
}

/**
 * Groups container ids into layers that can run concurrently. Layers are in START order (dependencies first);
 * for stop and remove they are reversed (dependents first). Containers without Compose information, and
 * dependencies that are not part of the selection, impose no ordering. Cycles never block: the rest goes last.
 * @param containers [{ id, labels }]
 */
export function planLayers(containers, action) {
  const byService = new Map();
  const svc = (c) => c.labels?.["com.docker.compose.service"];
  for (const c of containers) { const s = svc(c); if (s) byService.set(s, [...(byService.get(s) ?? []), c]); }
  const deps = new Map(); // container id -> ids of the selected containers it must wait for
  for (const c of containers) {
    const wait = new Set();
    for (const d of parseDependsOn(c.labels?.["com.docker.compose.depends_on"])) for (const dep of byService.get(d) ?? []) if (dep.id !== c.id) wait.add(dep.id);
    deps.set(c.id, wait);
  }
  const layers = []; const placed = new Set(); let rest = containers.map((c) => c.id);
  while (rest.length) {
    const ready = rest.filter((id) => [...deps.get(id)].every((d) => placed.has(d)));
    const layer = ready.length ? ready : rest; // a cycle: take everything that is left
    layers.push(layer); layer.forEach((id) => placed.add(id)); rest = rest.filter((id) => !placed.has(id));
  }
  return action === "stop" || action === "remove" ? layers.reverse() : layers;
}
