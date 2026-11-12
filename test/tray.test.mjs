import test from "node:test";
import assert from "node:assert/strict";
import { SLOT_COUNT, actionFor, activeMutes, buildMenu, changedSlots, freshAlerts, pickLang, summarize } from "../tray/core.mjs";
import { LABEL, desktopEntry, launchAgent, windowsLauncher } from "../tray/autostart.mjs";

const NOW = 1_000_000;
const ctr = (state) => ({ state });
const view = (o = {}) => summarize({ online: true, containers: [ctr("running"), ctr("running"), ctr("exited")], alerts: { enabled: true, mutes: [] }, history: [], seenAt: 0, ...o }, NOW);
const ids = (m) => m.items.filter((i) => !i.hidden).map((i) => i.id);
const titles = (m) => m.items.filter((i) => !i.hidden && i.id !== "sep").map((i) => i.title);

test("language: Spanish locales get Spanish, everything else English", () => {
  assert.equal(pickLang({ LANG: "es_ES.UTF-8" }, "en-US"), "es");
  assert.equal(pickLang({ LC_ALL: "es_MX.UTF-8", LANG: "en_US" }, "en"), "es", "LC_ALL wins");
  assert.equal(pickLang({ LANG: "C.UTF-8" }, "es-ES"), "en", "an explicit locale is respected");
  assert.equal(pickLang({}, "es-AR"), "es", "falls back to the system locale");
  assert.equal(pickLang({}, "de-DE"), "en");
});

test("language: TRAY_LANG beats the saved choice, which beats the system locale; junk values are ignored", () => {
  assert.equal(pickLang({ TRAY_LANG: "es", LANG: "en_US" }, "en", "en"), "es");
  assert.equal(pickLang({ LANG: "en_US" }, "en", "es"), "es", "the choice saved by tray:install --lang");
  assert.equal(pickLang({ TRAY_LANG: "fr", LANG: "es_ES" }, "en", "de"), "es", "an unknown value falls through to the locale");
  assert.equal(pickLang({ TRAY_LANG: "en", LANG: "es_ES" }, "es", ""), "en");
});

test("summary: counts, status, and 'down' when the server or Docker does not answer", () => {
  const ok = view();
  assert.deepEqual([ok.up, ok.total, ok.status, ok.online, ok.dockerOk], [2, 3, "ok", true, true]);
  assert.equal(summarize({ online: false }, NOW).status, "down");
  assert.equal(summarize({ online: true, containers: null, alerts: { enabled: true } }, NOW).status, "down", "server up, Docker down");
  assert.equal(view({ containers: [] }).status, "ok", "no containers is not an error");
});

test("fresh alerts: only problems after you last looked; recoveries and tests never count", () => {
  const h = [{ ts: 50, rule: "died" }, { ts: 150, rule: "died" }, { ts: 160, rule: "oom" }, { ts: 170, rule: "recovered" }, { ts: 171, rule: "back_up" }, { ts: 172, rule: "cpu_ok" }, { ts: 173, rule: "memory_ok" }, { ts: 174, rule: "test" }];
  assert.equal(freshAlerts(h, 100), 2);
  assert.equal(freshAlerts(h, 160), 0, "the boundary is exclusive: what you already saw is not new");
  assert.equal(freshAlerts(null, 0), 0);
  assert.equal(view({ history: h, seenAt: 100 }).status, "warn");
  assert.equal(view({ history: h, seenAt: 1000 }).status, "ok");
  assert.equal(summarize({ online: true, containers: null, history: h, seenAt: 0 }, NOW).fresh, 0, "no amber when it is all grey anyway");
});

test("silences: expired ones are ignored, 'all' is told apart from per-container ones", () => {
  const mutes = [{ kind: "container", name: "a", until: null }, { kind: "stack", name: "s", until: NOW + 5 }, { kind: "container", name: "old", until: NOW - 1 }, { kind: "all", name: "*", until: NOW + 60_000 }];
  assert.equal(activeMutes(mutes, NOW).length, 3);
  const v = view({ alerts: { enabled: true, mutes } });
  assert.equal(v.muted, 2); assert.equal(v.all.until, NOW + 60_000);
  assert.equal(view({ alerts: { enabled: true, mutes: [{ kind: "all", name: "*", until: NOW - 5 }] } }).all, null, "an expired 'all' does not count");
});

test("the menu always has the same slots in the same order (native menus cannot be rebuilt)", () => {
  const variants = [view(), summarize({ online: false }, NOW), view({ containers: null }), view({ alerts: { enabled: false, mutes: [{ kind: "all", name: "*", until: null }] } })];
  const shapes = new Set(); 
  for (const v of variants) for (const caps of [{}, { service: true }]) {
    const m = buildMenu(v, "en", caps, NOW);
    assert.equal(m.items.length, SLOT_COUNT);
    shapes.add(m.items.map((i) => (i.id === "sep" ? "sep" : i.id.replace(/^(un)?silence$/, "silence").replace(/^svc-(start|restart)$/, "svc-main"))).join());
  }
  assert.equal(shapes.size, 1, "only titles / enabled / hidden change, never the positions");
});

test("online menu: open, state, alerts line, silence and quit — and nothing it cannot do", () => {
  const m = buildMenu(view(), "en", {}, NOW);
  assert.deepEqual(ids(m), ["open", "sep", "status", "alerts", "sep", "silence", "sep", "quit"]);
  assert.deepEqual(titles(m), ["Open Docker Kong", "2 of 3 containers running", "Alerts on", "Silence all alerts for 1 hour", "Quit tray icon"]);
  assert.equal(m.icon, "ok"); assert.match(m.tooltip, /2\/3 running/);
  const by = Object.fromEntries(m.items.map((i) => [i.id, i]));
  assert.equal(by.status.enabled, false); assert.equal(by.alerts.enabled, false); assert.equal(by.open.enabled, true);
  assert.equal(by["svc-restart"].hidden, true, "no service controls without a service");
  assert.equal(by.fresh.hidden, true);
});

test("with a service manager: restart and stop appear when online, start when offline", () => {
  const on = buildMenu(view(), "en", { service: true }, NOW), off = buildMenu(summarize({ online: false }, NOW), "en", { service: true }, NOW);
  assert.deepEqual(ids(on).filter((i) => i.startsWith("svc")), ["svc-restart", "svc-stop"]);
  assert.deepEqual(ids(off).filter((i) => i.startsWith("svc")), ["svc-start"]);
  assert.equal(off.items.find((i) => i.id === "hint").hidden, true, "no hint when there is a start button");
});

test("offline: says so, offers a hint when it cannot start the server, and the open entry is disabled", () => {
  const m = buildMenu(summarize({ online: false }, NOW), "en", {}, NOW);
  assert.deepEqual(titles(m), ["Open Docker Kong", "Docker Kong is not responding", "Start it with: npm start", "Quit tray icon"]);
  assert.equal(m.items[0].enabled, false); assert.equal(m.icon, "down");
  const d = buildMenu(view({ containers: null }), "en", {}, NOW);
  assert.ok(titles(d).includes("Docker is not responding") && d.icon === "down" && d.items.find((i) => i.id === "silence").hidden === false, "Docker down: the server still answers, so silencing still works");
  assert.equal(d.items.find((i) => i.id === "open").enabled, true);
});

test("fresh alerts: a singular / plural entry, an amber icon and the count in the tooltip", () => {
  const one = buildMenu(view({ history: [{ ts: 5, rule: "died" }] }), "en", {}, NOW), two = buildMenu(view({ history: [{ ts: 5, rule: "died" }, { ts: 6, rule: "oom" }] }), "es", {}, NOW);
  assert.ok(titles(one).includes("1 new alert — open") && one.icon === "warn" && /1 new alert/.test(one.tooltip));
  assert.ok(titles(two).includes("2 alertas nuevas — abrir") && /2 alerta/.test(two.tooltip));
});

test("silence entry follows the state: until when, or until lifted; the toggle flips", () => {
  const until = NOW + 3_600_000;
  const m = buildMenu(view({ alerts: { enabled: true, mutes: [{ kind: "all", name: "*", until }] } }), "en", {}, NOW);
  assert.ok(ids(m).includes("unsilence") && !ids(m).includes("silence"));
  assert.match(titles(m).join("|"), /All alerts silenced until \d/);
  assert.match(titles(buildMenu(view({ alerts: { enabled: true, mutes: [{ kind: "all", name: "*", until: null }] } }), "es", {}, NOW)).join("|"), /hasta que lo reactives/);
  assert.match(titles(buildMenu(view({ alerts: { enabled: false, mutes: [{ kind: "container", name: "a", until: null }, { kind: "stack", name: "b", until: null }] } }), "en", {}, NOW)).join("|"), /Alerts off · 2 silenced/);
});

test("changedSlots: only what differs, so a quiet poll sends nothing", () => {
  const a = buildMenu(view(), "en", {}, NOW);
  assert.deepEqual(changedSlots(a, buildMenu(view(), "en", {}, NOW)), []);
  assert.deepEqual(changedSlots(null, a).length, SLOT_COUNT);
  const b = buildMenu(view({ containers: [ctr("running")] }), "en", {}, NOW);
  assert.deepEqual(changedSlots(a, b), [2], "only the status line");
  const c = buildMenu(view({ history: [{ ts: 5, rule: "died" }] }), "en", {}, NOW);
  assert.deepEqual(changedSlots(a, c), [4], "the 'new alert' entry appears");
});

test("actions: open marks alerts as seen; silence / unsilence call the API; services map to systemctl verbs", () => {
  assert.deepEqual(actionFor("open", { seenNow: 7 }), { open: true, seenAt: 7 });
  assert.deepEqual(actionFor("fresh", { seenNow: 9 }), { open: true, seenAt: 9 });
  assert.deepEqual(actionFor("silence").http, { method: "POST", path: "/api/alerts/mute", body: { kind: "all", minutes: 60 } });
  assert.deepEqual(actionFor("unsilence").http, { method: "DELETE", path: "/api/alerts/mute", body: { kind: "all" } });
  assert.deepEqual([actionFor("svc-start").service, actionFor("svc-stop").service, actionFor("svc-restart").service], ["start", "stop", "restart"]);
  assert.deepEqual(actionFor("quit"), { quit: true });
  for (const id of ["sep", "status", "alerts", "hint", "nope", undefined]) assert.equal(actionFor(id), null, String(id));
});

test("Spanish menu is complete (no English leaks, no unfilled placeholders)", () => {
  for (const v of [view(), view({ history: [{ ts: 5, rule: "died" }] }), summarize({ online: false }, NOW), view({ containers: null }), view({ alerts: { enabled: false, mutes: [{ kind: "all", name: "*", until: null }] } })])
    for (const caps of [{}, { service: true }]) for (const lang of ["es", "en"]) {
      const m = buildMenu(v, lang, caps, NOW), all = [m.tooltip, ...m.items.map((i) => i.title)].join("|");
      assert.ok(!/\{\w+\}/.test(all), `placeholder left in ${lang}: ${all}`);
      if (lang === "es") assert.ok(!/Open Docker|Silence|Quit|not responding|containers running|Alerts on|Alerts off|Start service|Restart service/.test(all), `English in Spanish menu: ${all}`);
    }
});

test("autostart files: quoting survives spaces and special characters", () => {
  const node = "/opt/my node/bin/node", script = '/home/me/dg "x"/tray/tray.mjs';
  const d = desktopEntry({ node, script });
  assert.match(d, /^Exec="\/opt\/my node\/bin\/node" "\/home\/me\/dg \\"x\\"\/tray\/tray\.mjs"$/m);
  assert.match(d, /Type=Application/); assert.match(d, /Terminal=false/);
  const p = launchAgent({ node: "/n&o/node", script: "/a<b>/tray.mjs" });
  assert.ok(p.includes(`<string>${LABEL}</string>`) && p.includes("/n&amp;o/node") && p.includes("/a&lt;b&gt;/tray.mjs") && p.includes("<key>RunAtLoad</key><true/>"));
  assert.ok(!/<b>/.test(p), "XML is escaped");
  const w = windowsLauncher({ node: "C:\\Program Files\\nodejs\\node.exe", script: 'C:\\x "y"\\tray.mjs' });
  assert.equal(w, 'CreateObject("Wscript.Shell").Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\x ""y""\\tray.mjs""", 0, False\r\n');
});

test("changedSlots notices an entry that only appears or disappears (same title, same enabled)", () => {
  const on = buildMenu(view(), "en", { service: true }, NOW), off = buildMenu(summarize({ online: false }, NOW), "en", { service: true }, NOW);
  const stop = on.items.findIndex((i) => i.id === "svc-stop");
  assert.equal(on.items[stop].title, off.items[stop].title, "the Stop entry reads the same either way");
  assert.ok(changedSlots(on, off).includes(stop), "but showing or hiding it must be sent");
  assert.ok(changedSlots(off, on).includes(stop));
});
