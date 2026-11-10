// End-to-end check that starting or restarting a group waits for dependencies declared as service_healthy
// (and refuses to start dependents when they never become ready), against the mock Docker with real timings.
//   npm run build && npm run e2e:health
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4487, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-health-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-health-${process.pid}` : join(tmp, "mock.sock");
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { env: { ...process.env, MOCK_HEALTH_MS: "1500" }, stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp, HEALTH_WAIT_SECONDS: "4" }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const get = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const batch = async (action, ids) => { const t = Date.now(); const r = await get("/api/containers/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids }) }); return { ...r, ms: Date.now() - t }; };
const mock = (method, path) => new Promise((res) => http.request({ socketPath: sock, path, method }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b ? JSON.parse(b) : {})); }).end());
const ops = () => mock("GET", "/_demo/ops");
const list = async () => (await get("/api/containers")).body;
const SHOP = ["shop-web", "shop-api", "shop-db", "shop-cache", "shop-worker"];
const ids = async (names) => { const l = await list(); return names.map((n) => l.find((c) => c.name === n).id); };
const state = async (n) => (await list()).find((c) => c.name === n)?.state;
const by = (r, n) => r.body.results.find((x) => x.name === n);
const idx = (log, action, name, from = 0) => log.findIndex((o, i) => i >= from && o.action === action && o.name === name);

// ---- 1) a normal start waits for the database to be healthy before the API starts
await batch("stop", await ids(SHOP));
let mark = (await ops()).length;
let r = await batch("start", await ids(SHOP));
let log = (await ops()).slice(mark);
check(r.body.results.every((x) => x.ok), "starting the stack succeeds");
const sDb = idx(log, "start", "shop-db"), hDb = idx(log, "healthy", "shop-db"), sApi = idx(log, "start", "shop-api"), sWeb = idx(log, "start", "shop-web");
check(sDb >= 0 && sDb < hDb && hDb < sApi, "shop-api starts only AFTER shop-db reported healthy (start db → healthy db → start api)");
check(idx(log, "healthy", "shop-db") < idx(log, "start", "shop-worker"), "so does shop-worker, which has the same dependency");
check(sApi < sWeb, "shop-web follows shop-api (a plain service_started dependency)");
check(r.ms >= 1300, `the start took ${r.ms} ms: it really waited for the health check`);
check(log.some((o) => o.action === "start" && o.name === "shop-cache") && idx(log, "start", "shop-cache") < sApi, "shop-cache (service_started) did not hold anything up");

// ---- 2) nothing to wait for when everything is already up
mark = (await ops()).length;
r = await batch("start", await ids(SHOP));
check(r.body.results.every((x) => x.ok && x.skipped) && r.ms < 1200 && (await ops()).length === mark, "starting a group that is already running is instant and does nothing");

// ---- 3) a dependency that never gets healthy: dependents are NOT started
await batch("stop", await ids(SHOP));
await mock("POST", "/_demo/health/shop-db/starting");
mark = (await ops()).length;
r = await batch("start", await ids(SHOP));
log = (await ops()).slice(mark);
check(by(r, "shop-db").ok && by(r, "shop-cache").ok, "the dependency itself and the services that do not need it start");
check(["shop-api", "shop-worker"].every((n) => { const x = by(r, n); return x.ok === false && x.code === "dep_timeout" && x.vars.dep === "db" && x.vars.seconds === 4 && /waited 4 s for 'db'/.test(x.error); }), "shop-api and shop-worker are refused with a timeout that names the dependency");
check(by(r, "shop-web").ok === false && by(r, "shop-web").code === "dep_failed" && by(r, "shop-web").vars.dep === "api", "shop-web is refused too, because shop-api did not start");
check(!["shop-api", "shop-worker", "shop-web"].some((n) => idx(log, "start", n) >= 0) && (await state("shop-api")) === "exited", "and they were never started");
check(r.ms >= 3800 && r.ms < 9000, `the wait lasted about the configured 4 s (${r.ms} ms)`);

// ---- 4) once healthy, retrying brings up the rest
await mock("POST", "/_demo/health/shop-db/none");
await sleep(1700);
r = await batch("start", await ids(["shop-api", "shop-worker", "shop-web"]));
check(r.body.results.every((x) => x.ok) && (await state("shop-web")) === "running", "after the database is healthy, starting the remaining three works");

// ---- 5) an unhealthy dependency fails immediately instead of waiting out the timeout
await batch("stop", await ids(["shop-api", "shop-worker", "shop-web"]));
await mock("POST", "/_demo/health/shop-db/unhealthy");
r = await batch("start", await ids(["shop-api", "shop-worker", "shop-web"]));
check(by(r, "shop-api").code === "dep_unhealthy" && by(r, "shop-web").code === "dep_failed" && r.ms < 2500, `a dependency that is unhealthy fails fast (${r.ms} ms), without waiting for the timeout`);
await mock("POST", "/_demo/health/shop-db/none");

// ---- 5b) a dependency OUTSIDE the selection is also waited for (e.g. "Start all" on the stopped ones only)
await batch("stop", await ids(["shop-api"]));
await batch("restart", await ids(["shop-db"]));            // db is running again but its health check is still "starting"
mark = (await ops()).length;
r = await batch("start", await ids(["shop-api"]));
log = (await ops()).slice(mark);
check(by(r, "shop-api").ok && idx(log, "healthy", "shop-db") >= 0 && idx(log, "healthy", "shop-db") < idx(log, "start", "shop-api") && r.ms >= 700, `starting only shop-api waits for the still-starting shop-db, which is not in the selection (${r.ms} ms)`);
await batch("stop", await ids(["shop-db"]));
r = await batch("start", await ids(["shop-api"]));
check(by(r, "shop-api").code === "dep_exited" && by(r, "shop-api").ok === false, "and if that dependency is stopped, the dependent is refused instead of starting without it");
await batch("start", await ids(["shop-db"])); await sleep(1700); await batch("start", await ids(["shop-api"]));

// ---- 6) restart honours it too
await batch("start", await ids(["shop-api", "shop-worker", "shop-web"]));
mark = (await ops()).length;
r = await batch("restart", await ids(SHOP));
log = (await ops()).slice(mark);
const rDb = idx(log, "restart", "shop-db"), rHealthy = idx(log, "healthy", "shop-db", rDb), rApi = idx(log, "restart", "shop-api");
check(r.body.results.every((x) => x.ok) && rDb >= 0 && rDb < rHealthy && rHealthy < rApi, "restart waits too: restart db → db healthy again → restart api");

// ---- 7) stopping never waits
await mock("POST", "/_demo/health/shop-db/starting");
r = await batch("stop", await ids(SHOP));
check(r.body.results.every((x) => x.ok) && r.ms < 1800, `stopping does not wait for health, even when a service is still starting (${r.ms} ms)`);
await mock("POST", "/_demo/health/shop-db/none");

console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
