// End-to-end check of the tray icon on Linux, with no real Docker and without touching your service: it runs a second
// Docker Kong against the mock Docker, starts the tray pointing at it and drives the icon through D-Bus (StatusNotifierItem
// + dbusmenu), exactly as the desktop panel does. It needs a desktop with tray support, so CI does not run it.
//   npm run build && npm install --prefix tray --ignore-scripts && npm run e2e:tray
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bus = (...a) => spawnSync("busctl", ["--user", "--json=short", ...a], { encoding: "utf8" });
if (process.platform !== "linux" || spawnSync("busctl", ["--version"]).status !== 0 || bus("status", "org.kde.StatusNotifierWatcher").status !== 0) { console.log("skipped: needs Linux with a StatusNotifierWatcher (a desktop with tray support)"); process.exit(0); }
if (!existsSync("tray/node_modules/systray2")) { console.error("Run: npm install --prefix tray --ignore-scripts"); process.exit(1); }

const PORT = 4466, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-tray-")), sock = join(tmp, "m.sock");
const procs = []; const cleanup = () => { procs.forEach((p) => { try { p.kill(); } catch {} }); try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
const api = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const json = (path, method, body) => api(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const demo = (action, name) => new Promise((res) => import("node:http").then(({ default: http }) => http.request({ socketPath: sock, path: `/_demo/${action}/${name}`, method: "POST" }, (r) => { r.resume(); r.on("end", res); }).end()));

procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
const server = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp, SAMPLE_SECONDS: "1" }, stdio: "ignore" }); procs.push(server);
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

/* ---- D-Bus helpers ---- */
const items = () => JSON.parse(bus("get-property", "org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher", "org.kde.StatusNotifierWatcher", "RegisteredStatusNotifierItems").stdout || "{}").data ?? [];
const split = (s) => { const i = s.indexOf("/"); return [s.slice(0, i), s.slice(i)]; };
const prop = (svc, path, p) => JSON.parse(bus("get-property", svc, path, "org.kde.StatusNotifierItem", p).stdout || "{}").data;
const menuLayout = (svc, menuPath) => {
  const out = JSON.parse(bus("call", "--", svc, menuPath, "com.canonical.dbusmenu", "GetLayout", "iias", "0", "-1", "0").stdout).data[1];
  return out[2].map((v) => ({ id: v.data[0], label: v.data[1].label?.data ?? "", enabled: v.data[1].enabled?.data ?? true, visible: v.data[1].visible?.data ?? true, sep: v.data[1].type?.data === "separator" }));
};
const click = (svc, menuPath, id) => bus("call", svc, menuPath, "com.canonical.dbusmenu", "Event", "isvu", String(id), "clicked", "i", "0", String(Math.floor(Date.now() / 1000)));

const before = new Set(items());
const tray = spawn(process.execPath, ["tray/tray.mjs"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, TRAY_NO_SERVICE: "1", TRAY_NO_OPEN: "1", TRAY_DEBUG: "1", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", TRAY_LOCK: join(tmp, "tray.sock") }, stdio: ["ignore", "pipe", "pipe"] }); procs.push(tray);
let trayLog = ""; tray.stdout.on("data", (d) => (trayLog += d)); tray.stderr.on("data", (d) => (trayLog += d));
let mine; for (let i = 0; i < 40 && !mine; i++) { await sleep(300); mine = items().find((x) => !before.has(x)); }
check(!!mine, `the icon registers in the tray (${mine ?? trayLog.trim().split("\n").at(-1)})`);
if (!mine) { console.log(trayLog); process.exit(1); }
const [svc, path] = split(mine), menuPath = prop(svc, path, "Menu");
const labels = () => menuLayout(svc, menuPath).filter((m) => !m.sep && m.visible).map((m) => m.label);
const find = (re) => menuLayout(svc, menuPath).find((m) => m.visible && re.test(m.label));
// the panel is given a temp PNG each time (its name changes): identify the icon by its content
const hash = (b) => createHash("sha256").update(b).digest("hex");
const KINDS = Object.fromEntries(["ok", "warn", "down"].map((k) => [hash(readFileSync(`tray/icons/${k}.png`)), k]));
const iconNow = () => KINDS[hash(readFileSync(prop(svc, path, "IconName")))] ?? "unknown";
const until = async (fn, ms = 12000) => { for (let t = 0; t < ms; t += 400) { try { if (fn()) return true; } catch {} await sleep(400); } return false; };

/* ---- healthy ---- */
const shows = await until(() => /\d+ of \d+ containers running/.test(labels().join("|")));
check(shows, `the menu shows the state: ${JSON.stringify(labels())}`);
if (!shows) { console.log("--- tray log:\n" + trayLog); process.exit(1); }
const l0 = labels();
check(l0[0] === "Open Docker Kong" && l0.includes("Silence all alerts for 1 hour") && l0.at(-1) === "Quit tray icon" && !l0.some((x) => /service/i.test(x)), "it offers Open, silence and Quit, and no service controls when there is no service");
check(menuLayout(svc, menuPath).filter((m) => m.sep && m.visible).length === 3, "with separators between the groups");
check(find(/containers running/)?.enabled === false && find(/Alerts/)?.enabled === false, "status lines are not clickable");
check(iconNow() === "ok", `the icon is green while everything works (${iconNow()})`);

/* ---- silence everything from the icon, and lift it ---- */
click(svc, menuPath, find(/Silence all alerts for 1 hour/).id);
check((await until(() => labels().some((x) => /Lift the silence/.test(x)))), "clicking Silence changes the menu to Lift the silence");
const cfg = (await api("/api/alerts/config")).body;
check(cfg.mutes.some((m) => m.kind === "all" && m.until > Date.now() + 3_000_000 && m.until < Date.now() + 3_700_000), "and it silenced everything for about an hour on the server");
check(labels().some((x) => /All alerts silenced until \d/.test(x)), `the alerts line says until when (${labels().find((x) => /silenced/.test(x))})`);
click(svc, menuPath, find(/Lift the silence/).id);
check(await until(() => labels().includes("Silence all alerts for 1 hour")), "clicking Lift the silence brings the option back");
check(!(await api("/api/alerts/config")).body.mutes.some((m) => m.kind === "all"), "and the server has no silence left");

/* ---- a new alert turns the icon amber until you open the app ---- */
await json("/api/alerts/config", "PUT", { enabled: true, cooldownMinutes: 0 });
await sleep(800); await demo("crash", "shop-api");
check(await until(() => labels().some((x) => /1 new alert/.test(x)), 20000), "after a crash the menu says there is 1 new alert");
check(await until(() => iconNow() === "warn"), `and the icon turns amber (${iconNow()})`);
const fresh = find(/new alert/); click(svc, menuPath, fresh.id);
check(await until(() => trayLog.includes(`[tray] open ${BASE}`)), "clicking it opens the app (the URL of this Docker Kong)");
check(await until(() => !labels().some((x) => /new alert/.test(x))), "opening the app marks it as seen: the entry goes away");
check(await until(() => iconNow() === "ok"), `and the icon goes back to green (${iconNow()})`);

/* ---- the server goes away ---- */
server.kill(); await sleep(300);
check(await until(() => labels().includes("Docker Kong is not responding"), 20000), "when Docker Kong stops answering the menu says so");
check(labels().includes("Start it with: npm start") && find(/^Open Docker Kong/)?.enabled === false, "with a hint, and Open disabled because there is nothing to open");
check(await until(() => iconNow() === "down"), `and the icon turns grey (${iconNow()})`);

/* ---- one icon per session, and a clean exit ---- */
const second = spawnSync(process.execPath, ["tray/tray.mjs"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, TRAY_NO_SERVICE: "1", TRAY_LOCK: join(tmp, "tray.sock") }, encoding: "utf8", timeout: 15000 });
check(/already running/.test(second.stdout) && second.status === 0 && items().filter((x) => !before.has(x)).length === 1, "a second copy exits instead of adding another icon");
const stopped = spawnSync(process.execPath, ["tray/install.mjs", "uninstall"], { env: { ...process.env, TRAY_LOCK: join(tmp, "tray.sock"), XDG_CONFIG_HOME: join(tmp, "cfg") }, encoding: "utf8" });
await sleep(1500);
check(!items().some((x) => !before.has(x)) && tray.exitCode !== null, "uninstall asks the running icon to quit and it disappears from the tray");

/* ---- service controls, against a throw-away systemd user unit (never your docker-gestor service) ---- */
const UNIT = "dg-tray-e2e", ctl = (...a) => spawnSync("systemctl", ["--user", ...a], { encoding: "utf8" });
const unitFile = join(tmp, `${UNIT}.service`);
const pid = () => ctl("show", UNIT, "-p", "MainPID", "--value").stdout.trim();
const state = () => ctl("is-active", UNIT).stdout.trim();
if (ctl("--version").status !== 0) console.log("skipped: no systemd user session");
else {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(unitFile, "[Unit]\nDescription=Docker Kong tray e2e (temporary)\n[Service]\nExecStart=/bin/sleep 600\n");
  ctl("link", "--runtime", unitFile); ctl("start", UNIT);
  const srv2 = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }); procs.push(srv2);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }
  const known = new Set(items());
  const t2 = spawn(process.execPath, ["tray/tray.mjs"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, TRAY_SERVICE: UNIT, TRAY_NO_OPEN: "1", TRAY_LOCK: join(tmp, "tray.sock"), LANG: "es_ES.UTF-8", LC_ALL: "es_ES.UTF-8" }, stdio: "ignore" }); procs.push(t2);
  let mine2; for (let i = 0; i < 40 && !mine2; i++) { await sleep(300); mine2 = items().find((x) => !known.has(x)); }
  check(!!mine2, "a second icon (Spanish, with service controls) registers");
  const [s2, p2] = split(mine2), m2 = prop(s2, p2, "Menu");
  const lab2 = () => menuLayout(s2, m2).filter((m) => !m.sep && m.visible).map((m) => m.label);
  const fnd2 = (re) => menuLayout(s2, m2).find((m) => m.visible && re.test(m.label));
  check(await until(() => lab2().includes("Reiniciar servicio") && lab2().includes("Parar servicio")), `with a service it offers Reiniciar / Parar servicio, in Spanish (${JSON.stringify(lab2())})`);
  check(/contenedores en marcha/.test(lab2().join("|")) && lab2().includes("Salir del icono"), "and the rest of the menu is in Spanish too");
  const before = pid(); click(s2, m2, fnd2(/Reiniciar servicio/).id);
  check(await until(() => state() === "active" && pid() !== before && pid() !== "0"), `Restart restarts the service (pid ${before} → ${pid()})`);
  click(s2, m2, fnd2(/Parar servicio/).id);
  check(await until(() => state() !== "active"), `Stop stops the service (${state()})`);
  srv2.kill(); await sleep(300);
  check(await until(() => lab2().includes("Iniciar servicio") && !lab2().includes("Parar servicio"), 20000), "when the server stops answering the menu offers Iniciar servicio");
  click(s2, m2, fnd2(/Iniciar servicio/).id);
  check(await until(() => state() === "active"), `Start starts it again (${state()})`);
  ctl("stop", UNIT); ctl("disable", "--runtime", UNIT);
  check(state() !== "active" && !ctl("cat", UNIT).stdout.includes("sleep 600"), "the temporary unit is gone");
  spawnSync(process.execPath, ["tray/install.mjs", "uninstall"], { env: { ...process.env, TRAY_LOCK: join(tmp, "tray.sock"), XDG_CONFIG_HOME: join(tmp, "cfg") } });
}
console.log(fails ? `\n${fails} check(s) failed` : "\nAll good");
process.exit(fails ? 1 : 0);
