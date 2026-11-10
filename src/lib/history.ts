import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { docker, snapshot } from "./docker";

const INTERVAL = Number(process.env.SAMPLE_SECONDS ?? 15) * 1000;
const RETENTION_MS = Number(process.env.RETENTION_DAYS ?? 7) * 864e5;
const g = globalThis as unknown as { __db?: DatabaseSync; __timer?: NodeJS.Timeout; __pruned?: number };

/** Data folder per OS (honors XDG_DATA_HOME on Linux). */
function defaultDataDir() {
  const h = homedir();
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(h, "AppData", "Local"), "docker-gestor");
  if (process.platform === "darwin") return join(h, "Library", "Application Support", "docker-gestor");
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), "docker-gestor");
}

function db(): DatabaseSync {
  if (g.__db) return g.__db;
  const dir = process.env.DATA_DIR ?? defaultDataDir();
  mkdirSync(dir, { recursive: true });
  const d = new DatabaseSync(join(dir, "history.db"));
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-512;
    CREATE TABLE IF NOT EXISTS samples (ts INTEGER NOT NULL, name TEXT NOT NULL, cpu REAL NOT NULL, mem INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS samples_name_ts ON samples(name, ts);`);
  return (g.__db = d);
}

async function sample() {
  try {
    const running = await docker.listContainers();
    if (!running.length) return;
    const snaps = await Promise.all(running.map(snapshot));
    const d = db(), ts = Date.now();
    const ins = d.prepare("INSERT INTO samples(ts,name,cpu,mem) VALUES (?,?,?,?)");
    d.exec("BEGIN");
    for (const s of snaps) ins.run(ts, s.name, s.cpu, s.mem);
    d.exec("COMMIT");
    if (ts - (g.__pruned ?? 0) > 36e5) { // prune at most once per hour
      g.__pruned = ts;
      d.prepare("DELETE FROM samples WHERE ts < ?").run(ts - RETENTION_MS);
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
