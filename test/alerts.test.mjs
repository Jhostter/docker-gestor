import test from "node:test";
import assert from "node:assert/strict";
import { AlertEngine, DEFAULTS, ConfigError, normalizeConfig, publicConfig, formatAlert, parseDockerEvent, SUPPRESS_MS } from "../src/lib/alerts-core.mjs";

/** An engine with a fake clock: `advance(ms)` moves time and runs due timers. */
function rig(patch = {}) {
  const clock = { t: 1_000_000 }, timers = new Set(), out = [];
  const cfg = normalizeConfig({ enabled: true, ...patch });
  const engine = new AlertEngine({
    getConfig: () => cfg, emit: (a) => out.push(a), now: () => clock.t, sampleMs: 15000,
    schedule: (fn, ms) => { const t = { fn, at: clock.t + ms }; timers.add(t); return t; },
    cancel: (t) => timers.delete(t),
  });
  const advance = (ms) => { clock.t += ms; for (const t of [...timers]) if (t.at <= clock.t) { timers.delete(t); t.fn(); } };
  const ev = (action, extra = {}) => engine.onEvent({ action, id: "abc123def456", name: "api", image: "img", ...extra });
  return { engine, out, advance, ev, clock, cfg };
}

test("a crash (non-zero exit, no stop) alerts after the suppression window", () => {
  const { out, advance, ev } = rig();
  ev("die", { exitCode: "1" });
  assert.equal(out.length, 0, "nothing before the window ends");
  advance(SUPPRESS_MS + 10);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].rule, out[0].name, out[0].vars.code], ["died", "api", "1"]);
});

test("a stop you did yourself is not an alert (die followed by stop)", () => {
  const { out, advance, ev } = rig();
  ev("die", { exitCode: "137" }); ev("stop");
  advance(10_000);
  assert.equal(out.length, 0);
});

test("destroy and restart right after die are also intentional", () => {
  for (const act of ["destroy", "restart"]) {
    const { out, advance, ev } = rig();
    ev("die", { exitCode: "137" }); ev(act);
    advance(10_000);
    assert.equal(out.length, 0, act);
  }
});

test("a clean exit (code 0) is not a crash", () => {
  const { out, advance, ev } = rig();
  ev("die", { exitCode: "0" });
  advance(5000);
  assert.equal(out.length, 0);
});

test("OOM alerts immediately", () => {
  const { out, ev } = rig();
  ev("oom");
  assert.equal(out[0].rule, "oom");
});

test("unhealthy alerts and recovery is reported once; healthy alone is silent", () => {
  const { out, ev } = rig();
  ev("health_status: healthy");
  assert.equal(out.length, 0);
  ev("health_status: unhealthy"); ev("health_status: healthy"); ev("health_status: healthy");
  assert.deepEqual(out.map((a) => a.rule), ["unhealthy", "recovered"]);
});

test("cooldown suppresses repeats of the same rule+container until it expires", () => {
  const { out, advance, ev } = rig({ rules: { restartLoop: { enabled: false } } });
  ev("die", { exitCode: "1" }); advance(4000);
  ev("die", { exitCode: "1" }); advance(4000);
  assert.equal(out.filter((a) => a.rule === "died").length, 1);
  advance(11 * 60_000);
  ev("die", { exitCode: "1" }); advance(4000);
  assert.equal(out.filter((a) => a.rule === "died").length, 2);
});

test("restart loop fires once when N crashes happen inside the window", () => {
  const { out, advance, ev } = rig();
  for (let i = 0; i < 3; i++) { ev("die", { exitCode: "1" }); advance(4000); }
  assert.equal(out.filter((a) => a.rule === "restartLoop").length, 1);
  assert.deepEqual(out.find((a) => a.rule === "restartLoop").vars, { count: 3, minutes: 10 });
});

test("crashes spread beyond the window do not count as a loop", () => {
  const { out, advance, ev } = rig();
  for (let i = 0; i < 3; i++) { ev("die", { exitCode: "1" }); advance(4000); advance(11 * 60_000); }
  assert.equal(out.filter((a) => a.rule === "restartLoop").length, 0);
});

test("sustained CPU fires only after the whole period, and a dip resets the streak", () => {
  const { out, engine } = rig({ rules: { cpu: { enabled: true, percent: 90, minutes: 1 } } }); // 1 min = 4 samples
  const hot = [{ name: "api", cpu: 95, mem: 1, limit: 100 }], cool = [{ name: "api", cpu: 10, mem: 1, limit: 100 }];
  engine.onSamples(hot); engine.onSamples(hot); engine.onSamples(hot);
  assert.equal(out.length, 0);
  engine.onSamples(cool); engine.onSamples(hot); engine.onSamples(hot); engine.onSamples(hot);
  assert.equal(out.length, 0, "the dip reset the streak");
  engine.onSamples(hot);
  assert.deepEqual([out[0].rule, out[0].vars.percent], ["cpu", 95]);
});

test("memory is measured against the container limit", () => {
  const { out, engine } = rig({ rules: { memory: { enabled: true, percent: 80, minutes: 1 } } });
  for (let i = 0; i < 4; i++) engine.onSamples([{ name: "db", cpu: 1, mem: 90, limit: 100 }]);
  assert.equal(out[0]?.rule, "memory");
  const r2 = rig({ rules: { memory: { enabled: true, percent: 80, minutes: 1 } } });
  for (let i = 0; i < 8; i++) r2.engine.onSamples([{ name: "db", cpu: 1, mem: 90, limit: 0 }]);
  assert.equal(r2.out.length, 0, "no limit, no percentage");
});

test("nothing fires when alerts are off or the rule is off", () => {
  const off = rig({ enabled: false }); off.ev("oom"); assert.equal(off.out.length, 0);
  const rule = rig({ rules: { oom: { enabled: false } } }); rule.ev("oom"); assert.equal(rule.out.length, 0);
});

test("destroying a container forgets its state", () => {
  const { out, advance, ev, engine } = rig();
  ev("health_status: unhealthy"); ev("destroy");
  ev("health_status: healthy");
  assert.deepEqual(out.map((a) => a.rule), ["unhealthy"], "no recovery for a container that no longer exists");
  assert.equal(engine.unhealthy.size, 0); advance(1);
});

test("normalizeConfig: defaults, clamping and secrets semantics", () => {
  const c = normalizeConfig({ cooldownMinutes: 99999, rules: { cpu: { percent: 500, minutes: 0 }, restartLoop: { count: 1 } } });
  assert.equal(c.cooldownMinutes, 1440); assert.equal(c.rules.cpu.percent, 100); assert.equal(c.rules.cpu.minutes, 1); assert.equal(c.rules.restartLoop.count, 2);
  const withTok = normalizeConfig({ channels: { telegram: { token: "123456:ABCDEFGHIJKLMNOPQRSTUVWX", chatId: "42", enabled: true } } });
  assert.equal(normalizeConfig({ channels: { telegram: { chatId: "43" } } }, withTok).channels.telegram.token, withTok.channels.telegram.token, "undefined keeps the token");
  assert.equal(normalizeConfig({ channels: { telegram: { token: "", enabled: false } } }, withTok).channels.telegram.token, "", "empty string clears it");
});

test("normalizeConfig rejects bad input with a code", () => {
  const code = (input) => { try { normalizeConfig(input); } catch (e) { assert.ok(e instanceof ConfigError); return e.code; } };
  assert.equal(code({ channels: { telegram: { token: "nope" } } }), "invalid_telegram_token");
  assert.equal(code({ channels: { telegram: { chatId: "not a chat" } } }), "invalid_telegram_chat");
  assert.equal(code({ channels: { telegram: { enabled: true } } }), "telegram_incomplete");
  assert.equal(code({ channels: { webhook: { url: "ftp://x" } } }), "invalid_webhook_url");
  assert.equal(code({ channels: { webhook: { url: "not a url" } } }), "invalid_webhook_url");
  assert.equal(code({ channels: { webhook: { enabled: true } } }), "webhook_incomplete");
  assert.equal(code({ channels: { webhook: { authorization: "a\r\nX: y" } } }), "invalid_authorization");
});

test("publicConfig never exposes secrets", () => {
  const c = normalizeConfig({ channels: { telegram: { token: "123456:ABCDEFGHIJKLMNOPQRSTUVWX", chatId: "42" }, webhook: { url: "https://h/x", authorization: "Bearer s3cret" } } });
  const p = JSON.stringify(publicConfig(c));
  assert.ok(!p.includes("ABCDEFGH") && !p.includes("s3cret"));
  assert.match(p, /"hasToken":true/); assert.match(p, /"hasAuth":true/);
});

test("formatAlert is localized and prefixes the host", () => {
  const a = { ts: 0, rule: "died", name: "api", vars: { code: "1" } };
  assert.equal(formatAlert(a, "en", "box"), "[box] 🔴 api exited with code 1");
  assert.equal(formatAlert(a, "es"), "🔴 api terminó con código 1");
  assert.match(formatAlert({ rule: "restartLoop", name: "x", vars: { count: 3, minutes: 10 } }, "es"), /3 veces en 10 min/);
});

test("parseDockerEvent keeps only container events", () => {
  assert.equal(parseDockerEvent({ Type: "network", Action: "create" }), null);
  assert.deepEqual(parseDockerEvent({ Type: "container", Action: "die", Actor: { ID: "i", Attributes: { name: "n", image: "m", exitCode: "2" } } }), { action: "die", id: "i", name: "n", image: "m", exitCode: "2" });
});

test("DEFAULTS are valid and alerts start disabled", () => {
  assert.equal(DEFAULTS.enabled, false);
  assert.doesNotThrow(() => normalizeConfig({}));
});
