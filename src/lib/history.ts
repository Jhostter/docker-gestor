import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { docker, snapshot, type Snap } from "./docker";
import { dataDir } from "./paths";

export const SAMPLE_MS = Number(process.env.SAMPLE_SECONDS ?? 15) * 1000;
const INTERVAL = SAMPLE_MS;
const RETENTION_MS = Number(process.env.RETENTION_DAYS ?? 7) * 864e5;
const g = globalThis as unknown as { __db?: DatabaseSync; __timer?: NodeJS.Timeout; __pruned?: number; __hooks?: ((s: Snap[]) => void)[] };
const ALERT_RETENTION_MS = 30 * 864e5;

export function db(): DatabaseSync {
  if (g.__db) return g.__db;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const d = new DatabaseSync(join(dir, "history.db"));
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-512;
    CREATE TABLE IF NOT EXISTS samples (ts INTEGER NOT NULL, name TEXT NOT NULL, cpu REAL NOT NULL, mem INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS samples_name_ts ON samples(name, ts);
    CREATE TABLE IF NOT EXISTS alerts (ts INTEGER NOT NULL, rule TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS alerts_ts ON alerts(ts);
    CREATE TABLE IF NOT EXISTS container_groups (name TEXT PRIMARY KEY, grp TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS container_groups_grp ON container_groups(grp);`);
  return (g.__db = d);
}

/** Other modules (alerts) subscribe to each usage sample without a second timer or a circular import. */
export function addSampleHook(fn: (s: Snap[]) => void) { (g.__hooks ??= []).push(fn); }
function runHooks(snaps: Snap[]) { for (const h of g.__hooks ?? []) { try { h(snaps); } catch { /* a faulty hook must not stop sampling */ } } }

export function recordAlert(ts: number, rule: string, name: string, message: string) {
  db().prepare("INSERT INTO alerts(ts,rule,name,message) VALUES (?,?,?,?)").run(ts, rule, name, message);
}
export function alertHistory(limit = 100) {
  return db().prepare("SELECT ts, rule, name, message FROM alerts ORDER BY ts DESC LIMIT ?").all(limit) as { ts: number; rule: string; name: string; message: string }[];
}

async function sample() {
  try {
    const running = await docker.listContainers();
    if (!running.length) { runHooks([]); return; }
    const snaps = await Promise.all(running.map(snapshot));
    runHooks(snaps);
    const d = db(), ts = Date.now();
    const ins = d.prepare("INSERT INTO samples(ts,name,cpu,mem) VALUES (?,?,?,?)");
    d.exec("BEGIN");
    for (const s of snaps) ins.run(ts, s.name, s.cpu, s.mem);
    d.exec("COMMIT");
    if (ts - (g.__pruned ?? 0) > 36e5) { // prune at most once per hour
      g.__pruned = ts;
      d.prepare("DELETE FROM samples WHERE ts < ?").run(ts - RETENTION_MS);
      d.prepare("DELETE FROM alerts WHERE ts < ?").run(ts - ALERT_RETENTION_MS);
    }
  } catch { /* Docker unavailable: retried on the next cycle */ }
}

export function startSampler() {
  if (g.__timer) return;
  g.__timer = setInterval(sample, INTERVAL);
  g.__timer.unref();
  sample();
}

export const RANGES: Record<string, number> = { "1h": 36e5, "24h": 864e5, "7d": 6048e5 };

/** Series aggregated into at most ~240 points, computed by SQLite. */
export function series(name: string, range: string) {
  const span = RANGES[range] ?? RANGES["1h"];
  const bucket = Math.max(Math.floor(span / 240), INTERVAL);
  return db().prepare(
    `SELECT (ts/?1)*?1 AS t, AVG(cpu) AS cpu, AVG(mem) AS mem FROM samples WHERE name=?2 AND ts>=?3 GROUP BY ts/?1 ORDER BY t`,
  ).all(bucket, name, Date.now() - span) as { t: number; cpu: number; mem: number }[];
}
