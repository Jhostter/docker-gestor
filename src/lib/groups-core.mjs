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
