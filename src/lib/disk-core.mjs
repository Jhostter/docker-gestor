// Disk usage analysis and cleanup validation with no I/O: it turns the output of Docker's /system/df into
// totals, "reclaimable" amounts (same formulas as `docker system df`) and the list of things that could be removed.

const size = (v) => (typeof v === "number" && v >= 0 ? v : 0);
const NONE = "<none>:<none>";
const RUNNING = new Set(["running", "restarting", "paused"]);

/** @param df the JSON returned by GET /system/df */
export function analyze(df) {
  const images = df?.Images ?? [], containers = df?.Containers ?? [], volumes = df?.Volumes ?? [], cache = df?.BuildCache ?? [];

  // Images: total is LayersSize (shared layers counted once); reclaimable is the exclusive size (Size - SharedSize) of the
  // unused ones, i.e. what removing them would really free. This matches `docker system df` (checked against a real daemon).
  const layers = size(df?.LayersSize);
  const imageCandidates = images
    .filter((i) => i.Containers === 0) // -1 means "unknown": never treated as unused
    .map((i) => {
      const tags = (i.RepoTags ?? []).filter((t) => t && t !== NONE);
      return { id: i.Id, tags, size: Math.max(0, size(i.Size) - size(i.SharedSize)), created: i.Created, dangling: tags.length === 0 };
    })
    .sort((a, b) => b.size - a.size);

  const stopped = containers.filter((c) => !RUNNING.has(c.State));
  const containerCandidates = stopped
    .map((c) => ({ id: c.Id, name: (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, ""), image: c.Image, state: c.State, size: size(c.SizeRw), created: c.Created }))
    .sort((a, b) => b.size - a.size);

  const volumeCandidates = volumes
    .filter((v) => v.UsageData && v.UsageData.RefCount === 0)
    .map((v) => ({ name: v.Name, size: size(v.UsageData.Size) }))
    .sort((a, b) => b.size - a.size);

  const cacheTotal = cache.reduce((a, c) => a + size(c.Size), 0);
  const cacheFree = cache.filter((c) => !c.InUse).reduce((a, c) => a + size(c.Size), 0);

  const summary = {
    images: { count: images.length, total: layers, reclaimable: imageCandidates.reduce((a, i) => a + i.size, 0) },
    containers: { count: containers.length, active: containers.length - stopped.length, total: containers.reduce((a, c) => a + size(c.SizeRw), 0), reclaimable: containerCandidates.reduce((a, c) => a + c.size, 0) },
    volumes: { count: volumes.length, total: volumes.reduce((a, v) => a + size(v.UsageData?.Size), 0), reclaimable: volumeCandidates.reduce((a, v) => a + v.size, 0) },
    buildCache: { count: cache.length, total: cacheTotal, reclaimable: cacheFree },
  };
  const parts = Object.values(summary);
  return {
    summary: { ...summary, total: parts.reduce((a, p) => a + p.total, 0), reclaimable: parts.reduce((a, p) => a + p.reclaimable, 0) },
    candidates: {
      containers: containerCandidates, images: imageCandidates, volumes: volumeCandidates,
      buildCache: cacheFree > 0 ? { size: cacheFree, count: cache.filter((c) => !c.InUse).length } : null,
    },
  };
}

export class SelectionError extends Error { constructor(code) { super(code); this.code = code; } }
const LIMIT = 500;
const RE = {
  container: /^[a-f0-9]{12,64}$/,
  image: /^(sha256:)?[a-f0-9]{12,64}$/,
  volume: /^[A-Za-z0-9][\w.-]{0,254}$/,
};

/** Validates what the browser asks to remove; throws SelectionError("invalid_selection") on anything unexpected. */
export function validateSelection(body) {
  const b = body ?? {};
  const list = (key, re) => {
    const v = b[key] ?? [];
    if (!Array.isArray(v) || v.length > LIMIT || !v.every((x) => typeof x === "string" && re.test(x))) throw new SelectionError("invalid_selection");
    return [...new Set(v)];
  };
  const sel = { containers: list("containers", RE.container), images: list("images", RE.image), volumes: list("volumes", RE.volume), buildCache: b.buildCache === true };
  if (!sel.containers.length && !sel.images.length && !sel.volumes.length && !sel.buildCache) throw new SelectionError("empty_selection");
  return sel;
}
