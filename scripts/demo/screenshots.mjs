// Regenerates the README screenshots, the demo GIF and the social preview image.
// It runs Docker Kong against the fictional mock Docker API, so no real containers are involved.
//   npm run build && node scripts/demo/screenshots.mjs [outputDir]
// Requires Chrome/Chromium (set CHROME_PATH if it is not on the PATH) and ffmpeg (only for the GIF).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import http from "node:http";
import WebSocket from "ws";
import { monkeySvg } from "../../src/app/monkey.mjs";

const OUT = resolve(process.argv[2] ?? "docs/img");
const PORT = 4488, CDP = 9444, BASE = `http://localhost:${PORT}`;
if (!existsSync(".next")) { console.error("Run `npm run build` first."); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "docker-gestor-demo-"));
const sock = join(tmp, "mock.sock");
const procs = [];
const cleanup = () => { procs.forEach((p) => { try { p.kill(); } catch {} }); try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(1));

const chromePath = process.env.CHROME_PATH ?? ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].find((c) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0);
if (!chromePath) { console.error("Chrome/Chromium not found. Set CHROME_PATH."); process.exit(1); }

// 1) fake Docker + seeded history + the app
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" }));
await sleep(800);
spawnSync(process.execPath, ["scripts/demo/seed-history.mjs"], { env: { ...process.env, DATA_DIR: join(tmp, "data") }, stdio: "ignore" });
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: join(tmp, "data"), ALERT_HOST: "demo-server", TELEGRAM_API_URL: "http://127.0.0.1:9" }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* booting */ } await sleep(500); }

// demo custom groups (fictional)
for (const [group, names] of Object.entries({ Frontend: ["shop-web", "grafana", "mailpit"], Backend: ["shop-api", "shop-worker"], Data: ["shop-db", "shop-cache", "prometheus"] }))
  await fetch(`${BASE}/api/groups`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ names, group }) });

// 2) Chrome over the DevTools protocol
procs.push(spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${join(tmp, "chrome")}`, `--remote-debugging-port=${CDP}`, ...(process.env.CI ? ["--no-sandbox"] : []), "about:blank"], { stdio: "ignore" }));
let page; for (let i = 0; i < 40 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ } await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.on("open", r));
let seq = 0; const waiting = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && waiting.has(d.id)) waiting.get(d.id)(d); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const key = (k) => send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k }).then(() => send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k }));
const png = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64")); console.log("  ", name + ".png"); };

const view = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
async function open({ lang = "en", theme = "dark", w = 1400, h = 860, mode = "stack", density = "comfortable", sort = "default", trend = false } = {}) {
  await view(w, h); await send("Page.navigate", { url: BASE }); await sleep(1200);
  await ev(`localStorage.setItem("lang","${lang}"); localStorage.setItem("theme","${theme}"); localStorage.setItem("groupMode","${mode}"); localStorage.setItem("density","${density}"); localStorage.setItem("sortBy","${sort}"); document.documentElement.dataset.theme="${theme}"`);
  await send("Page.navigate", { url: BASE }); await sleep(3200);
  if (trend) await sleep(10500); // the trend lines need two usage samples, 10 s apart
}
// click a button by aria-label or text; optionally restricted to the row/card that mentions `within`
const click = (label, within) => ev(`(() => { const all=[...document.querySelectorAll('button,a')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)}||e.textContent.trim().startsWith(${JSON.stringify(label)}));
  const b = ${within ? `all.find(e=>(e.closest('.grid')||e.parentElement).textContent.includes(${JSON.stringify(within)}))` : "all[0]"}; if(b){b.click();return true} return false })()`);
// click the "Add" button inside the fieldset whose legend is `legend`
const addIn = async (legend) => { await ev(`[...document.querySelectorAll('fieldset')].find(f=>f.querySelector('legend').textContent===${JSON.stringify(legend)}).querySelector('button').click()`); await sleep(250); };
const type = async (selector, text) => { await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`); await send("Input.insertText", { text }); };
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
// Details, Usage chart, Terminal, Restart and Delete live in the row's "⋯" menu
const rowAction = async (name, item) => { await ev(`document.querySelector('button[aria-label^="More actions: ${name}"]').click()`); await sleep(350); await ev(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.innerText.trim()===${JSON.stringify(item)}).click()`); };
const ctrlK = async () => { const b = { key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 2 }; await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...b }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...b }); await sleep(700); };
const escKey = async () => { const b = { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }; await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...b }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...b }); await sleep(350); };
const esc = async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(350); };

console.log("Screenshots →", OUT);
await open({ trend: true }); await png("containers-dark");
await open(); await ev(`document.querySelector('button[aria-label^="More actions: shop-db"]').click()`); await sleep(400); await png("row-menu");
await open(); await ctrlK(); await ev(`document.querySelector('[role=combobox]').focus()`); await send("Input.insertText", { text: "logs api" }); await sleep(500); await png("palette");
await open({ density: "compact" }); await png("containers-compact");
await open({ theme: "light", trend: true }); await png("containers-light");
await open({ lang: "es", trend: true }); await png("containers-es");
await open({ mode: "none", sort: "cpu", trend: true }); await png("metrics");
await open(); await ev(`document.querySelector('button[aria-label^="More actions: shop-api"]').click()`); await sleep(350); await ev(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.innerText.trim()==="Silence alerts…").click()`); await sleep(500); await png("mute");
await escKey();

await open(); await click("View logs", "shop-api"); await sleep(2600); await png("logs"); await esc();

await open(); await rowAction("shop-api", "Usage chart"); await sleep(1500); await click("24 h"); await sleep(1200);
const box = JSON.parse(await ev(`JSON.stringify(document.querySelector('[role=dialog] svg[role=img]').getBoundingClientRect())`)); await mouse(box.x + box.width * 0.64, box.y + box.height / 2); await sleep(400); await png("chart"); await esc();

await open(); await click("New container"); await sleep(500);
await type('input[list="local-images"]', "nginx:1.27-alpine");
await addIn("Ports"); await type('input[aria-label="Ports 1"]', "8080:80");
await addIn("Environment variables"); await type('input[aria-label="Environment variables 1"]', "TZ=Europe/Madrid");
await addIn("Volumes"); await type('input[aria-label="Volumes 1"]', "web_data:/usr/share/nginx/html:ro"); await sleep(300); await png("create");

await open({ h: 2100 });
await ev(`fetch("/api/alerts/mute",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"container",name:"shop-worker",minutes:480})}).then(()=>fetch("/api/alerts/mute",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"stack",name:"monitoring",minutes:null})}))`); await sleep(400);
await open({ h: 2100 }); // reload so the page sees the silences created above
await click("Alerts"); await sleep(1800); await png("alerts");
await ev(`Promise.all([{kind:"container",name:"shop-worker"},{kind:"stack",name:"monitoring"}].map((b)=>fetch("/api/alerts/mute",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify(b)})))`); await sleep(300);

await open({ mode: "custom" }); await sleep(300); await png("custom-groups");

// a real drag, paused over its destination, to show the drop highlight
await open({ mode: "custom", h: 1500 });
{
  let data = null; ws.on("message", (m) => { const d = JSON.parse(m); if (d.method === "Input.dragIntercepted") data = d.params.data; });
  await send("Input.setInterceptDrags", { enabled: true });
  const at = async (expr) => JSON.parse(await ev(`(()=>{const e=${expr};e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`));
  const a = await at(`document.querySelector('[data-drag-handle="node-exporter"]')`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 4; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + i * 6, y: a.y + i * 6, button: "left", buttons: 1 });
  for (let i = 0; i < 30 && !data; i++) await sleep(100);
  await sleep(300);
  const b = await at(`[...document.querySelectorAll('button[aria-expanded]')].find(x=>x.textContent.toLowerCase().includes("data")).closest("div[class]").parentElement`);
  await send("Input.dispatchDragEvent", { type: "dragEnter", x: b.x, y: b.y, data }); await send("Input.dispatchDragEvent", { type: "dragOver", x: b.x, y: b.y, data });
  await sleep(300); await png("drag-drop");
  await send("Input.dispatchDragEvent", { type: "dragCancel", x: b.x, y: b.y, data }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
  await send("Input.setInterceptDrags", { enabled: false });
}

await open();
await ev(`for (const n of ["shop-web", "shop-api", "grafana"]) document.querySelector('input[aria-label="Select ' + n + '"]').click()`); await sleep(400); await png("groups");

await open(); await rowAction("node-exporter", "Details"); await sleep(1500); await png("detail"); await esc();
await open(); await rowAction("shop-api", "Details"); await sleep(1200); await click("Environment"); await sleep(500); await png("detail-env"); await esc();

await open({ h: 1500 }); await click("Disk"); await sleep(2800); await png("disk");

await open(); await click("Compose"); await sleep(1500); await png("compose");
await click("Images"); await sleep(1500); await png("images");
await click("Events"); await sleep(1500); await png("events");
await open({ w: 400, h: 860 }); await png("mobile");

// 3) social preview card (1280x640) with the dark screenshot inside
await view(1280, 640);
const shot = readFileSync(join(OUT, "containers-dark.png")).toString("base64");
const html = `<!doctype html><meta charset=utf-8><style>*{box-sizing:border-box}body{margin:0;width:1280px;height:640px;background:radial-gradient(circle at 80% 0%,#0b3b57 0,#0b0b0e 55%);font-family:system-ui,sans-serif;color:#ececf1;position:relative;overflow:hidden}
h1{font-size:62px;margin:0;letter-spacing:-1px;white-space:nowrap}p{font-size:30px;color:#9a9aa8;margin:18px 0 0;line-height:1.35}.l{position:absolute;left:70px;top:120px;width:560px}
.chips{margin-top:34px;display:flex;flex-wrap:wrap;gap:10px}.chips span{background:#1c1c23;border:1px solid #2a2a33;border-radius:999px;padding:8px 18px;font-size:22px;color:#ececf1}
img{position:absolute;left:640px;top:150px;width:900px;border-radius:14px;border:1px solid #2a2a33;box-shadow:0 30px 80px #000a}</style>
<div class=l><h1><span style="display:inline-block;width:64px;vertical-align:-10px;margin-right:14px">${monkeySvg()}</span>Docker Kong</h1><p>A lightweight, local web dashboard for Docker.</p><div class=chips><span>~55 MB RAM</span><span>live logs</span><span>terminal</span><span>Compose</span><span>usage history</span></div></div><img src="data:image/png;base64,${shot}">`;
await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") }); await sleep(800); await png("social-preview");

// 4) demo GIF: record frames while driving the UI
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) {
  console.log("GIF …");
  await open({ w: 1200, h: 720 });
  const frames = []; let rec = true;
  const recorder = (async () => { let n = 0; while (rec) { const t = Date.now(); const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 }); const f = join(tmp, `f${String(n++).padStart(4, "0")}.jpg`); writeFileSync(f, Buffer.from(r.result.data, "base64")); frames.push({ f, t }); } })();
  await sleep(1400);
  await click("Stop", "shop-worker"); await sleep(2200); await click("Start", "shop-worker"); await sleep(1800);
  await click("View logs", "shop-api"); await sleep(3200); await esc();
  await rowAction("shop-api", "Usage chart"); await sleep(1400);
  const b2 = JSON.parse(await ev(`JSON.stringify(document.querySelector('[role=dialog] svg[role=img]').getBoundingClientRect())`));
  for (let i = 0; i <= 20; i++) { await mouse(b2.x + b2.width * (0.25 + i * 0.03), b2.y + b2.height / 2); await sleep(60); }
  await click("24 h"); await sleep(1500); await esc();
  await ev(`for (const n of ["shop-api", "shop-db"]) document.querySelector('input[aria-label="Select ' + n + '"]').click()`); await sleep(1300); await click("Clear selection"); await sleep(500);
  await rowAction("shop-api", "Details"); await sleep(1200); await click("Environment"); await sleep(1300); await click("Network"); await sleep(1200); await esc();
  await click("My groups"); await sleep(1800); await click("Stack"); await sleep(900);
  await ctrlK(); await ev(`document.querySelector('[role=combobox]').focus()`); await send("Input.insertText", { text: "logs db" }); await sleep(1500); await escKey();
  await click("Compose"); await sleep(1300); await click("Events"); await sleep(2000); await click("Alerts"); await sleep(1800); await click("Disk"); await sleep(2400); await click("Containers"); await sleep(900);
  await click("Light theme"); await sleep(1400); await click("Change language"); await sleep(1600);
  rec = false; await recorder;
  const list = frames.map((x, i) => `file '${x.f.replace(/\\/g, "/")}'\nduration ${(((frames[i + 1]?.t ?? x.t + 120) - x.t) / 1000).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f.replace(/\\/g, "/")}'\n`;
  writeFileSync(join(tmp, "frames.txt"), list);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(tmp, "frames.txt"), "-vf", "fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", join(OUT, "demo.gif")]);
  console.log("   demo.gif", r.status === 0 ? `${(statSync(join(OUT, "demo.gif")).size / 1048576).toFixed(1)} MB, ${frames.length} frames` : "ffmpeg failed: " + r.stderr);
} else console.log("ffmpeg not found: skipping the GIF");
// 5) group start that waits for a database that is not ready yet: live progress, then the failure list
const mock = (method, path) => new Promise((res) => http.request({ socketPath: sock, path: "/_demo" + path, method }, (r) => { r.resume(); r.on("end", res); }).end());
const shopIds = async () => (await (await fetch(`${BASE}/api/containers`)).json()).filter((c) => c.name.startsWith("shop-")).map((c) => c.id);
const batchApi = async (action) => fetch(`${BASE}/api/containers/batch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids: await shopIds() }) });
const startShop = () => ev(`[...document.querySelectorAll('button[aria-label^="Start all: "]')].find(b=>/shop/i.test(b.getAttribute('aria-label'))).click()`);
console.log("Progress …");
await batchApi("stop"); await mock("POST", "/health/shop-db/starting"); await sleep(600);
await open({ h: 1000 }); await startShop(); await sleep(3600); await png("progress");
await click("Cancel"); await sleep(1500);
// the same start, but with a 3 s limit so the wait ends in failures
procs[1].kill(); await sleep(600);
procs[1] = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: join(tmp, "data"), ALERT_HOST: "demo-server", TELEGRAM_API_URL: "http://127.0.0.1:9", HEALTH_WAIT_SECONDS: "3" }, stdio: "ignore" });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* booting */ } await sleep(500); }
await batchApi("stop"); await sleep(600);
await open({ h: 1000 }); await startShop(); await sleep(7000);
await png("health-failure");
await mock("POST", "/health/shop-db/none");
console.log("Done.");
process.exit(0);
