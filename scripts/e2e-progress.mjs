// End-to-end check of the live progress stream of group actions (?stream=1) and of cancelling it, against the mock Docker.
//   npm run build && npm run e2e:progress
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4484, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-progress-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-progress-${process.pid}` : join(tmp, "mock.sock");
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { env: { ...process.env, MOCK_HEALTH_MS: "1500" }, stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp, HEALTH_WAIT_SECONDS: "20" }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const mock = (method, path) => new Promise((res) => http.request({ socketPath: sock, path, method }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(b ? JSON.parse(b) : {})); }).end());
const list = async () => (await (await fetch(BASE + "/api/containers")).json());
const ids = async (names) => { const l = await list(); return names.map((n) => l.find((c) => c.name === n).id); };
const SHOP = ["shop-web", "shop-api", "shop-db", "shop-cache", "shop-worker"];
const post = (path, body, init = {}) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });
const jsonBatch = async (action, names) => (await (await post("/api/containers/batch", { action, ids: await ids(names) })).json()).results;

/** Reads the NDJSON stream; `stopWhen(event, all)` may return true to cancel (abort) the request. */
async function stream(action, names, stopWhen) {
  const ac = new AbortController(), events = [];
  const res = await post("/api/containers/batch?stream=1", { action, ids: await ids(names) }, { signal: ac.signal });
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "", aborted = false;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop();
      for (const l of lines) if (l.trim()) { const e = JSON.parse(l); events.push(e); if (stopWhen?.(e, events)) { aborted = true; ac.abort(); } }
    }
  } catch { /* aborted */ }
  return { events, status: res.status, type: res.headers.get("content-type"), aborted };
}
const itemsOf = (evs, name) => evs.filter((e) => e.t === "item" && e.name === name);

// ---- 1) a stop streams a plan and each container's progress, dependents first
let s = await stream("stop", SHOP);
const plan = s.events[0];
check(s.status === 200 && /ndjson/.test(s.type) && plan.t === "plan" && plan.action === "stop", "the response is a stream whose first event is the plan");
check(JSON.stringify(plan.layers.map((l) => l.map((x) => x.name).sort())) === JSON.stringify([["shop-web"], ["shop-api", "shop-worker"], ["shop-cache", "shop-db"]]), "the plan lists the layers in execution order (web → api/worker → db/cache)");
check(SHOP.every((n) => itemsOf(s.events, n).map((e) => e.state).join() === "working,ok"), "every container goes working → ok");
const at = (n, st) => s.events.findIndex((e) => e.t === "item" && e.name === n && e.state === st);
check(at("shop-web", "ok") < at("shop-api", "working") && at("shop-api", "ok") < at("shop-db", "working"), "events respect the order: a layer finishes before the next one starts");
const done1 = s.events.at(-1);
check(done1.t === "done" && done1.cancelled === false && done1.results.length === 5 && done1.results.every((r) => r.ok), "the stream ends with a done event carrying the final results");

// ---- 2) a start shows WHAT it is waiting for, and for how long
s = await stream("start", SHOP);
const waiting = s.events.filter((e) => e.t === "item" && e.state === "waiting");
check(waiting.length >= 2 && waiting.every((e) => e.dep === "db" && e.max === 20) && new Set(waiting.map((e) => e.name)).has("shop-api"), "while the database is not healthy, the API gets 'waiting' events naming the dependency and the limit");
check(waiting.some((e) => e.waited >= 1) && waiting.every((e, i) => i === 0 || e.name !== waiting[i - 1].name || e.waited >= waiting[i - 1].waited), "the waited seconds go up");
const apiStates = itemsOf(s.events, "shop-api").map((e) => e.state);
check(apiStates.at(-1) === "ok" && apiStates.at(-2) === "working" && apiStates.includes("waiting"), "and it then starts: waiting… → working → ok");
check(s.events.at(-1).results.every((r) => r.ok), "the start succeeds");

// ---- 3) the same operation in plain JSON mode gives the same results (nothing changed for existing clients)
await jsonBatch("stop", SHOP);
const j = await jsonBatch("start", SHOP);
check(j.length === 5 && j.every((r) => r.ok && r.name && r.id), "without ?stream=1 the response is still { results } as before");

// ---- 4) cancelling stops the rest and stops polling
await jsonBatch("stop", SHOP);
await mock("POST", "/_demo/health/shop-db/starting");            // the database will not become healthy
let opsBefore = (await mock("GET", "/_demo/ops")).length;
s = await stream("start", SHOP, (e) => e.t === "item" && e.state === "waiting" && e.name === "shop-api");
check(s.aborted, "the request was cancelled while waiting for the database");
await sleep(300); const polled = (await mock("GET", "/_demo/inspects"))["shop-db"];
await sleep(2200);
const later = (await mock("GET", "/_demo/inspects"))["shop-db"], ops = (await mock("GET", "/_demo/ops")).slice(opsBefore);
check(later === polled, `after cancelling, the server stops checking the database (${polled} → ${later} inspections)`);
check(!ops.some((o) => o.action === "start" && ["shop-api", "shop-worker", "shop-web"].includes(o.name)), "and the services that were waiting were never started");
check(ops.some((o) => o.action === "start" && o.name === "shop-db") && ops.some((o) => o.action === "start" && o.name === "shop-cache"), "what had already begun (the first layer) was not interrupted");
await mock("POST", "/_demo/health/shop-db/none"); await sleep(1700);
const t0 = Date.now(); const again = await jsonBatch("start", ["shop-api", "shop-worker", "shop-web"]);
check(again.every((r) => r.ok) && Date.now() - t0 < 3000, "afterwards the server is free: a new start works normally");

// ---- 5) validation and access control are the same in stream mode
const bad = await post("/api/containers/batch?stream=1", { action: "stop", ids: [] });
check(bad.status === 400 && /json/.test(bad.headers.get("content-type")) && (await bad.json()).code === "empty_batch", "an invalid request is a plain 400 JSON, not a stream");
const evil = await post("/api/containers/batch?stream=1", { action: "stop", ids: await ids(["shop-web"]) }, { headers: { "content-type": "application/json", origin: "http://evil.example" } });
check(evil.status === 403, "a foreign Origin is rejected");

console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
