#!/usr/bin/env node
// A status icon for Docker Kong in the system tray (Linux, macOS, Windows).
//   npm run tray:install      installs it and makes it start with your session
//   npm run tray              runs it in the foreground
// It only talks to the local Docker Kong API (http://127.0.0.1:$PORT, default 4455) and, on Linux, to your systemd
// user service. It never touches your containers. See docs/GUIDE.md ("Tray icon").
import { execFile, spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POLL_MS, actionFor, buildMenu, changedSlots, pickLang, summarize } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4455) || 4455, BASE = `http://127.0.0.1:${PORT}`;
const SERVICE = process.env.TRAY_SERVICE ?? "docker-gestor"; // the systemd user service to control (override: tests)
const log = (...a) => console.log("[tray]", ...a);
const debug = process.env.TRAY_DEBUG ? log : () => {};

/** Same data folder as the app (honors DATA_DIR / XDG_DATA_HOME). */
function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const h = homedir();
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(h, "AppData", "Local"), "docker-gestor");
  if (process.platform === "darwin") return join(h, "Library", "Application Support", "docker-gestor");
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), "docker-gestor");
}

/* ---- one icon per session: the lock is a socket that dies with the process, so there is never a stale lock ---- */
const lockPath = () => process.env.TRAY_LOCK ? process.env.TRAY_LOCK : process.platform === "win32" ? "\\\\.\\pipe\\docker-gestor-tray" : join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), `docker-gestor-tray-${process.getuid?.() ?? 0}.sock`);
export function listen(path, onQuit) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((c) => { c.on("data", (d) => { if (String(d).trim() === "quit") onQuit(); }); c.on("error", () => {}); });
    srv.once("error", reject);
    srv.listen(path, () => { try { if (process.platform !== "win32") chmodSync(path, 0o600); } catch {} resolve(srv); });
  });
}
const alive = (path) => new Promise((res) => { const c = net.connect(path); c.once("connect", () => { c.end(); res(true); }); c.once("error", () => res(false)); });
async function acquireLock(onQuit) {
  const path = lockPath();
  try { return await listen(path, onQuit); }
  catch (e) {
    if (e.code !== "EADDRINUSE") throw e;
    if (await alive(path)) return null;                       // another icon is running
    if (process.platform !== "win32") { try { unlinkSync(path); } catch {} }
    return listen(path, onQuit);                              // the previous one died without cleaning up
  }
}

/* ---- systray2 ships its binary without the execute bit and its own chmod does not work on current Node: we copy it ourselves ---- */
function prepareBinary(require) {
  const names = { linux: "tray_linux_release", darwin: "tray_darwin_release", win32: "tray_windows_release.exe" };
  const name = names[process.platform];
  if (!name) throw new Error(`no tray binary for ${process.platform}`);
  const pkgDir = dirname(require.resolve("systray2/package.json"));
  const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  const src = join(pkgDir, "traybin", name), dir = join(dataDir(), "tray-bin"), dest = join(dir, version, name);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) copyFileSync(src, dest);
  if (process.platform !== "win32") chmodSync(dest, 0o755);
  return dir; // systray2 looks for <copyDir>/<version>/<binary>
}
const icon = (name) => readFileSync(join(HERE, "icons", `${name}.${process.platform === "win32" ? "ico" : "png"}`)).toString("base64");

/* ---- talking to Docker Kong ---- */
async function call(path, { method = "GET", body } = {}) {
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const sh = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 30000 }, (err, stdout, stderr) => res({ ok: !err, out: String(stdout) + String(stderr) })));
function openUrl(url) {
  if (process.env.TRAY_NO_OPEN) return log("open", url); // tests: do not launch a browser
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => log("could not open the browser; go to", url)).unref();
}

async function main() {
  const require = createRequire(import.meta.url);
  let SysTray;
  try { SysTray = require("systray2").default; }
  catch { console.error("The tray icon is not installed. Run: npm run tray:install"); process.exit(1); }

  let tray, current = { items: [] }, seenAt = Date.now(), stopping = false, timer;
  let saved = ""; try { saved = JSON.parse(readFileSync(join(dataDir(), "tray.json"), "utf8")).lang ?? ""; } catch {}
  const lang = pickLang(process.env, Intl.DateTimeFormat().resolvedOptions().locale, saved);
  const shutdown = async () => { if (stopping) return; stopping = true; clearInterval(timer); try { lock?.close(); } catch {} try { await tray?.kill(true); } catch { process.exit(0); } };
  const lock = await acquireLock(shutdown);
  if (!lock) { log("already running"); return; }

  const caps = { service: process.platform === "linux" && !process.env.TRAY_NO_SERVICE && (await sh("systemctl", ["--user", "cat", `${SERVICE}.service`])).ok };
  const toItem = (i) => i.id === "sep" ? { ...SysTray.separator, hidden: !!i.hidden } : { title: i.title, tooltip: "", checked: false, enabled: i.enabled, hidden: !!i.hidden };
  const toItems = (items) => items.map(toItem);
  const initial = buildMenu(summarize({ online: false }), lang, caps);
  tray = new SysTray({ menu: { icon: icon(initial.icon), title: "", tooltip: initial.tooltip, items: toItems(initial.items) }, debug: false, copyDir: prepareBinary(require) });
  current = initial;
  await tray.ready();
  log(`ready · ${BASE} · ${lang}${caps.service ? " · service controls" : ""}`);

  const refresh = async () => {
    if (stopping) return;
    let online = false, containers = null, alerts = null, history = [];
    try { alerts = await call("/api/alerts/config"); online = true; } catch (e) { debug("server:", e.message, e.cause?.code ?? ""); }
    if (online) { try { containers = await call("/api/containers"); } catch (e) { debug("containers:", e.message); } try { history = await call("/api/alerts/history"); } catch {} }
    const menu = buildMenu(summarize({ online, containers, alerts, history, seenAt }), lang, caps);
    const changed = changedSlots(current, menu), look = menu.icon !== current.icon || menu.tooltip !== current.tooltip;
    if (!changed.length && !look) return;
    debug("menu →", menu.icon, changed.map((i) => menu.items[i].id).join(","));
    const prev = current; current = menu;
    // Entries are updated one by one (reliable everywhere); the icon and tooltip go with a menu update that repeats the same entries.
    for (const i of changed) tray.sendAction({ type: "update-item", item: toItem(menu.items[i]), seq_id: i });
    if (look || prev.icon !== menu.icon) tray.sendAction({ type: "update-menu", menu: { icon: icon(menu.icon), title: "", tooltip: menu.tooltip, items: toItems(menu.items) } });
  };

  tray.onClick(async (e) => {
    const id = current.items[e.seq_id]?.id, act = id && actionFor(id);
    if (!act) return;
    try {
      if (act.seenAt) seenAt = act.seenAt;
      if (act.open) openUrl(BASE);
      if (act.http) await call(act.http.path, { method: act.http.method, body: act.http.body });
      if (act.service) { const r = await sh("systemctl", ["--user", act.service, `${SERVICE}.service`]); if (!r.ok) log(`systemctl ${act.service} failed: ${r.out.trim()}`); }
      if (act.quit) return shutdown();
    } catch (err) { log(`${id} failed: ${err.message}`); }
    await refresh();
  });

  tray.process.on("exit", () => { clearInterval(timer); try { lock.close(); } catch {} process.exit(0); });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, shutdown);
  await refresh();
  timer = setInterval(refresh, POLL_MS);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error("[tray]", e.message); process.exit(1); });
