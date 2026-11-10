// End-to-end check of the container detail API against the mock Docker: secrets must never leave the server
// unless one variable is explicitly requested.
//   npm run build && npm run e2e:detail
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4495, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-detail-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-detail-${process.pid}` : join(tmp, "mock.sock");
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const get = async (path, init) => { const r = await fetch(BASE + path, init); const text = await r.text(); let body = {}; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text, headers: r.headers }; };
const list = (await get("/api/containers")).body, id = (n) => list.find((c) => c.name === n).id;
const SECRETS = ["demo-jwt-secret-value", "sk_test_demo_not_a_real_key", "demo-pass", "demo-db-password", "demo-grafana-admin", "demo-worker-token", "ZGVtby1zaWduYXR1cmU", "demo-enc-key-value"];

const api = await get(`/api/containers/${id("shop-api")}/inspect`), d = api.body;
check(api.status === 200 && d.name === "shop-api" && d.image === "ghcr.io/acme/shop-api:2.4.1", "the inspect endpoint returns the container details");
check(d.env.find((e) => e.name === "NODE_ENV")?.value === "production", "ordinary variables are shown");
check(["JWT_SECRET", "STRIPE_API_KEY", "DATABASE_URL", "ANON_KEY", "DB_ENC_KEY", "CLIENT_CONFIG"].every((n) => { const e = d.env.find((x) => x.name === n); return e?.secret === true && e.value === null; }), "secret-looking variables (by name, by URL credentials or by the look of the value — incl. a JWT under an innocent name) come without their value");
check(d.env.find((e) => e.name === "REDIS_URL")?.value === "redis://shop-cache:6379", "a URL without credentials is not treated as a secret");

// the key guarantee: no secret anywhere in any of the payloads
let leaked = [];
for (const n of ["shop-api", "shop-db", "grafana", "shop-worker"]) { const r = await get(`/api/containers/${id(n)}/inspect`); for (const s of SECRETS) if (r.text.includes(s)) leaked.push(`${s} in ${n}`); }
check(leaked.length === 0, `no secret value appears anywhere in the inspect payloads (including the raw view)${leaked.length ? ": " + leaked.join(", ") : ""}`);
check(d.args.includes("--port=3000") && d.mounts.some((m) => m.destination === "/app/uploads" && m.rw) && d.limits.memory === 512 * 1048576 && d.restartPolicy.name === "unless-stopped", "command, mounts, limits and restart policy are present");
check(d.ports.some((p) => p.container === "3000/tcp" && p.host[0].ip === "127.0.0.1") && d.ports.some((p) => p.container === "9229/tcp" && p.host.length === 0), "published and exposed-only ports are distinguished");
check(d.networks[0].name === "shop_default" && d.networks[0].ip, "networks carry their address");
check(d.health?.status === "healthy" && d.health.log.length === 5, "health status and recent checks are included");

// reveal on demand
const rev = await get(`/api/containers/${id("shop-api")}/env?name=JWT_SECRET`);
check(rev.status === 200 && rev.body.value === "demo-jwt-secret-value" && /no-store/.test(rev.headers.get("cache-control") ?? ""), "one variable can be revealed explicitly, and it is not cacheable");
check((await get(`/api/containers/${id("shop-api")}/env?name=NOPE`)).status === 404, "an unknown variable is a 404");
check((await get(`/api/containers/${id("shop-api")}/env?name=a%20b`)).status === 400 && (await get(`/api/containers/zzz/env?name=X`)).status === 400, "bad names and ids are rejected");

// scenarios
const old = (await get(`/api/containers/${id("old-experiment")}/inspect`)).body;
check(old.state.running === false && old.state.exitCode === 137 && old.state.oomKilled === true && old.restartCount === 3, "an out-of-memory crash shows exit code 137, OOMKilled and the restart count");
const mp = (await get(`/api/containers/${id("mailpit")}/inspect`)).body;
check(mp.health.status === "unhealthy" && mp.health.failingStreak === 4 && mp.health.log[0].exitCode === 1, "an unhealthy container shows its failing streak and the latest failing check first");
const ne = (await get(`/api/containers/${id("node-exporter")}/inspect`)).body;
check(["hostNetwork", "hostPid", "rootMount"].every((f) => ne.flags.some((x) => x.id === f)) && ne.flags.find((x) => x.id === "rootMount").detail === "ro", "notable settings are flagged (host network, host PID, host root mounted read-only)");
check((await get(`/api/containers/${id("shop-web")}/inspect`)).body.flags.length === 0, "an ordinary container has no notable settings");
check((await get(`/api/containers/${id("shop-db")}/inspect`)).body.mounts.some((m) => m.type === "volume" && m.name === "shop_pgdata"), "named volumes are identified");

// access control
check((await get(`/api/containers/${id("shop-api")}/inspect`, { headers: { origin: "http://evil.example" } })).status === 403, "a foreign Origin cannot read details");
check((await get(`/api/containers/${id("shop-api")}/env?name=JWT_SECRET`, { headers: { origin: "http://evil.example" } })).status === 403, "nor reveal a secret");
check((await get(`/api/containers/not-hex/inspect`)).status === 400, "a malformed id is rejected");
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
