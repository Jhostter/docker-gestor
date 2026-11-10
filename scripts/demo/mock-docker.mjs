// A tiny fake Docker Engine API with fictional data. It lets you try Docker Gestor (and regenerate the
// README screenshots) without a Docker daemon and without exposing real containers.
//   node scripts/demo/mock-docker.mjs /path/to/mock.sock       (then: DOCKER_SOCKET=/path/to/mock.sock npm start)
import http from "node:http";
import { rmSync } from "node:fs";
import { CONTAINERS, IMAGES, VOLUMES, NETWORKS, rnd } from "./data.mjs";

const sock = process.argv[2];
if (!sock) { console.error("usage: mock-docker.mjs <socket-path>"); process.exit(1); }
try { rmSync(sock); } catch { /* not there */ }

const state = CONTAINERS.map((c) => ({ ...c }));
const listeners = new Set();
const emit = (type, action, name, image = "", extra = {}) => {
  const t = Date.now(), line = JSON.stringify({ Type: type, Action: action, Actor: { ID: ctrId(name), Attributes: { name, image, ...extra } }, time: Math.floor(t / 1000), timeNano: t * 1e6 }) + "\n";
  listeners.forEach((w) => w.write(line));
};
const json = (res, data, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
const ctrId = (name) => state.find((c) => c.name === name)?.id ?? name;
const find = (idOrName) => state.find((c) => c.id.startsWith(idOrName) || c.name === idOrName);

const summary = (c) => ({
  Id: c.id, Names: [`/${c.name}`], Image: c.image, State: c.state, Status: c.status, Labels: c.labels,
  Ports: c.state === "running" ? c.ports.flatMap(([pub, priv]) => [{ IP: "0.0.0.0", PrivatePort: priv, PublicPort: pub, Type: "tcp" }, { IP: "::", PrivatePort: priv, PublicPort: pub, Type: "tcp" }]) : [],
});

function stats(c) {
  const k = Date.now() / 1000, wob = 0.75 + 0.5 * rnd(Math.floor(k / 4) + c.name.length);
  const sys = 2e9, online = 8, cpu = c.cpu * wob;
  return {
    cpu_stats: { cpu_usage: { total_usage: 5e9 + (cpu / 100 / online) * sys }, system_cpu_usage: 9e10 + sys, online_cpus: online },
    precpu_stats: { cpu_usage: { total_usage: 5e9 }, system_cpu_usage: 9e10 },
    memory_stats: { usage: (c.mem * wob * 0.1 + c.mem * 0.9 + 6) * 1048576, limit: 16474554368, stats: { inactive_file: 6 * 1048576 } },
  };
}

const LOG = {
  nginx: (i) => `172.20.0.${2 + (i % 9)} - - [10/Nov/2026:14:${String(i % 60).padStart(2, "0")}:07 +0000] "GET ${["/", "/products", "/cart", "/static/app.js", "/api/health"][i % 5]} HTTP/1.1" ${i % 17 === 0 ? 304 : 200} ${400 + ((i * 37) % 4000)} "-" "Mozilla/5.0"`,
  api: (i) => [`{"level":"info","msg":"GET /api/products 200","ms":${8 + (i * 7) % 40}}`, `{"level":"info","msg":"GET /api/cart 200","ms":${5 + (i * 3) % 20}}`, `{"level":"info","msg":"POST /api/orders 201","ms":${30 + (i * 11) % 90}}`, i % 23 === 0 ? `{"level":"warn","msg":"slow query on orders (212 ms)"}` : `{"level":"info","msg":"cache hit products:list"}`, i % 41 === 0 ? `{"level":"error","msg":"payment provider timeout, retrying (1/3)"}` : `{"level":"info","msg":"GET /api/health 200","ms":2}`][i % 5],
  postgres: (i) => [`LOG:  checkpoint starting: time`, `LOG:  checkpoint complete: wrote ${40 + (i % 90)} buffers (0.3%)`, `LOG:  connection received: host=172.20.0.3 port=${40000 + i}`, `LOG:  connection authorized: user=shop database=shop`, `LOG:  duration: ${(i % 9) + 0.4} ms  statement: SELECT * FROM products WHERE id = $1`][i % 5],
  redis: (i) => [`* 100 changes in 300 seconds. Saving...`, `* Background saving started by pid ${100 + i}`, `* DB saved on disk`, `* Background saving terminated with success`][i % 4],
  worker: (i) => [`{"level":"info","msg":"job email.send done","id":${1000 + i}}`, `{"level":"info","msg":"job inventory.sync done","id":${1000 + i}}`, `{"level":"info","msg":"queue idle"}`][i % 3],
};
const frame = (text) => { const b = Buffer.from(text + "\n"); const h = Buffer.alloc(8); h[0] = 1; h.writeUInt32BE(b.length, 4); return Buffer.concat([h, b]); };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname, m = req.method;
  let r;
  if (m === "GET" && p === "/containers/json") return json(res, state.filter((c) => u.searchParams.get("all") === "true" || c.state === "running").map(summary));
  if ((r = p.match(/^\/containers\/([^/]+)\/(json|stats|logs|start|stop|restart)$/))) {
    const c = find(r[1]); if (!c) return json(res, { message: "No such container" }, 404);
    if (r[2] === "json" && m === "GET") return json(res, { Id: c.id, Name: `/${c.name}`, Config: { Tty: false, Image: c.image }, State: { Running: c.state === "running" } });
    if (r[2] === "stats") return json(res, stats(c));
    if (r[2] === "logs") {
      res.writeHead(200, { "content-type": "application/vnd.docker.raw-stream" });
      const base0 = LOG[c.kind] ?? LOG.api;
      // sprinkle a warning and an error so the log colouring is visible in the demo
      const gen = c.kind === "api" ? (n) => (n % 13 === 4 ? `{"level":"warn","msg":"slow query on orders (${180 + (n % 7) * 12} ms)"}` : n % 29 === 7 ? `{"level":"error","msg":"payment provider timeout, retrying (1/3)"}` : base0(n)) : base0;
      let i = 40 + Math.floor(Date.now() / 1000) % 50;
      const line = () => `${new Date().toISOString().replace("Z", "123456Z")} ${gen(i++)}`;
      const base = Date.now() - 200 * 1500;
      for (let k = 0; k < 120; k++) res.write(frame(`${new Date(base + k * 1500).toISOString().replace("Z", "123456Z")} ${gen(i++)}`));
      const timer = setInterval(() => res.write(frame(line())), 1500);
      req.on("close", () => clearInterval(timer)); return;
    }
    if (m === "POST") {
      const was = c.state;
      if (r[2] === "stop") { c.state = "exited"; c.status = "Exited (143) just now"; emit("container", "die", c.name, c.image, { exitCode: "143" }); emit("container", "stop", c.name, c.image); } // exit code 143 like a real `docker stop` (SIGTERM)
      else { c.state = "running"; c.status = "Up a few seconds"; emit("container", r[2] === "restart" && was === "running" ? "restart" : "start", c.name, c.image); }
      res.writeHead(204); return res.end();
    }
  }
  if (m === "DELETE" && (r = p.match(/^\/containers\/([^/]+)$/))) { const i = state.findIndex((c) => c.id.startsWith(r[1])); if (i >= 0) { emit("container", "destroy", state[i].name, state[i].image); state.splice(i, 1); } res.writeHead(204); return res.end(); }
  if (m === "GET" && p === "/images/json") return json(res, IMAGES);
  if (m === "GET" && p === "/volumes") return json(res, { Volumes: VOLUMES, Warnings: null });
  if (m === "GET" && p === "/networks") return json(res, NETWORKS.map(({ members, ...n }) => n));
  if ((r = p.match(/^\/networks\/([^/]+)$/)) && m === "GET") {
    const n = NETWORKS.find((x) => x.Id.startsWith(r[1])); if (!n) return json(res, { message: "not found" }, 404);
    const { members, ...rest } = n;
    return json(res, { ...rest, Containers: Object.fromEntries(members.map((name) => [find(name)?.id ?? name, { Name: name }])) });
  }
  if (m === "GET" && p === "/events") {
    res.writeHead(200, { "content-type": "application/json" });
    const t = Date.now(), seed = [[-540, "container", "start", "mailpit"], [-480, "network", "connect", "bridge"], [-400, "container", "die", "old-experiment"], [-399, "container", "stop", "old-experiment"],
      [-300, "image", "pull", "node:22-alpine"], [-240, "container", "start", "shop-worker"], [-200, "network", "create", "monitoring_default"], [-120, "container", "restart", "shop-api"],
      [-60, "volume", "create", "mailpit_data"], [-30, "container", "start", "grafana"]];
    const since = Number(u.searchParams.get("since") ?? 0) * 1000;
    for (const [dt, type, action, name] of seed) { const ms = t + dt * 1000; if (ms < since) continue; res.write(JSON.stringify({ Type: type, Action: action, Actor: { ID: name, Attributes: { name } }, time: Math.floor(ms / 1000), timeNano: ms * 1e6 }) + "\n"); }
    listeners.add(res); req.on("close", () => listeners.delete(res)); return;
  }
  if (m === "POST" && (r = p.match(/^\/_demo\/(crash|oom|unhealthy|healthy)\/([^/]+)$/))) {
    // Fault injection for demos and the alerts end-to-end test; it does not exist in the real Docker API.
    const c = find(r[2]); if (!c) return json(res, { message: "No such container" }, 404);
    if (r[1] === "crash") { c.state = "exited"; c.status = "Exited (1) just now"; emit("container", "die", c.name, c.image, { exitCode: "1" }); }
    else if (r[1] === "oom") emit("container", "oom", c.name, c.image);
    else emit("container", r[1] === "unhealthy" ? "health_status: unhealthy" : "health_status: healthy", c.name, c.image);
    return json(res, { ok: true });
  }
  json(res, { message: `mock: ${m} ${p} not implemented` }, 501);
}).listen(sock, () => console.log(`mock Docker API on ${sock}`));
