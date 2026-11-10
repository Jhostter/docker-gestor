// Pure helpers behind the usage figures of the Containers tab: rolling series for the sparklines, sorting and "who uses most".

/** Samples kept per container (the page polls every 10 s, so 30 = about five minutes). */
export const SERIES_LEN = 30;

export const emptySeries = () => ({ byId: {}, total: { cpu: [], mem: [] } });

/** Appends one /api/stats reply to the rolling series; containers that are gone drop out. */
export function pushSeries(prev, stats, max = SERIES_LEN) {
  const byId = {};
  for (const s of stats) {
    const p = prev.byId[s.id];
    byId[s.id] = { cpu: [...(p?.cpu ?? []), s.cpu].slice(-max), mem: [...(p?.mem ?? []), s.mem].slice(-max) };
  }
  const cpu = stats.reduce((a, s) => a + s.cpu, 0), mem = stats.reduce((a, s) => a + s.mem, 0);
  return { byId, total: { cpu: [...prev.total.cpu, cpu].slice(-max), mem: [...prev.total.mem, mem].slice(-max) } };
}

/** "default" keeps Docker's order; "name" is A→Z; "cpu" / "mem" put the biggest consumer first and the stopped ones last. */
export function sortContainers(list, stats, by) {
  if (by !== "name" && by !== "cpu" && by !== "mem") return list;
  const key = (c) => stats[c.id]?.[by];
  return [...list].sort((a, b) => {
    if (by === "name") return a.name.localeCompare(b.name);
    const x = key(a), y = key(b);
    if (x === undefined && y === undefined) return a.name.localeCompare(b.name);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return y - x || a.name.localeCompare(b.name);
  });
}

/** The container using the most of `key` ("cpu" | "mem"), or null when nothing is running or it is all zero. */
export function topConsumer(stats, key) {
  let best = null;
  for (const s of Object.values(stats)) if (s[key] > 0 && (!best || s[key] > best[key])) best = s;
  return best ? { name: best.name, value: best[key] } : null;
}

/** The machine's memory: containers without a limit report it as their limit, so the largest limit is the best estimate. */
export const hostMemory = (stats) => Object.values(stats).reduce((a, s) => Math.max(a, s.limit || 0), 0);

/**
 * SVG points for a sparkline. CPU scales from zero with a floor of 25 %, so a steady 7 % sits low instead of looking like 100 %;
 * memory (`zoom`) frames its own range so small changes are visible, and an almost-flat series is drawn in the middle.
 */
export function sparkPoints(values, w, h, { zoom = false } = {}) {
  if (values.length < 2) return "";
  const hi = Math.max(...values), lo = zoom ? Math.min(...values) : 0, top = zoom ? hi : Math.max(hi, 25);
  const span = top - lo, flat = zoom && span <= Math.max(hi, 1) * 0.02;
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(flat ? h / 2 : h - ((v - lo) / (span || 1)) * (h - 2) - 1).toFixed(1)}`).join(" ");
}
