// End-to-end check of the alerts feature with no Docker and no real accounts: it runs the app against the
// mock Docker API and a fake Telegram + webhook receiver, then breaks a container and checks every channel.
//   npm run build && npm run e2e:alerts
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, statSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4499, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-e2e-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-e2e-${process.pid}` : join(tmp, "mock.sock");
const procs = [], servers = [];
const cleanup = () => { procs.forEach((p) => p.kill()); servers.forEach((s) => s.close()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

// fake receivers
const got = { tg: [], hook: [] };
const listen = (handler) => new Promise((res) => { const s = http.createServer(handler).listen(0, "127.0.0.1", () => { servers.push(s); res(s.address().port); }); });
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => r(b)); });
const tgPort = await listen(async (req, res) => { got.tg.push({ url: req.url, body: JSON.parse(await readBody(req)) }); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true })); });
const hookPort = await listen(async (req, res) => { got.hook.push({ headers: req.headers, body: await readBody(req) }); res.end("ok"); });

procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" }));
await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp, SAMPLE_SECONDS: "1", ALERT_HOST: "testbox", TELEGRAM_API_URL: `http://127.0.0.1:${tgPort}` }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const api = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const put = (b) => api("/api/alerts/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const post = (path, b) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) });
const demo = (action, name) => new Promise((res) => http.request({ socketPath: sock, path: `/_demo/${action}/${name}`, method: "POST" }, (r) => { r.resume(); r.on("end", res); }).end());
const waitFor = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (fn()) return true; await sleep(200); } return false; };

const TOKEN = "123456789:AAFakeTokenForTestsOnly_0123456789abc";
const off = await api("/api/alerts/config");
check(off.status === 200 && off.body.enabled === false && off.body.watching === false, "alerts start disabled and the watcher is not running");

const bad = await put({ channels: { telegram: { token: "nope" } } });
check(bad.status === 400 && bad.body.code === "invalid_telegram_token", "invalid Telegram token is rejected with a code");

const saved = await put({ enabled: true, lang: "en", cooldownMinutes: 0, channels: { browser: { enabled: true }, telegram: { enabled: true, token: TOKEN, chatId: "-100200" }, webhook: { enabled: true, url: `http://127.0.0.1:${hookPort}/alert`, format: "json", authorization: "Bearer s3cr3t" } } });
check(saved.status === 200 && saved.body.watching === true, "enabling starts the Docker event watcher");
check(!JSON.stringify(saved.body).includes("AAFakeToken") && !JSON.stringify(saved.body).includes("s3cr3t") && saved.body.channels.telegram.hasToken && saved.body.channels.webhook.hasAuth, "API responses never contain the secrets");
if (process.platform !== "win32") check((statSync(join(tmp, "alerts.json")).mode & 0o077) === 0, "alerts.json is readable only by its owner (0600)");
check(readFileSync(join(tmp, "alerts.json"), "utf8").includes("AAFakeToken"), "the token is persisted to disk");

// browser channel: SSE
const sse = []; const ctrl = new AbortController();
fetch(BASE + "/api/alerts/stream", { signal: ctrl.signal }).then(async (r) => { const rd = r.body.getReader(), dec = new TextDecoder(); for (;;) { const { value, done } = await rd.read(); if (done) break; for (const l of dec.decode(value).split("\n")) if (l.startsWith("data: ")) sse.push(JSON.parse(l.slice(6))); } }).catch(() => {});
await sleep(600);

// 1) a user stop must stay silent
const list = await api("/api/containers");
const web = list.body.find((c) => c.name === "shop-web");
await post(`/api/containers/${web.id}/stop`);
await sleep(4500);
check(got.hook.length === 0 && got.tg.length === 0 && sse.length === 0, "a stop done from the UI does not trigger any alert");

// 2) a crash alerts on every channel
await demo("crash", "shop-api");
check(await waitFor(() => got.hook.length && got.tg.length && sse.length), "a crash reaches webhook, Telegram and the browser stream");
const hook = got.hook[0], hb = JSON.parse(hook?.body ?? "{}");
check(hb.event === "died" && hb.container === "shop-api" && hb.vars?.code === "1" && /exited with code 1/.test(hb.text) && hb.content === hb.text, "webhook JSON: event, container, exit code and Slack/Discord-compatible text");
check(hook?.headers.authorization === "Bearer s3cr3t", "webhook sends the configured Authorization header");
const tg = got.tg[0];
check(tg?.url === `/bot${TOKEN}/sendMessage` && tg.body.chat_id === "-100200" && /shop-api exited with code 1/.test(tg.body.text), "Telegram sendMessage gets the right bot, chat and text");
check(sse[0]?.rule === "died" && /shop-api/.test(sse[0].message), "browser stream carries the alert");

// 3) other events
await demo("unhealthy", "shop-db"); await demo("oom", "shop-worker");
check(await waitFor(() => got.hook.some((h) => JSON.parse(h.body).event === "unhealthy") && got.hook.some((h) => JSON.parse(h.body).event === "oom")), "unhealthy and OOM events alert");
await demo("healthy", "shop-db");
check(await waitFor(() => got.hook.some((h) => JSON.parse(h.body).event === "recovered")), "recovery is reported");

// 4) history + test endpoint + failure reporting
const hist = await api("/api/alerts/history");
check(hist.status === 200 && hist.body.length >= 4 && hist.body[0].message && hist.body.some((h) => h.rule === "died"), "alert history is stored");
const before = got.tg.length;
const t1 = await post("/api/alerts/test", { channel: "telegram" });
check(t1.status === 200 && got.tg.length === before + 1 && /test alert/i.test(got.tg.at(-1).body.text), "the Telegram test sends a message");
await put({ channels: { webhook: { enabled: true, url: "http://127.0.0.1:9/never" } } });
const t2 = await post("/api/alerts/test", { channel: "webhook" });
check(t2.status === 502 && t2.body.code === "alert_test_failed" && !JSON.stringify(t2.body).includes("s3cr3t"), "a failing channel reports an error without leaking secrets");
servers[0].close(); servers[0].closeAllConnections?.();
const t3 = await post("/api/alerts/test", { channel: "telegram" });
check(t3.status === 502 && !JSON.stringify(t3.body).includes("AAFakeToken"), "a failing Telegram request does not leak the bot token");
const st = await api("/api/alerts/config");
check(!JSON.stringify(st.body).includes("AAFakeToken"), "the token is not exposed in the channel status either");
check(/^\[testbox\]/.test(got.hook[0] ? JSON.parse(got.hook[0].body).text : ""), "messages are prefixed with the configured host label");
check(!!st.body.status.webhook.error, "the failure is visible in the channel status");

// 5) turning alerts off stops the watcher; foreign origins are rejected
const offAgain = await put({ enabled: false });
check(offAgain.body.watching === false, "disabling stops the watcher");
const evil = await fetch(BASE + "/api/alerts/config", { headers: { origin: "http://evil.example" } });
check(evil.status === 403, "a foreign Origin cannot read or change alerts");

ctrl.abort();
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good");
process.exit(fails ? 1 : 0);
