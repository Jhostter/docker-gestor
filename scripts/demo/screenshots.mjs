// Regenerates the README screenshots, the demo GIF and the social preview image.
// It runs Docker Gestor against the fictional mock Docker API, so no real containers are involved.
//   npm run build && node scripts/demo/screenshots.mjs [outputDir]
// Requires Chrome/Chromium (set CHROME_PATH if it is not on the PATH) and ffmpeg (only for the GIF).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";

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
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: join(tmp, "data") }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* booting */ } await sleep(500); }

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
async function open({ lang = "en", theme = "dark", w = 1400, h = 860 } = {}) {
  await view(w, h); await send("Page.navigate", { url: BASE }); await sleep(1200);
  await ev(`localStorage.setItem("lang","${lang}"); localStorage.setItem("theme","${theme}"); document.documentElement.dataset.theme="${theme}"`);
  await send("Page.navigate", { url: BASE }); await sleep(3200);
}
// click a button by aria-label or text; optionally restricted to the row/card that mentions `within`
const click = (label, within) => ev(`(() => { const all=[...document.querySelectorAll('button,a')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)}||e.textContent.trim().startsWith(${JSON.stringify(label)}));
  const b = ${within ? `all.find(e=>(e.closest('.grid')||e.parentElement).textContent.includes(${JSON.stringify(within)}))` : "all[0]"}; if(b){b.click();return true} return false })()`);
// click the "Add" button inside the fieldset whose legend is `legend`
const addIn = async (legend) => { await ev(`[...document.querySelectorAll('fieldset')].find(f=>f.querySelector('legend').textContent===${JSON.stringify(legend)}).querySelector('button').click()`); await sleep(250); };
const type = async (selector, text) => { await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`); await send("Input.insertText", { text }); };
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const esc = async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(350); };

console.log("Screenshots →", OUT);
await open(); await png("containers-dark");
await open({ theme: "light" }); await png("containers-light");
await open({ lang: "es" }); await png("containers-es");

await open(); await click("View logs", "shop-api"); await sleep(2600); await png("logs"); await esc();

await open(); await click("Usage chart", "shop-api"); await sleep(1500); await click("24 h"); await sleep(1200);
const box = JSON.parse(await ev(`JSON.stringify(document.querySelector('[role=dialog] svg[role=img]').getBoundingClientRect())`)); await mouse(box.x + box.width * 0.64, box.y + box.height / 2); await sleep(400); await png("chart"); await esc();

await open(); await click("New container"); await sleep(500);
await type('input[list="local-images"]', "nginx:1.27-alpine");
await addIn("Ports"); await type('input[aria-label="Ports 1"]', "8080:80");
await addIn("Environment variables"); await type('input[aria-label="Environment variables 1"]', "TZ=Europe/Madrid");
await addIn("Volumes"); await type('input[aria-label="Volumes 1"]', "web_data:/usr/share/nginx/html:ro"); await sleep(300); await png("create");

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
<div class=l><h1>🐳 Docker Gestor</h1><p>A lightweight, local web dashboard for Docker.</p><div class=chips><span>~55 MB RAM</span><span>live logs</span><span>terminal</span><span>Compose</span><span>usage history</span></div></div><img src="data:image/png;base64,${shot}">`;
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
  await click("Usage chart", "shop-api"); await sleep(1400);
  const b2 = JSON.parse(await ev(`JSON.stringify(document.querySelector('[role=dialog] svg[role=img]').getBoundingClientRect())`));
  for (let i = 0; i <= 20; i++) { await mouse(b2.x + b2.width * (0.25 + i * 0.03), b2.y + b2.height / 2); await sleep(60); }
  await click("24 h"); await sleep(1500); await esc();
  await click("Compose"); await sleep(1300); await click("Events"); await sleep(2000); await click("Containers"); await sleep(900);
  await click("Light theme"); await sleep(1400); await click("Change language"); await sleep(1600);
  rec = false; await recorder;
  const list = frames.map((x, i) => `file '${x.f.replace(/\\/g, "/")}'\nduration ${(((frames[i + 1]?.t ?? x.t + 120) - x.t) / 1000).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f.replace(/\\/g, "/")}'\n`;
  writeFileSync(join(tmp, "frames.txt"), list);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(tmp, "frames.txt"), "-vf", "fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", join(OUT, "demo.gif")]);
  console.log("   demo.gif", r.status === 0 ? `${(statSync(join(OUT, "demo.gif")).size / 1048576).toFixed(1)} MB, ${frames.length} frames` : "ffmpeg failed: " + r.stderr);
} else console.log("ffmpeg not found: skipping the GIF");
console.log("Done.");
process.exit(0);
