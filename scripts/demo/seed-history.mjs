// Fills a history database with 7 days of plausible fictional usage for the demo containers.
//   DATA_DIR=/tmp/demo-data node scripts/demo/seed-history.mjs
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CONTAINERS, rnd } from "./data.mjs";

const dir = process.env.DATA_DIR; if (!dir) { console.error("set DATA_DIR"); process.exit(1); }
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(join(dir, "history.db"));
// Same schema as src/lib/history.ts
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS samples (ts INTEGER NOT NULL, name TEXT NOT NULL, cpu REAL NOT NULL, mem INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS samples_name_ts ON samples(name, ts);`);
const ins = db.prepare("INSERT INTO samples(ts,name,cpu,mem) VALUES (?,?,?,?)");
const now = Date.now();
db.exec("BEGIN");
CONTAINERS.filter((c) => c.state === "running").forEach((c, ci) => {
  for (let ts = now - 7 * 864e5; ts < now; ts += ts > now - 36e5 ? 15e3 : 6e4) {
    const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    const daily = 0.65 + 0.35 * Math.sin(((h - 9) / 24) * Math.PI * 2);              // busier in the afternoon
    const spike = rnd(ts / 6e4 + ci * 97) > 0.997 ? 1.8 + rnd(ts) * 1.2 : 1;            // occasional burst
    const cpu = Math.max(0.05, c.cpu * daily * spike * (0.8 + 0.4 * rnd(ts / 1e4 + ci)));
    const age = ((ts - (now - 7 * 864e5)) % (36 * 36e5)) / (36 * 36e5);                 // slow leak, then a restart
    const mem = (c.mem * (0.82 + 0.28 * age) + 4 * rnd(ts / 3e4 + ci)) * 1048576;
    ins.run(ts, c.name, cpu, Math.round(mem));
  }
});
db.exec("COMMIT");
console.log("seeded", db.prepare("SELECT COUNT(*) n FROM samples").get().n, "samples");
