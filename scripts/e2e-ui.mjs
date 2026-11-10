// Browser test of the interface structure and keyboard/accessibility behaviour: sidebar sections, row actions menu,
// command palette, density, loading skeleton, Spanish and the mobile layout. Needs Chrome/Chromium (CHROME_PATH).
//   npm run build && npm run e2e:ui
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), "dg-ui-")), sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-ui-${process.pid}` : join(tmp, "m.sock"), PORT = 4481, BASE = `http://localhost:${PORT}`;
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }
const chrome = process.env.CHROME_PATH ?? ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].find((c) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0);
if (!chrome) { console.error("Chrome/Chromium not found. Set CHROME_PATH."); process.exit(1); }
procs.push(spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", ...(process.env.CI ? ["--no-sandbox"] : []), `--user-data-dir=${tmp}/chrome`, "--remote-debugging-port=9993", "about:blank"], { stdio: "ignore" }));
let page; for (let i = 0; i < 40 && !page; i++) { try { page = (await (await fetch("http://127.0.0.1:9993/json")).json()).find((t) => t.type === "page"); } catch {} await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.on("open", r));
let id = 0; const w = new Map(); const errors = [];
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && w.has(d.id)) w.get(d.id)(d); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const KEYS = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Home: 36, End: 35, Tab: 9, k: 75 };
// Enter must carry its character ("\r"), like a real key press, or a focused button is not activated
const key = async (k, { ctrl = false } = {}) => { const base = { key: k, code: k.length === 1 ? "Key" + k.toUpperCase() : k, windowsVirtualKeyCode: KEYS[k], modifiers: ctrl ? 2 : 0 }; await send("Input.dispatchKeyEvent", k === "Enter" ? { type: "keyDown", text: "\r", ...base } : { type: "rawKeyDown", ...base }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }); await sleep(120); };
const type = async (text) => { await send("Input.insertText", { text }); await sleep(200); };
const text = () => ev("document.body.innerText"), dlg = () => ev(`document.querySelector('[role=dialog]')?.innerText ?? ""`);
const load = async (o = {}) => { await send("Emulation.setDeviceMetricsOverride", { width: o.w ?? 1400, height: o.h ?? 900, deviceScaleFactor: 1, mobile: (o.w ?? 1400) < 600 });
  await send("Page.navigate", { url: BASE }); await sleep(900); await ev(`localStorage.setItem("lang","${o.lang ?? "en"}");localStorage.setItem("density","${o.density ?? "comfortable"}");localStorage.setItem("slow","${o.slow ? 1 : 0}")`); await send("Page.navigate", { url: BASE }); await sleep(o.slow ? 500 : 3200); };
const rowOf = (name) => `[...document.querySelectorAll('div.grid')].find(r=>r.querySelector('button[title^="${name} —"],button[title^="${name}"]'))`;
const menuBtn = (name) => `document.querySelector('button[aria-label^="More actions: ${name}"],button[aria-label^="Más acciones: ${name}"]')`;

await send("Runtime.enable"); await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `const f=window.fetch; window.fetch=(u,o)=>{ if(localStorage.getItem("slow")==="1" && /\\/api\\/containers(\\?|$)/.test(String(u)) && !o && performance.now()<2200){ const wait=2200-performance.now(); return new Promise(r=>setTimeout(()=>r(f(u,o)),wait)) } return f(u,o) }` });
await load();

// ---- structure
check(await ev(`[...document.querySelectorAll('nav [role=group]')].map(g=>g.getAttribute('aria-label')).join()`) === "Manage,Observe", "the sidebar is organised in two sections: Manage and Observe");
check(await ev(`[...document.querySelectorAll('nav [role=group]')][0].innerText.includes('Containers') && [...document.querySelectorAll('nav [role=group]')][1].innerText.includes('Disk')`), "with the right sections in each");
check(/^Containers$/.test(await ev(`document.querySelector('main h2')?.innerText`)), "each page has a title");
check(/Search…/.test(await ev(`document.querySelector('aside button')?.parentElement?.innerText + document.body.innerText`)), "the sidebar has a search / palette button");

// ---- row actions
const labels = await ev(`[...${rowOf("shop-api")}.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).join("|")`);
check(labels === "Stop|View logs|More actions: shop-api", `a row shows just Stop, Logs and a menu (${labels})`);
await ev(`${menuBtn("shop-api")}.focus()`); await key("Enter"); await sleep(200);
check(await ev(`!!document.querySelector('[role=menu]') && document.querySelectorAll('[role=menuitem]').length`) === 5 && await ev(`document.querySelector('button[aria-haspopup=menu][aria-expanded=true]')?.getAttribute('aria-haspopup')`) === "menu", "the ⋯ button opens an ARIA menu with 5 items");
const items = await ev(`[...document.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join("|")`);
check(items === "Details|Restart|Open terminal|Usage chart|Delete", `with the expected items (${items})`);
check(await ev(`[...document.querySelectorAll('[role=menuitem]')].at(-1).className.includes('text-bad') && !!document.querySelector('[role=separator]')`), "Delete is last, red and set apart by a separator");
const active = () => ev(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.className.includes('bg-surface2')||i.className.includes('bg-bad/15'))?.innerText.trim()`);
check(await active() === "Details", "the first item is highlighted");
await key("ArrowDown"); await key("ArrowDown");
check(await active() === "Open terminal", "the arrow keys move the highlight");
await key("End"); check(await active() === "Delete", "End goes to the last item"); await key("ArrowDown"); check(await active() === "Details", "and the arrow wraps around");
await key("Escape");
check(!(await ev(`!!document.querySelector('[role=menu]')`)) && await ev(`document.activeElement?.getAttribute('aria-label')`) === "More actions: shop-api", "Escape closes the menu and returns focus to the button that opened it");
await ev(`${menuBtn("shop-api")}.click()`); await sleep(200);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 12, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 12, button: "left", clickCount: 1 }); await sleep(200);
check(!(await ev(`!!document.querySelector('[role=menu]')`)), "clicking outside closes it");
await ev(`${menuBtn("shop-api")}.click()`); await sleep(200); await key("Enter"); await sleep(1200);
check(/Details · shop-api/.test(await dlg()) && !(await ev(`!!document.querySelector('[role=menu]')`)), "Enter on an item runs it and closes the menu");
await key("Escape"); await sleep(300);

// ---- command palette
await key("k", { ctrl: true }); await sleep(700);
check(await ev(`document.querySelector('[role=dialog]')?.getAttribute('aria-label')`) === "Search or jump to…" && await ev(`document.activeElement?.getAttribute('role')`) === "combobox", "Ctrl+K opens the palette with the search field focused");
let t = await dlg();
check(/SECTIONS/i.test(t) && /ACTIONS/i.test(t) && /Go to Containers/.test(t) && !/Details · shop-api/.test(t), "with no query it lists sections and actions, not hundreds of container commands");
await type("logs api"); const first = await ev(`document.querySelector('[role=option]')?.innerText.split("\\n")[0]`);
check(first === "Logs · shop-api", `typing finds the best match first (${first})`);
check(await ev(`document.querySelectorAll('[role=option]').length`) >= 1 && !/mailpit/.test(await dlg()), "and does not drag in unrelated containers");
await key("ArrowDown"); const sel = await ev(`[...document.querySelectorAll('[role=option]')].findIndex(o=>o.getAttribute('aria-selected')==='true')`);
check(sel === 1 || (await ev(`document.querySelectorAll('[role=option]').length`)) === 1, "the arrow keys move the selection");
await key("ArrowUp"); await key("Enter"); await sleep(1200);
check(/Logs · shop-api/.test(await dlg()) && !(await ev(`!!document.querySelector('[role=dialog][aria-label="Search or jump to…"]')`)), "Enter runs it: the palette closes and the logs open");
await key("Escape"); await sleep(300);
await key("k", { ctrl: true }); await sleep(500); await key("k", { ctrl: true }); await sleep(300);
check(!(await ev(`!!document.querySelector('[role=dialog][aria-label="Search or jump to…"]')`)), "Ctrl+K again closes it");
await key("k", { ctrl: true }); await sleep(400); await type("zzzzq");
check(/Nothing matches your search/.test(await dlg()), "a search with no result says so");
await key("Escape"); await sleep(300);
await ev(`document.querySelector('input[placeholder^="Search ("]').focus()`); await key("k", { ctrl: true }); await sleep(400);
check(!!(await ev(`!!document.querySelector('[role=dialog][aria-label="Search or jump to…"]')`)), "it also opens while you are typing in another field");
await type("images"); await key("Enter"); await sleep(1200);
check(/^Images$/.test(await ev(`document.querySelector('main h2')?.innerText`)), "it navigates to a section");
await key("k", { ctrl: true }); await sleep(400); await type("toggle theme"); const before = await ev("document.documentElement.dataset.theme || 'none'"); await key("Enter"); await sleep(400);
check(await ev("document.documentElement.dataset.theme || 'none'") !== before, "and runs an action (toggle theme)");

// ---- density
await load();
const compactBtn = `document.querySelector('button[aria-label="Compact view"]')`;
check(await ev(`${compactBtn}.getAttribute('aria-pressed')`) === "false" && /ghcr\.io\/acme\/shop-api/.test(await ev(`${rowOf("shop-api")}.innerText`)), "rows are comfortable by default (image and status line visible)");
await ev(`${compactBtn}.click()`); await sleep(300);
check(await ev(`document.querySelector('button[aria-label="Comfortable view"]').getAttribute('aria-pressed')`) === "true" && !/ghcr\.io\/acme\/shop-api/.test(await ev(`${rowOf("shop-api")}.innerText`)), "compact view hides the secondary lines");
await load({ density: "compact" });
check(await ev(`!!document.querySelector('button[aria-label="Comfortable view"]')`), "the density choice is remembered");

// ---- loading skeleton
await load({ slow: true });
check(await ev(`!!document.querySelector('[role=status][aria-label="Loading…"]') && !document.body.innerText.includes('shop-api')`), "while data loads, a skeleton holds the layout instead of a spinner text");
await sleep(3800);
check(!(await ev(`!!document.querySelector('[role=status][aria-label="Loading…"]')`)) && /shop-api/.test(await text()), "and it is replaced by the rows");

// ---- Spanish
await load({ lang: "es" });
check(await ev(`[...document.querySelectorAll('nav [role=group]')].map(g=>g.getAttribute('aria-label')).join()`) === "Gestionar,Observar" && /Buscar…/.test(await ev(`document.querySelector('aside').innerText`)), "the new navigation is available in Spanish");
await ev(`${menuBtn("shop-api")}.click()`); await sleep(250);
check(await ev(`[...document.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join("|")`) === "Detalles|Reiniciar|Abrir terminal|Gráfica de consumo|Eliminar", "and so is the row menu");
await key("Escape");

// ---- mobile
await load({ w: 390, h: 800 });
check(await ev(`(()=>{const b=document.querySelector('aside button.ml-auto');return !!b && b.getBoundingClientRect().width > 0 && b.getAttribute('aria-label')==='Search or jump to…'})()`), "on a phone the search is an icon in the header");
check(await ev(`(()=>{const c=document.querySelector('input[type=checkbox][aria-label^="Select shop"]');return c.getBoundingClientRect().left<60})()`), "and the row checkbox sits at the left, not centred");
check(await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), "with no horizontal scrolling of the page");
check(errors.length === 0, `no JavaScript errors${errors.length ? ": " + errors[0] : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
