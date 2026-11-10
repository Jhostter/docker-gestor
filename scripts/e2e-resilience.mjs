// Browser test: the interface must keep up with Docker without a page reload, also when events burst, when an old
// response arrives late, and when Docker disappears for a while and comes back. Needs Chrome/Chromium (CHROME_PATH).
//   npm run build && npm run e2e:resilience
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), "dg-res-")), sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-res-${process.pid}` : join(tmp, "m.sock"), PORT = 4479, BASE = `http://localhost:${PORT}`;
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

const startMock = () => { const p = spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" }); procs.push(p); return p; };
let mock = startMock(); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }
const chrome = process.env.CHROME_PATH ?? ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].find((c) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0);
if (!chrome) { console.error("Chrome/Chromium not found. Set CHROME_PATH."); process.exit(1); }
procs.push(spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", ...(process.env.CI ? ["--no-sandbox"] : []), `--user-data-dir=${tmp}/chrome`, "--remote-debugging-port=9991", "about:blank"], { stdio: "ignore" }));
let page; for (let i = 0; i < 40 && !page; i++) { try { page = (await (await fetch("http://127.0.0.1:9991/json")).json()).find((t) => t.type === "page"); } catch {} await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.on("open", r));
let id = 0; const w = new Map(); const errors = [];
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && w.has(d.id)) w.get(d.id)(d); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const dock = (method, path) => new Promise((res) => { const q = http.request({ socketPath: sock, path, method }, (r) => { r.resume(); r.on("end", res); }); q.on("error", res); q.end(); });
const ids = async () => Object.fromEntries((await (await fetch(BASE + "/api/containers")).json()).map((c) => [c.name, c.id]));
const stopOut = async (name) => dock("POST", `/containers/${(await ids())[name]}/stop`); // a change made outside the UI
const state = (n) => ev(`(()=>{const r=[...document.querySelectorAll('div.grid')].find(x=>x.querySelector('button[title^="${n}"]'));return r?(r.innerText.includes('Running')?'Running':r.innerText.includes('Stopped')?'Stopped':'?'):'no-row'})()`);
/** Waits until the row shows `want`; returns the milliseconds it took, or -1 if it never did. */
const until = async (n, want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await state(n)) === want) return Date.now() - t0; await sleep(150); } return -1; };
const key = async (k, code) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: "Key" + k.toUpperCase(), windowsVirtualKeyCode: code }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: "Key" + k.toUpperCase(), windowsVirtualKeyCode: code }); };

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
// lets a test hold back ONE response of the container list, to simulate an old request that arrives late
// The 10 s timers (fallback poll, stats) are switched off in the page: whatever keeps the UI current here has to be the event stream
await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("lang","en"); const si=window.setInterval; window.setInterval=(fn,ms,...a)=>ms===10000?0:si(fn,ms,...a); const f=window.fetch; window.fetch=(u,o)=>{ if(window.__hold && /\\/api\\/containers(\\?|$)/.test(String(u)) && !(o&&o.method)){ window.__hold=false; const p=f(u,o); return new Promise(r=>setTimeout(()=>p.then(r),2500)) } return f(u,o) }` });
await send("Page.navigate", { url: BASE }); await sleep(3200);

// 1) a change made outside the UI shows up by itself
let ms = (await stopOut("shop-web"), await until("shop-web", "Stopped", 4000));
check(ms >= 0 && ms < 2500, `a container stopped from outside appears as stopped by itself (${ms} ms)`);

// 2) an OLD response that arrives late must not overwrite newer data
await ev("window.__hold = true"); await key("r", 82);           // refresh #1: asked now, answer held for 2.5 s (it shows the state BEFORE the change)
await sleep(150); await stopOut("shop-cache");                  // the change; its event triggers refresh #2, answered at once
ms = await until("shop-cache", "Stopped", 3000);
await sleep(3000);                                              // the held, stale answer arrives now
check(ms >= 0 && (await state("shop-cache")) === "Stopped", "a slow, outdated response does not bring the old state back");

// 3) a burst of events must not postpone the refresh until the burst ends
let storm = true; const stormEnds = Date.now() + 5000;
(async () => { const cid = (await ids())["mailpit"]; while (Date.now() < stormEnds) { await dock("POST", `/containers/${cid}/restart`); await sleep(100); } storm = false; })();
await sleep(1000); await stopOut("shop-worker");
ms = await until("shop-worker", "Stopped", 5000);
check(ms >= 0 && ms < 2500 && storm, `during a storm of events the UI still catches up quickly (${ms} ms, storm still running: ${storm})`);
while (storm) await sleep(100);

// 4) an open Details window does not freeze
await ev(`[...document.querySelectorAll('div.grid')].find(x=>x.querySelector('button[title^="grafana"]')).querySelector('button[title^="grafana"]').click()`); await sleep(1500);
check(/Running/.test(await ev(`document.querySelector('[role=dialog]')?.innerText ?? ""`)), "the Details window opens showing a running container");
await stopOut("grafana"); const t0 = Date.now(); let seen = false;
while (Date.now() - t0 < 7000 && !seen) { seen = /Stopped/.test(await ev(`document.querySelector('[role=dialog]')?.innerText ?? ""`)); await sleep(300); }
check(seen, `and updates by itself when the container stops (${Date.now() - t0} ms)`);
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" }); await sleep(300);

// 5) Docker goes away for a while and comes back
mock.kill(); const outageStart = Date.now();
let banner = false; while (Date.now() - outageStart < 9000 && !banner) { banner = /Docker is not responding/.test(await ev("document.body.innerText")); await sleep(300); }
check(banner, "when Docker stops answering the page says Docker is not responding (not that the server was lost)");
await sleep(Math.max(0, 9000 - (Date.now() - outageStart)));
const errorToasts = await ev(`[...document.querySelectorAll('[role=alert]')].filter(x=>/Cannot connect|Docker/.test(x.innerText) && !/not responding/.test(x.innerText)).length`);
check(errorToasts <= 1, `and it does not flood you with error notices (${errorToasts})`);
mock = startMock(); await sleep(400);
await stopOut("prometheus"); ms = await until("prometheus", "Stopped", 8000);
// with the fallback poll disabled in this page, only the reconnected event stream can deliver this
check(ms >= 0 && ms < 4500, `once Docker is back, the page catches up from the event stream, not only from a slow poll (${ms} ms)`);
await sleep(500);
check(!/Docker is not responding/.test(await ev("document.body.innerText")), "and the warning goes away");
check(errors.length === 0, `no JavaScript errors${errors.length ? ": " + errors[0] : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
