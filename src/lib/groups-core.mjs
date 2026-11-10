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
  const byService = serviceIndex(containers);
  const deps = new Map(); // container id -> ids of the selected containers it must wait for
  for (const c of containers) {
    const wait = new Set();
    for (const d of parseDependsOn(c.labels?.["com.docker.compose.depends_on"])) for (const dep of byService.get(serviceKey(c, d)) ?? []) if (dep.id !== c.id) wait.add(dep.id);
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

/** Service names are only unique inside a Compose project: two stacks may both have a "db". */
const PROJECT = "com.docker.compose.project";
const serviceKey = (c, service) => `${c.labels?.[PROJECT] ?? ""}\u0000${service}`;
function serviceIndex(list) {
  const m = new Map();
  for (const c of list) { const s = c.labels?.["com.docker.compose.service"]; if (s) { const k = serviceKey(c, s); m.set(k, [...(m.get(k) ?? []), c]); } }
  return m;
}

/* ---------- custom groups ---------- */
export const MAX_GROUPS = 50;
export const MAX_GROUP_NAME = 40;
const CONTAINER_NAME = /^[A-Za-z0-9][\w.-]{0,254}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Trims and validates a group name (1-40 characters, no control characters). Throws BatchError("invalid_group"). */
export function validateGroupName(name) {
  if (typeof name !== "string") throw new BatchError("invalid_group");
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || n.length > MAX_GROUP_NAME || CONTROL.test(n)) throw new BatchError("invalid_group");
  return n;
}

/**
 * One operation on custom groups. Exactly one of:
 *   { names: [containerName...], group: "name" | null }   assign (null removes them from their group)
 *   { rename: { from, to } }
 *   { dissolve: "name" }
 */
export function validateGroupOp(body) {
  const b = body ?? {};
  const kinds = ["names", "rename", "dissolve"].filter((k) => b[k] !== undefined);
  if (kinds.length !== 1) throw new BatchError("invalid_group_op");
  if (kinds[0] === "names") {
    if (!Array.isArray(b.names) || !b.names.length || b.names.length > MAX_IDS || !b.names.every((x) => typeof x === "string" && CONTAINER_NAME.test(x))) throw new BatchError("invalid_group_op");
    return { kind: "assign", names: [...new Set(b.names)], group: b.group === null ? null : validateGroupName(b.group) };
  }
  if (kinds[0] === "rename") return { kind: "rename", from: validateGroupName(b.rename?.from), to: validateGroupName(b.rename?.to) };
  return { kind: "dissolve", group: validateGroupName(b.dissolve) };
}

/** Case-insensitive lookup so "Frontend" and "frontend" are the same group; returns the existing spelling or the given name. */
export function canonicalGroup(name, existing) {
  const hit = [...existing].find((g) => g.toLowerCase() === name.toLowerCase());
  return hit ?? name;
}

/**
 * What moving `names` into `group` (or out of every group, with null) does to the assignments, with no I/O.
 * Used for the instant on-screen update while drag and drop talks to the server.
 * @returns { next: new assignments, moved: names that actually change, group: the spelling that will be used }
 */
export function planMove(assignments, names, group) {
  const target = group === null ? null : canonicalGroup(String(group).trim(), new Set(Object.values(assignments)));
  const next = { ...assignments }, moved = [];
  for (const n of new Set(names)) {
    if (target === null) { if (n in next) { delete next[n]; moved.push(n); } }
    else if (next[n] !== target) { next[n] = target; moved.push(n); }
  }
  return { next, moved, group: target };
}

/* ---------- waiting for dependencies (Compose depends_on conditions) ---------- */

/** "db:service_healthy:false,job:service_completed_successfully:false" -> [{ service, condition }] (default: service_started) */
export function parseDependencies(label) {
  return String(label ?? "").split(",").map((p) => p.split(":").map((x) => x.trim())).filter((p) => p[0]).map(([service, condition]) => ({ service, condition: condition || "service_started" }));
}

/**
 * For each container, the containers it must wait for and under which condition. Dependencies are looked up in
 * `universe` (every container, so one outside the selection is waited for too) but only inside the same Compose
 * project. Self-references are ignored.
 * @returns Map<id, [{ id, service, condition }]>
 */
export function dependencyRequirements(containers, universe = containers) {
  const byService = serviceIndex(universe);
  const out = new Map();
  for (const c of containers) {
    const reqs = [];
    for (const d of parseDependencies(c.labels?.["com.docker.compose.depends_on"])) for (const dep of byService.get(serviceKey(c, d.service)) ?? []) if (dep.id !== c.id) reqs.push({ id: dep.id, service: d.service, condition: d.condition });
    out.set(c.id, reqs);
  }
  return out;
}

/**
 * Is a dependency ready, still to wait for, or hopeless? `state` is the `State` block of its docker inspect.
 * A dependency with no health check is not waited for (there is nothing to wait for).
 * @returns { state: "ready" } | { state: "wait" } | { state: "fail", code: "dep_unhealthy" | "dep_exited" }
 */
export function evaluateDependency(condition, state) {
  const s = state ?? {};
  if (condition === "service_healthy") {
    if (!s.Running && !s.Restarting) return { state: "fail", code: "dep_exited" };
    const h = s.Health?.Status;
    if (h === undefined || h === "healthy") return { state: "ready" };
    return h === "unhealthy" ? { state: "fail", code: "dep_unhealthy" } : { state: "wait" };
  }
  if (condition === "service_completed_successfully") {
    if (s.Running || s.Restarting) return { state: "wait" };
    if (s.Status === "exited") return s.ExitCode === 0 ? { state: "ready" } : { state: "fail", code: "dep_exited" };
    return { state: "wait" }; // created: it has not run yet
  }
  return { state: "ready" }; // service_started and anything unknown
}

/**
 * Polls `check()` (returns the dependency's State) until it is ready, fails or the time runs out.
 * @returns { ok: true } | { ok: false, code: "dep_timeout" | "dep_unhealthy" | "dep_exited" | "dep_missing" }
 */
export async function waitForDependency(condition, check, { timeoutMs = 90000, intervalMs = 500, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const start = now();
  for (;;) {
    let r;
    try { r = evaluateDependency(condition, await check()); } catch { return { ok: false, code: "dep_missing" }; }
    if (r.state === "ready") return { ok: true };
    if (r.state === "fail") return { ok: false, code: r.code };
    if (now() - start >= timeoutMs) return { ok: false, code: "dep_timeout" };
    await sleep(intervalMs);
  }
}
