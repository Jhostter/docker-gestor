// End-to-end check of group (stack) actions against the mock Docker: ordering by Compose dependencies,
// idempotence, partial failures, containers without Compose, validation and access control.
//   npm run build && npm run e2e:groups
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4493, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-groups-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-groups-${process.pid}` : join(tmp, "mock.sock");
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const get = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const batch = (action, ids, init = {}) => get("/api/containers/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids }), ...init });
const ops = () => new Promise((res) => http.get({ socketPath: sock, path: "/_demo/ops" }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }));
const list = async () => (await get("/api/containers")).body;
const id = async (n) => (await list()).find((c) => c.name === n).id;
const state = async (n) => (await list()).find((c) => c.name === n)?.state;
const SHOP = ["shop-web", "shop-api", "shop-db", "shop-cache", "shop-worker"];
const shopIds = async () => Promise.all(SHOP.map(id));
const pos = (log, action, name) => log.findIndex((o) => o.action === action && o.name === name);

// ---- stop a whole stack: dependents first
const stopped = await batch("stop", await shopIds());
check(stopped.status === 200 && stopped.body.results.length === 5 && stopped.body.results.every((r) => r.ok), "stopping the shop stack succeeds for all 5 containers");
let log = await ops();
check((await Promise.all(SHOP.map(state))).every((s) => s === "exited"), "all of them are stopped");
check((await state("grafana")) === "running" && (await state("prometheus")) === "running", "another stack is left untouched");
const p = (n) => pos(log, "stop", n);
check(p("shop-web") < p("shop-api") && p("shop-api") < p("shop-db") && p("shop-api") < p("shop-cache") && p("shop-worker") < p("shop-db") && p("shop-worker") < p("shop-cache"), "stop order follows depends_on in reverse (web → api/worker → db/cache)");

// ---- start it again: dependencies first
const before = (await ops()).length;
const started = await batch("start", await shopIds());
check(started.body.results.every((r) => r.ok && !r.skipped) && (await Promise.all(SHOP.map(state))).every((s) => s === "running"), "starting the stack brings all 5 back");
log = (await ops()).slice(before);
const s = (n) => pos(log, "start", n);
check(s("shop-db") < s("shop-api") && s("shop-cache") < s("shop-api") && s("shop-api") < s("shop-web") && s("shop-db") < s("shop-worker"), "start order follows depends_on (db/cache → api/worker → web)");

// ---- idempotence
const again = await batch("start", await shopIds());
check(again.body.results.every((r) => r.ok && r.skipped) && (await ops()).length === before + 5, "starting what is already running does nothing and is not an error");

// ---- restart honours dependencies too
const mark = (await ops()).length;
const mon = await Promise.all(["grafana", "prometheus"].map(id));
const rs = await batch("restart", mon);
log = (await ops()).slice(mark);
check(rs.body.results.every((r) => r.ok) && pos(log, "restart", "prometheus") < pos(log, "restart", "grafana"), "restart goes dependencies first (prometheus before grafana)");

// ---- containers with no Compose project are handled as well
const solo = await batch("stop", [await id("mailpit")]);
check(solo.body.results[0].ok && (await state("mailpit")) === "exited", "a container that belongs to no stack can be managed too");

// ---- partial failure does not stop the rest
const ghost = "f".repeat(64);
const part = await batch("start", [await id("mailpit"), ghost]);
check(part.status === 200 && part.body.results.find((r) => r.id === ghost)?.ok === false && part.body.results.find((r) => r.name !== ghost.slice(0, 12))?.ok === true && (await state("mailpit")) === "running", "an unknown id fails on its own while the others still run");

// ---- remove (forced, only on explicit request)
const gone = await batch("remove", [await id("old-experiment")]);
check(gone.body.results[0].ok && (await state("old-experiment")) === undefined, "remove deletes the chosen container");

// ---- validation and access control
const bad = async (b) => (await get("/api/containers/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).status;
check((await bad({ action: "stop", ids: [] })) === 400 && (await bad({ action: "explode", ids: ["a".repeat(12)] })) === 400 && (await bad({ action: "stop", ids: ["../x"] })) === 400 && (await bad({ action: "stop", ids: Array.from({ length: 201 }, (_, i) => i.toString(16).padStart(12, "0")) })) === 400, "empty, unknown-action, malformed and oversized requests are rejected");
check((await batch("stop", [await id("shop-web")], { headers: { "content-type": "application/json", origin: "http://evil.example" } })).status === 403 && (await state("shop-web")) === "running", "a foreign Origin cannot act on containers");

console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
