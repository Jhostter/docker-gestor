// End-to-end check of drag and drop between custom groups with a REAL mouse drag: Chrome's DevTools drag
// interception replays the native drag over the page. Needs Chrome/Chromium (set CHROME_PATH if it is not on the PATH).
//   npm run build && npm run e2e:dnd
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), "dg-dnd-")), sock = join(tmp, "m.sock"), PORT = 4489, BASE = `http://localhost:${PORT}`;
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); rmSync(tmp, { recursive: true, force: true }); });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }
const put = (b) => fetch(BASE + "/api/groups", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
await put({ names: ["shop-web", "grafana"], group: "Frontend" }); await put({ names: ["shop-db"], group: "Data" });
const groups = async () => (await (await fetch(BASE + "/api/groups")).json()).assignments;

const chrome = process.env.CHROME_PATH ?? ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].find((c) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0);
if (!chrome) { console.error("Chrome/Chromium not found. Set CHROME_PATH."); process.exit(1); }
procs.push(spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", ...(process.env.CI ? ["--no-sandbox"] : []), `--user-data-dir=${tmp}/chrome`, "--remote-debugging-port=9997", "about:blank"], { stdio: "ignore" }));
let page; for (let i = 0; i < 40 && !page; i++) { try { page = (await (await fetch("http://127.0.0.1:9997/json")).json()).find((t) => t.type === "page"); } catch {} await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.on("open", r));
let id = 0; const w = new Map(); const errors = []; let intercepted = null;
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && w.has(d.id)) w.get(d.id)(d); if (d.method === "Input.dragIntercepted") intercepted = d.params.data; if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const text = () => ev("document.body.innerText"), dlg = () => ev(`document.querySelector('[role=dialog]')?.innerText ?? ""`);
const rect = (sel) => ev(`(()=>{const e=${sel};if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
const handle = (name) => `document.querySelector('[data-drag-handle="${name}"]')`;
const groupBox = (label) => `[...document.querySelectorAll('button[aria-expanded]')].find(b=>b.textContent.toLowerCase().includes(${JSON.stringify(label.toLowerCase())}))?.closest('div[class]')?.parentElement`;
const zone = (txt) => `[...document.querySelectorAll('div')].find(d=>d.children.length===0&&d.textContent.trim()===${JSON.stringify(txt)})`;
const click = (label) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(b&&!b.disabled){b.click();return true}return false})()`);

/** A real mouse drag from `from` to `to`, replayed through Chrome's drag interception. Keeps the drag open if hold=true. */
async function drag(fromSel, toSel, { hold = false } = {}) {
  intercepted = null;
  const a = await rect(fromSel); if (!a) throw new Error("no handle: " + fromSel);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 4; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + i * 6, y: a.y + i * 6, button: "left", buttons: 1 });
  for (let i = 0; i < 20 && !intercepted; i++) await sleep(100);
  if (!intercepted) throw new Error("drag did not start");
  await sleep(250); // let React render the drop zones
  const b = await rect(toSel); if (!b) throw new Error("no target: " + toSel);
  await send("Input.dispatchDragEvent", { type: "dragEnter", x: b.x, y: b.y, data: intercepted });
  await send("Input.dispatchDragEvent", { type: "dragOver", x: b.x, y: b.y, data: intercepted });
  await sleep(200);
  if (hold) return { b, data: intercepted };
  await send("Input.dispatchDragEvent", { type: "drop", x: b.x, y: b.y, data: intercepted });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(900);
}

await send("Runtime.enable"); await send("Page.enable"); await send("Input.setInterceptDrags", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1500, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `if(!localStorage.getItem("seeded")){localStorage.setItem("lang","en");localStorage.setItem("groupMode","custom");localStorage.setItem("seeded","1")}
  const f=window.fetch; window.fetch=(u,o)=>{ if(window.__failNext && String(u).includes('/api/groups') && o?.method==='PUT'){ window.__failNext=false; return Promise.resolve(new Response(JSON.stringify({error:'boom',code:'invalid_group_op'}),{status:400,headers:{'content-type':'application/json'}})) } return f(u,o) }` });
await send("Page.navigate", { url: BASE }); await sleep(3000);

check(!!(await ev(`!!document.querySelector('[data-drag-handle="shop-api"]')`)), "in My groups every row has a drag handle");
check(!(await ev(`!!document.body.innerText.match(/Drop here to create/)`)), "the drop zones are hidden until you start dragging");

// A) one container onto another group
await drag(handle("shop-api"), groupBox("Data"));
let g = await groups(); let t = await text();
check(g["shop-api"] === "Data" && /1 container moved to “Data”/.test(t), "dragging a row onto a group moves it there, and the server has it");
check(/DATA\s*\(2\)/i.test(t), "the group header updates");

// B) dragging a selected row drags the whole selection
await ev(`document.querySelector('input[aria-label="Select shop-cache"]').click(); document.querySelector('input[aria-label="Select shop-worker"]').click()`); await sleep(200);
await drag(handle("shop-cache"), groupBox("Frontend"));
g = await groups();
check(g["shop-cache"] === "Frontend" && g["shop-worker"] === "Frontend", "dragging a selected row moves the whole selection");
await click("Clear selection");

// C) same group = nothing happens
const before = JSON.stringify(await groups());
await drag(handle("shop-db"), groupBox("Data"));
check(JSON.stringify(await groups()) === before && !/moved to “Data”/.test((await text()).split("Groups updated").pop()), "dropping on the group it is already in does nothing");

// D) remove zone
await drag(handle("grafana"), zone("Drop here to take them out of their group"));
g = await groups();
check(g["grafana"] === undefined && /taken out of its group/.test(await text()), "dropping on the remove zone takes it out of its group");

// E) new group zone: asks for a name
await drag(handle("mailpit"), zone("Drop here to create a new group"), { hold: true }).then(async ({ b, data }) => {
  await send("Input.dispatchDragEvent", { type: "drop", x: b.x, y: b.y, data });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(700);
});
check(/New group/.test(await dlg()), "dropping on the new-group zone asks for a name");
await ev(`(()=>{const e=document.querySelector('[role=dialog] input');e.focus()})()`); await send("Input.insertText", { text: "Experiments" });
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Move').click()`); await sleep(1200);
g = await groups();
check(g["mailpit"] === "Experiments" && /EXPERIMENTS\s*\(1\)/i.test(await text()), "the new group is created with the dropped container");

// F) server refuses: roll back and report
await ev("window.__failNext = true");
await drag(handle("node-exporter"), groupBox("Experiments"));
await sleep(500); t = await text();
check((await groups())["node-exporter"] === undefined && !/NODE-EXPORTER[\s\S]{0,40}EXPERIMENTS/i.test(t) && /EXPERIMENTS\s*\(1\)/i.test(t), "if the server refuses, the screen goes back to how it was");
check(/not valid/.test(t), "and the error is shown");

// G) persistence and stack mode
await send("Page.navigate", { url: BASE }); await sleep(3000);
check(/EXPERIMENTS\s*\(1\)/i.test(await text()) && /DATA\s*\(2\)/i.test(await text()) && /FRONTEND\s*\(3\)/i.test(await text()), "after a reload the groups are as they were dropped");
await click("Stack"); await sleep(500);
check(!(await ev(`!!document.querySelector('[data-drag-handle]')`)), "in Stack mode there are no drag handles (stacks come from Compose)");
check(errors.length === 0, `no JavaScript errors${errors.length ? ": " + errors[0] : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
