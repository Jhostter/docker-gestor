// Fills a history database with 7 days of plausible fictional usage for the demo containers.
//   DATA_DIR=/tmp/demo-data node scripts/demo/seed-history.mjs
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTAINERS, rnd } from "./data.mjs";

const dir = process.env.DATA_DIR; if (!dir) { console.error("set DATA_DIR"); process.exit(1); }
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(join(dir, "history.db"));
// Same schema as src/lib/history.ts
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS samples (ts INTEGER NOT NULL, name TEXT NOT NULL, cpu REAL NOT NULL, mem INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS samples_name_ts ON samples(name, ts);
  CREATE TABLE IF NOT EXISTS alerts (ts INTEGER NOT NULL, rule TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS alerts_ts ON alerts(ts);`);
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

// Alert settings (fake token and example URL: nothing is ever sent) and a short alert history
writeFileSync(join(dir, "alerts.json"), JSON.stringify({
  enabled: true, lang: "en", cooldownMinutes: 10,
  rules: { died: { enabled: true }, oom: { enabled: true }, unhealthy: { enabled: true }, restartLoop: { enabled: true, count: 3, minutes: 10 }, cpu: { enabled: true, percent: 90, minutes: 5 }, memory: { enabled: false, percent: 90, minutes: 2 } },
  channels: { browser: { enabled: true }, telegram: { enabled: true, token: "123456789:DEMO-not-a-real-token-000000", chatId: "123456789" }, webhook: { enabled: true, url: "https://hooks.example.com/docker", format: "json", authorization: "" } },
}, null, 2));
const ia = db.prepare("INSERT INTO alerts(ts,rule,name,message) VALUES (?,?,?,?)");
[[-26, "died", "shop-worker", "🔴 shop-worker exited with code 137"], [-25.9, "recovered", "shop-db", "🟢 shop-db is healthy again"], [-25.95, "unhealthy", "shop-db", "🟠 shop-db is unhealthy"],
 [-9, "cpu", "prometheus", "🟠 prometheus: CPU at 93% for 5+ min"], [-3.2, "oom", "mailpit", "🔴 mailpit was killed: out of memory"], [-3.1, "restartLoop", "mailpit", "🟠 mailpit crashed 3 times in 10 min"]]
  .forEach(([h, rule, name, msg]) => ia.run(now + h * 36e5, rule, name, `[demo-server] ${msg}`));
console.log("seeded", db.prepare("SELECT COUNT(*) n FROM samples").get().n, "samples");
