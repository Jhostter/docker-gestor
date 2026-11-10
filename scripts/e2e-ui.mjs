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
check(await ev(`!!document.querySelector('[role=menu]') && document.querySelectorAll('[role=menuitem]').length`) === 6 && await ev(`document.querySelector('button[aria-haspopup=menu][aria-expanded=true]')?.getAttribute('aria-haspopup')`) === "menu", "the ⋯ button opens an ARIA menu with 6 items");
const items = await ev(`[...document.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join("|")`);
check(items === "Details|Restart|Open terminal|Usage chart|Silence alerts…|Delete", `with the expected items (${items})`);
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

// ---- usage figures
await load({ density: "comfortable" });
const cards = () => ev(`[...document.querySelectorAll('section[aria-label=Containers] > div.grid > div')].map(c=>c.innerText.replace(/\\n+/g," | "))`);
let cd = await cards();
check(cd.length === 4 && /Running \| \d+ \| of \d+ containers/.test(cd[0]) && /Total CPU \| [\d.]+% \| Top: [\w-]+ · [\d.]+%/.test(cd[1]) && /Memory \| [\d.]+ \w+ of [\d.]+ \w+ \| Top: [\w-]+ · [\d.]+ \w+/.test(cd[2]), `the summary cards show totals, the host memory and who uses the most (${cd[1]} / ${cd[2]})`);
check(await ev(`!![...document.querySelectorAll('section[aria-label=Containers] > div.grid [role=meter]')].length`) && await ev(`document.querySelectorAll('section[aria-label=Containers] > div.grid [role=meter]').length`) === 2, "with a meter for running containers and one for memory against the host");
check(await ev(`!!${rowOf("shop-api")}.querySelector('[data-metric=cpu] [role=meter]') && !!${rowOf("shop-api")}.querySelector('[data-metric=mem] [role=meter]')`), "each running row has CPU and RAM meters");
check(await ev(`${rowOf("old-experiment")}.querySelector('[data-metric=cpu]').innerText.includes('–') && ${rowOf("old-experiment")}.querySelector('[data-metric=mem]').innerText.includes('–')`), "a stopped container shows dashes instead of numbers");
await sleep(11500); // the page samples every 10 s: after two samples the trend lines can be drawn
check(await ev(`!!${rowOf("shop-api")}.querySelector('[data-metric=cpu] svg[role=img] polyline') && !!${rowOf("shop-api")}.querySelector('[data-metric=mem] svg[role=img] polyline')`), "after a couple of samples each row draws its CPU and memory trend");
check(await ev(`document.querySelectorAll('section[aria-label=Containers] > div.grid svg[role=img] polyline').length`) >= 1, "and so does the CPU card");
check(await ev(`[...${rowOf("shop-api")}.querySelectorAll('svg[role=img]')].every(s=>/trend/i.test(s.getAttribute('aria-label')))`), "the trends have an accessible description");

// ---- sorting by usage
await ev(`localStorage.setItem("groupMode","none")`); await load({ density: "comfortable" });
const names = () => ev(`[...document.querySelectorAll('section[aria-label=Containers] div.grid')].filter(r=>r.querySelector('[data-metric]')).map(r=>r.querySelector('button[title*=" — "]').innerText)`);
const nums = (k) => ev(`[...document.querySelectorAll('section[aria-label=Containers] div.grid')].filter(r=>r.querySelector('[data-metric]')).map(r=>{const t=r.querySelector('[data-metric=${k}] span.tabular-nums').innerText; return t==='–'?null:parseFloat(t)})`);
const base = await names();
check(await ev(`[...document.querySelectorAll('button[aria-pressed]')].filter(b=>/^Sort by/.test(b.getAttribute('aria-label'))).length`) === 3, "the Container, CPU and RAM headings are sort buttons");
await ev(`document.querySelector('button[aria-label="Sort by CPU"]').click()`); await sleep(500);
let cpuVals = (await nums("cpu")).filter((x) => x !== null), ordered = cpuVals.every((v, i) => i === 0 || cpuVals[i - 1] >= v);
check(ordered && cpuVals.length >= 5 && await ev(`document.querySelector('button[aria-label="Sort by CPU"]').getAttribute('aria-pressed')`) === "true", `sorting by CPU puts the biggest first (${cpuVals.slice(0, 4).join(", ")}…)`);
const withStopped = await nums("cpu"), firstNull = withStopped.indexOf(null); check(firstNull > 0 && withStopped.slice(firstNull).every((x) => x === null), "and stopped containers go last");
await ev(`document.querySelector('button[aria-label="Sort by RAM"]').click()`); await sleep(500);
const memTxt = await ev(`[...document.querySelectorAll('section[aria-label=Containers] div.grid')].filter(r=>r.querySelector('[data-metric]')).map(r=>r.querySelector('[data-metric=mem] span.tabular-nums').innerText)`);
const toMB = (t) => { const m = /([\d.]+)\s*(\w+)/.exec(t); return m ? parseFloat(m[1]) * ({ B: 1e-6, KB: 1e-3, MB: 1, GB: 1e3 }[m[2]] ?? 1) : -1; };
const memMB = memTxt.map(toMB).filter((x) => x >= 0);
check(memMB.every((v, i) => i === 0 || memMB[i - 1] >= v - 0.5) && await ev(`localStorage.getItem("sortBy")`) === "mem", "sorting by RAM does the same, and the choice is remembered");
await load({ density: "comfortable" });
check(await ev(`document.querySelector('button[aria-label="Sort by RAM"]').getAttribute('aria-pressed')`) === "true", "it survives a reload");
await ev(`document.querySelector('button[aria-label="Sort by RAM"]').click()`); await sleep(400);
check(JSON.stringify(await names()) === JSON.stringify(base), "clicking the active heading again goes back to Docker's order");
await ev(`document.querySelector('button[aria-label="Sort by Container"]').click()`); await sleep(400);
const alpha = await names(); check(JSON.stringify(alpha) === JSON.stringify([...alpha].sort((a, b) => a.localeCompare(b))), "sorting by name is A→Z");
await ev(`document.querySelector('button[aria-label="Sort by Container"]').click()`); await ev(`localStorage.setItem("groupMode","stack")`);

// ---- silencing alerts from a container
await load({ density: "comfortable" });
const mutesNow = async () => (await (await fetch(BASE + "/api/alerts/config")).json()).mutes;
const itemsOf = (n) => ev(`(${menuBtn(n)}.click(), new Promise(r=>setTimeout(()=>r([...document.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join("|")),250)))`);
const pick = async (label) => { await ev(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.innerText.trim()==${JSON.stringify(label)}).click()`); await sleep(500); };
check(!(await ev(`!!${rowOf("shop-api")}.querySelector('[class*=text-muted] svg') && /Alerts silenced/.test(${rowOf("shop-api")}.innerText)`)), "nothing is silenced at first");
await itemsOf("shop-api"); await pick("Silence alerts…");
t = await dlg();
check(/Silence alerts for shop-api/.test(t) && /Only this container/.test(t) && /The whole “shop” stack/.test(t) && /1 hour/.test(t) && /8 hours/.test(t) && /24 hours/.test(t) && /Until I lift it/.test(t), "the dialog offers this container or its whole stack, and four durations");
await ev(`[...document.querySelectorAll('[role=dialog] label')].find(l=>/Until I lift it/.test(l.innerText)).querySelector('input').click()`);
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.type==='submit').click()`); await sleep(900);
let mm = await mutesNow();
check(mm.length === 1 && mm[0].kind === "container" && mm[0].name === "shop-api" && mm[0].until === null, "silencing it forever is saved on the server");
check(/Alerts for shop-api silenced/.test(await text()) && !(await ev(`!!document.querySelector('[role=dialog]')`)), "with a confirmation, and the dialog closes");
check(await ev(`/Alerts silenced/.test(${rowOf("shop-api")}.innerText) && !/Alerts silenced/.test(${rowOf("shop-db")}.innerText)`), "the row shows a bell-off mark, and only that row");
let it = await itemsOf("shop-api");
check(/Unsilence alerts/.test(it) && !/Silence alerts…/.test(it), "its menu now offers to lift the silence");
await pick("Unsilence alerts"); mm = await mutesNow();
check(mm.length === 0 && !(await ev(`/Alerts silenced/.test(${rowOf("shop-api")}.innerText)`)), "which removes the silence and the mark");
await itemsOf("shop-db"); await pick("Silence alerts…");
await ev(`[...document.querySelectorAll('[role=dialog] label')].find(l=>/whole “shop” stack/.test(l.innerText)).querySelector('input').click()`);
await ev(`[...document.querySelectorAll('[role=dialog] label')].find(l=>/8 hours/.test(l.innerText)).querySelector('input').click()`);
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.type==='submit').click()`); await sleep(900);
mm = await mutesNow();
check(mm.length === 1 && mm[0].kind === "stack" && mm[0].name === "shop" && Math.abs(mm[0].until - Date.now() - 8 * 3600e3) < 120e3, "a stack silence for 8 hours is saved with the right expiry");
check(await ev(`["shop-api","shop-db","shop-web"].every(n=>[...document.querySelectorAll('div.grid')].find(r=>r.querySelector('button[title^="'+n+' —"]'))?.innerText.includes('Alerts silenced')) && ![...document.querySelectorAll('div.grid')].find(r=>r.querySelector('button[title^="grafana —"]')).innerText.includes('Alerts silenced')`), "every container of the stack shows the mark, and other stacks do not");
await itemsOf("shop-web"); await pick("Unsilence alerts");
check((await mutesNow()).length === 0, "lifting it from any container of the stack lifts the stack silence");

// ---- alerts settings
await ev(`[...document.querySelectorAll('nav button')].find(b=>/Alerts/.test(b.innerText)).click()`); await sleep(1500);
t = await text();
check(/Tell me when it is resolved/.test(t) && /silenced/i.test(t) && /Nothing is silenced/.test(t), "the Alerts page has the recovery switch and the Silenced list");
check(await ev(`document.querySelectorAll('input[placeholder="names separated by commas"]').length`) === 4, "rules that are on offer an ignore list and their own repeat interval (4 are on by default)");
await ev(`document.querySelectorAll('input[placeholder="names separated by commas"]')[1].focus()`); await type("shop-web, mailpit,");
check(await ev(`document.querySelectorAll('input[placeholder="names separated by commas"]')[1].value`) === "shop-web, mailpit,", "typing a list keeps what you typed, trailing comma included");
await ev(`document.querySelectorAll('input[placeholder="global"]')[1].focus()`); await type("3");
await ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==="Save changes").click()`); await sleep(1200);
const saved = await (await fetch(BASE + "/api/alerts/config")).json();
check(JSON.stringify(saved.rules.oom.exclude) === '["shop-web","mailpit"]' && saved.rules.oom.cooldownMinutes === 3, `saving stores the exclusions and the per-rule interval (${JSON.stringify(saved.rules.oom.exclude)}, ${saved.rules.oom.cooldownMinutes})`);
await ev(`(()=>{const sel=document.querySelector('select[aria-label="For"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(document.querySelector('select[aria-label="Container"]')||sel,'container')})()`);
await ev(`(()=>{const i=document.querySelector('input[aria-label="container or stack name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'mailpit'); i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(200);
await ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==="Silence" && b.type==="submit").click()`); await sleep(900);
check(/mailpit/.test(await ev(`[...document.querySelectorAll('h3')].find(h=>h.innerText.toLowerCase()==='silenced').parentElement.innerText`)) && (await mutesNow()).some((m) => m.name === "mailpit"), "a silence added by name appears in the Silenced list");
await ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==="Unsilence").click()`); await sleep(900);
check((await mutesNow()).length === 0, "and can be lifted from there");
await ev(`localStorage.setItem("lang","es")`); await load({ lang: "es" });
await ev(`${menuBtn("shop-api")}.click()`); await sleep(250); await ev(`[...document.querySelectorAll('[role=menuitem]')].find(i=>/Silenciar alertas/.test(i.innerText)).click()`); await sleep(500);
t = await dlg(); check(/Silenciar alertas de shop-api/.test(t) && /Solo este contenedor/.test(t) && /Todo el stack «shop»/.test(t) && /Hasta que lo reactive/.test(t), "the silence dialog is available in Spanish");
await key("Escape"); await sleep(300);
await load();

// ---- loading skeleton
await load({ slow: true });
check(await ev(`!!document.querySelector('[role=status][aria-label="Loading…"]') && !document.body.innerText.includes('shop-api')`), "while data loads, a skeleton holds the layout instead of a spinner text");
await sleep(3800);
check(!(await ev(`!!document.querySelector('[role=status][aria-label="Loading…"]')`)) && /shop-api/.test(await text()), "and it is replaced by the rows");

// ---- Spanish
await load({ lang: "es" });
check(await ev(`[...document.querySelectorAll('nav [role=group]')].map(g=>g.getAttribute('aria-label')).join()`) === "Gestionar,Observar" && /Buscar…/.test(await ev(`document.querySelector('aside').innerText`)), "the new navigation is available in Spanish");
await ev(`${menuBtn("shop-api")}.click()`); await sleep(250);
check(await ev(`[...document.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join("|")`) === "Detalles|Reiniciar|Abrir terminal|Gráfica de consumo|Silenciar alertas…|Eliminar", "and so is the row menu");
await key("Escape");

// ---- mobile
await load({ w: 390, h: 800 });
check(await ev(`(()=>{const b=document.querySelector('aside button.ml-auto');return !!b && b.getBoundingClientRect().width > 0 && b.getAttribute('aria-label')==='Search or jump to…'})()`), "on a phone the search is an icon in the header");
check(await ev(`(()=>{const c=document.querySelector('input[type=checkbox][aria-label^="Select shop"]');return c.getBoundingClientRect().left<60})()`), "and the row checkbox sits at the left, not centred");
check(await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), "with no horizontal scrolling of the page");
check(errors.length === 0, `no JavaScript errors${errors.length ? ": " + errors[0] : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
