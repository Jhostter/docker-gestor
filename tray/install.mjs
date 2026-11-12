#!/usr/bin/env node
// Installs / removes the tray icon so that it starts with your session.
//   node tray/install.mjs install [--lang es|en|auto]      (npm run tray:install -- --lang es)
//   node tray/install.mjs uninstall    (npm run tray:uninstall)
// It installs the icon's only dependency in tray/ (never in the app), writes the autostart file of your OS and starts it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LABEL, desktopEntry, launchAgent, windowsLauncher } from "./autostart.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), SCRIPT = join(HERE, "tray.mjs"), NODE = process.execPath;
const h = homedir();
const TARGET = {
  linux: join(process.env.XDG_CONFIG_HOME ?? join(h, ".config"), "autostart", "docker-gestor-tray.desktop"),
  darwin: join(h, "Library", "LaunchAgents", `${LABEL}.plist`),
  win32: join(process.env.APPDATA ?? join(h, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "docker-gestor-tray.vbs"),
}[process.platform];
const CONTENT = { linux: desktopEntry, darwin: launchAgent, win32: windowsLauncher }[process.platform];
const lockPath = () => process.env.TRAY_LOCK ? process.env.TRAY_LOCK : process.platform === "win32" ? "\\\\.\\pipe\\docker-gestor-tray" : join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), `docker-gestor-tray-${process.getuid?.() ?? 0}.sock`);

/** Asks a running icon to quit through its lock socket. Resolves true if one answered. */
const stopRunning = () => new Promise((res) => { const c = net.connect(lockPath()); c.once("connect", () => { c.end("quit\n"); setTimeout(() => res(true), 600); }); c.once("error", () => res(false)); });

/** `--lang es|en` fixes the menu language; otherwise it follows the system locale. */
function saveLang() {
  const i = process.argv.indexOf("--lang"), lang = i > 0 ? process.argv[i + 1] : undefined;
  const file = join(process.env.DATA_DIR ?? dataDirDefault(), "tray.json");
  if (lang === undefined) return;
  if (lang === "auto") { rmSync(file, { force: true }); console.log("Menu language: follows the system locale."); return; }
  if (lang !== "es" && lang !== "en") { console.error("--lang must be es, en or auto."); process.exit(1); }
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ lang }) + "\n");
  console.log(`Menu language: ${lang}.`);
}
function dataDirDefault() {
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(h, "AppData", "Local"), "docker-gestor");
  if (process.platform === "darwin") return join(h, "Library", "Application Support", "docker-gestor");
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), "docker-gestor");
}

async function install() {
  if (!TARGET) { console.error(`The tray icon does not support ${process.platform}.`); process.exit(1); }
  console.log("Installing the tray icon's dependency (systray2, prebuilt binary) in tray/ …");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], { cwd: HERE, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("npm install failed."); process.exit(1); }
  saveLang();
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, CONTENT({ node: NODE, script: SCRIPT }));
  console.log("Starts with your session:", TARGET);
  if (process.platform === "darwin") spawnSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, TARGET], { stdio: "ignore" });
  await stopRunning();                                                  // replace an older icon, if any
  spawn(NODE, [SCRIPT], { detached: true, stdio: "ignore", cwd: HERE }).unref();
  console.log("Done. The icon should appear in your tray in a few seconds. Remove it with: npm run tray:uninstall");
  if (process.platform === "linux") console.log("(If no icon appears: GNOME needs the AppIndicator extension, and the icon needs libappindicator3 and GTK 3.)");
}

async function uninstall() {
  const stopped = await stopRunning();
  if (process.platform === "darwin" && TARGET) spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, TARGET], { stdio: "ignore" });
  const had = TARGET && existsSync(TARGET);
  if (had) rmSync(TARGET);
  console.log(`${stopped ? "Stopped the running icon. " : ""}${had ? "Removed the autostart file." : "There was no autostart file."}`);
  console.log("Dependencies in tray/node_modules and the copied binary in your data folder (tray-bin/) were left; delete them if you want.");
}

const cmd = process.argv[2];
if (cmd === "install") await install();
else if (cmd === "uninstall") await uninstall();
else { console.error("Usage: node tray/install.mjs install | uninstall"); process.exit(1); }
