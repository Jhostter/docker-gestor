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

/* ---------------- silences, exclusions, per-rule cooldown, recovery ---------------- */
import { STABLE_MS, CALM_SAMPLES, addMute, removeMute, cleanMutes, isMuted } from "../src/lib/alerts-core.mjs";

test("a silenced container raises nothing on any rule, and alerts again when the silence ends", () => {
  const { out, ev, cfg, clock, advance } = rig({ rules: { cpu: { enabled: true, percent: 50, minutes: 1 } } });
  cfg.mutes = [{ kind: "container", name: "api", until: clock.t + 60_000 }];
  ev("oom"); ev("health_status: unhealthy"); ev("die", { exitCode: "1" }); advance(SUPPRESS_MS + 10);
  assert.equal(out.length, 0, "silenced");
  advance(60_000);
  ev("oom");
  assert.deepEqual(out.map((a) => a.rule), ["oom"], "the silence expired by itself");
});

test("a silence 'until removed' (until: null) stays; other containers are unaffected", () => {
  const { out, ev, cfg, engine } = rig();
  cfg.mutes = [{ kind: "container", name: "api", until: null }];
  ev("oom");
  engine.onEvent({ action: "oom", id: "zzz", name: "db", image: "i" });
  assert.deepEqual(out.map((a) => a.name), ["db"]);
});

test("a stack silence covers every container of that Compose project (seen on events and on samples)", () => {
  const { out, ev, cfg, engine } = rig({ rules: { memory: { enabled: true, percent: 50, minutes: 1 } } });
  cfg.mutes = [{ kind: "stack", name: "shop", until: null }];
  ev("start", { project: "shop" });                           // learns api belongs to "shop"
  ev("oom");
  engine.onEvent({ action: "oom", id: "other", name: "web", image: "i", project: "blog" });
  assert.deepEqual(out.map((a) => a.name), ["web"], "only the other stack alerts");
  // samples carry the project too, even for a container we have not seen an event for
  for (let i = 0; i < 4; i++) engine.onSamples([{ name: "cache", project: "shop", cpu: 1, mem: 90, limit: 100 }, { name: "solo", cpu: 1, mem: 90, limit: 100 }]);
  assert.deepEqual(out.filter((a) => a.rule === "memory").map((a) => a.name), ["solo"]);
});

test("muting is by exact name or stack, never by substring", () => {
  const m = [{ kind: "container", name: "api", until: null }, { kind: "stack", name: "shop", until: null }];
  assert.equal(isMuted(m, "api", undefined, 0), true);
  assert.equal(isMuted(m, "api-2", undefined, 0), false);
  assert.equal(isMuted(m, "x", "shop", 0), true);
  assert.equal(isMuted(m, "x", "shop2", 0), false);
  assert.equal(isMuted(m, "shop", undefined, 0), false, "a container named like a stack is not muted by the stack silence");
});

test("a rule's exclusion list ignores only that rule, only for those containers", () => {
  const { out, ev, engine } = rig({ rules: { oom: { exclude: ["api"] } } });
  ev("oom");
  ev("health_status: unhealthy");
  engine.onEvent({ action: "oom", id: "zzz", name: "db", image: "i" });
  assert.deepEqual(out.map((a) => [a.rule, a.name]), [["unhealthy", "api"], ["oom", "db"]]);
});

test("per-rule cooldown overrides the global one, per rule and container", () => {
  const { out, ev, advance, engine } = rig({ cooldownMinutes: 10, rules: { oom: { cooldownMinutes: 1 }, unhealthy: { cooldownMinutes: 0 } } });
  ev("oom"); advance(30_000); ev("oom");
  assert.equal(out.length, 1, "inside the 1-minute cooldown");
  advance(40_000); ev("oom");
  assert.equal(out.length, 2, "after 1 minute (the global 10 would still block it)");
  engine.onEvent({ action: "oom", id: "zzz", name: "db", image: "i" });
  assert.equal(out.length, 3, "another container has its own cooldown");
  ev("health_status: unhealthy"); ev("health_status: unhealthy");
  assert.equal(out.filter((a) => a.rule === "unhealthy").length, 2, "0 = never suppress, even though the global cooldown is 10");
});

test("a crash is followed by 'running again' only after it stays up", () => {
  const { out, ev, advance } = rig();
  ev("die", { exitCode: "1" }); advance(SUPPRESS_MS + 10);
  assert.equal(out.length, 1);
  ev("start");
  advance(STABLE_MS - 1000);
  assert.equal(out.length, 1, "not yet");
  advance(2000);
  assert.deepEqual(out.map((a) => a.rule), ["died", "back_up"]);
  advance(10 * STABLE_MS);
  assert.equal(out.length, 2, "said once");
});

test("a container that crashes again before it is stable never says it is back", () => {
  const { out, ev, advance } = rig({ cooldownMinutes: 0 });
  ev("die", { exitCode: "1" }); advance(SUPPRESS_MS + 10);
  ev("start"); advance(10_000);
  ev("die", { exitCode: "1" }); advance(SUPPRESS_MS + 10);
  ev("start"); advance(STABLE_MS + 1000);
  assert.deepEqual(out.map((a) => a.rule), ["died", "died", "back_up"], "only the last start counted");
});

test("if the restart policy brings it back before the crash is even reported, recovery is still announced", () => {
  const { out, ev, advance } = rig();
  ev("die", { exitCode: "1" }); advance(500);
  ev("start");
  advance(SUPPRESS_MS);                       // the crash alert goes out now, and the container is already running
  assert.equal(out[0].rule, "died");
  advance(STABLE_MS + 100);
  assert.deepEqual(out.map((a) => a.rule), ["died", "back_up"]);
});

test("no 'running again' for something we never reported (clean exit, silenced, excluded, stopped by you)", () => {
  for (const setup of [
    ({ ev }) => ev("die", { exitCode: "0" }),
    ({ ev, cfg }) => { cfg.mutes = [{ kind: "container", name: "api", until: null }]; ev("die", { exitCode: "1" }); },
    ({ ev, cfg }) => { cfg.rules.died.exclude = ["api"]; ev("die", { exitCode: "1" }); },
    ({ ev }) => { ev("die", { exitCode: "137" }); ev("stop"); },
  ]) {
    const r = rig(); setup(r);
    r.advance(SUPPRESS_MS + 10); r.ev("start"); r.advance(STABLE_MS + 1000);
    assert.equal(r.out.length, 0);
  }
});

test("recovery can be switched off, and destroying the container forgets the pending recovery", () => {
  const off = rig({ recovery: false });
  off.ev("die", { exitCode: "1" }); off.advance(SUPPRESS_MS + 10); off.ev("start"); off.advance(STABLE_MS + 1000);
  assert.deepEqual(off.out.map((a) => a.rule), ["died"]);
  const gone = rig();
  gone.ev("die", { exitCode: "1" }); gone.advance(SUPPRESS_MS + 10); gone.ev("start"); gone.ev("destroy"); gone.advance(STABLE_MS + 1000);
  assert.deepEqual(gone.out.map((a) => a.rule), ["died"]);
});

test("unhealthy recovery obeys the recovery switch and the silence, and bypasses the cooldown", () => {
  const a = rig({ recovery: false });
  a.ev("health_status: unhealthy"); a.ev("health_status: healthy");
  assert.deepEqual(a.out.map((x) => x.rule), ["unhealthy"]);
  const b = rig();
  b.ev("health_status: unhealthy"); b.ev("health_status: healthy");
  assert.deepEqual(b.out.map((x) => x.rule), ["unhealthy", "recovered"], "the 10-minute cooldown does not hold back the good news");
});

test("high CPU / memory: back-to-normal after consecutive calm samples, only if we alerted", () => {
  const { out, engine } = rig({ rules: { cpu: { enabled: true, percent: 50, minutes: 1 }, memory: { enabled: true, percent: 50, minutes: 1 } } });
  const calm = [{ name: "api", cpu: 5, mem: 10, limit: 100 }], hot = [{ name: "api", cpu: 80, mem: 90, limit: 100 }];
  for (let i = 0; i < CALM_SAMPLES + 1; i++) engine.onSamples(calm);
  assert.equal(out.length, 0, "never alerted, so nothing to recover from");
  for (let i = 0; i < 4; i++) engine.onSamples(hot);
  assert.deepEqual(out.map((a) => a.rule).sort(), ["cpu", "memory"]);
  engine.onSamples(calm);
  assert.equal(out.length, 2, "one calm sample is not enough");
  engine.onSamples(hot); engine.onSamples(calm);
  assert.equal(out.length, 2, "a spike in between resets the calm count");
  for (let i = 0; i < CALM_SAMPLES; i++) engine.onSamples(calm);
  assert.deepEqual(out.slice(2).map((a) => a.rule).sort(), ["cpu_ok", "memory_ok"]);
  for (let i = 0; i < 5; i++) engine.onSamples(calm);
  assert.equal(out.length, 4, "said once");
});

test("config: mutes, exclusions and per-rule cooldown are validated and clamped", () => {
  const future = Date.now() + 3_600_000;
  const c = normalizeConfig({ mutes: [{ kind: "container", name: " api ", until: future }, { kind: "bogus", name: "x", until: null }, { kind: "stack", name: "old", until: 1 }, { kind: "stack", name: "", until: null }, { kind: "stack", name: "s", until: null }, { kind: "stack", name: "s", until: future }],
    rules: { oom: { exclude: " a, b ,a,, " }, cpu: { exclude: ["x", 5, ""], cooldownMinutes: 99999 }, died: { cooldownMinutes: "" } } });
  assert.deepEqual(c.mutes, [{ kind: "container", name: "api", until: future }, { kind: "stack", name: "s", until: future }], "bad kinds, expired, empty names dropped; duplicates collapse to the last");
  assert.deepEqual(c.rules.oom.exclude, ["a", "b"]);
  assert.deepEqual(c.rules.cpu.exclude, ["x", "5"]);
  assert.equal(c.rules.cpu.cooldownMinutes, 1440);
  assert.equal(c.rules.died.cooldownMinutes, null);
  assert.equal(normalizeConfig({}, c).mutes.length, 2, "omitting mutes keeps them (saving rules from the form never lifts a silence)");
  assert.deepEqual(normalizeConfig({ rules: { oom: { enabled: false } } }, c).rules.oom.exclude, ["a", "b"], "and keeps exclusions");
  assert.equal(normalizeConfig({ mutes: [] }, c).mutes.length, 0);
});

test("addMute / removeMute: durations, replacement and removal", () => {
  let m = addMute([], { kind: "container", name: "api", minutes: 60 }, 1000);
  assert.deepEqual(m, [{ kind: "container", name: "api", until: 1000 + 3_600_000 }]);
  m = addMute(m, { kind: "container", name: "api", minutes: null }, 1000);
  assert.deepEqual(m, [{ kind: "container", name: "api", until: null }], "silencing again replaces the old one");
  m = addMute(m, { kind: "stack", name: "api", minutes: 5 }, 1000);
  assert.equal(m.length, 2, "a stack and a container with the same name are different silences");
  assert.deepEqual(removeMute(m, { kind: "stack", name: "api" }).map((x) => x.kind), ["container"]);
  assert.equal(addMute([], { kind: "stack", name: "s", minutes: 10_000_000 }, 0)[0].until, 525600 * 60000, "capped at a year");
  assert.deepEqual(cleanMutes("nope"), []);
});

test("publicConfig hides expired silences and the new messages are localized", () => {
  const c = normalizeConfig({}); c.mutes = [{ kind: "container", name: "old", until: 1 }, { kind: "container", name: "keep", until: null }];
  assert.deepEqual(publicConfig(c).mutes.map((m) => m.name), ["keep"]);
  assert.equal(formatAlert({ rule: "back_up", name: "api" }, "es"), "🟢 api vuelve a estar en marcha");
  assert.equal(formatAlert({ rule: "cpu_ok", name: "api", vars: { percent: 12 } }, "en"), "🟢 api: CPU back to 12%");
  assert.equal(formatAlert({ rule: "memory_ok", name: "api", vars: { percent: 12 } }, "es"), "🟢 api: memoria de nuevo al 12%");
});

test("a crash that was silenced or excluded is not followed by 'running again' even if the silence is lifted before it recovers", () => {
  for (const [on, off] of [
    [(c, now) => { c.mutes = [{ kind: "container", name: "api", until: null }]; }, (c) => { c.mutes = []; }],
    [(c) => { c.rules.died.exclude = ["api"]; }, (c) => { c.rules.died.exclude = []; }],
  ]) {
    const r = rig(); on(r.cfg);
    r.ev("die", { exitCode: "1" }); r.advance(SUPPRESS_MS + 10);
    assert.equal(r.out.length, 0, "the crash itself was not reported");
    off(r.cfg);                                   // the user lifts it while the container is still down
    r.ev("start"); r.advance(STABLE_MS + 1000);
    assert.equal(r.out.length, 0, "good news about a problem nobody was told about would be noise");
  }
});

test("parseDockerEvent carries the Compose project (so a stack silence works for containers that are not running)", () => {
  const ev = (attrs) => parseDockerEvent({ Type: "container", Action: "die", Actor: { ID: "i", Attributes: { name: "n", ...attrs } } });
  assert.equal(ev({ "com.docker.compose.project": "shop" }).project, "shop");
  assert.equal("project" in ev({}), false, "no label, no field");
  assert.equal("project" in ev({ "com.docker.compose.project": "" }), false);
  // and the engine uses it: a stopped container (never sampled) is covered by its stack's silence
  const { out, cfg, engine } = rig();
  cfg.mutes = [{ kind: "stack", name: "shop", until: null }];
  engine.onEvent({ ...ev({ "com.docker.compose.project": "shop" }), action: "oom", id: "zz", name: "ghost" });
  assert.equal(out.length, 0);
});

test("a silence on everything covers every container and stack, including ones never seen", () => {
  const { out, ev, cfg, engine, clock } = rig();
  cfg.mutes = [{ kind: "all", name: "*", until: clock.t + 60_000 }];
  ev("oom");
  engine.onEvent({ action: "oom", id: "zzz", name: "db", image: "i", project: "shop" });
  assert.equal(out.length, 0);
  assert.equal(isMuted(cfg.mutes, "anything", undefined, clock.t), true);
  assert.equal(isMuted(cfg.mutes, "anything", undefined, clock.t + 60_001), false, "and it expires");
  cfg.mutes = []; ev("oom");
  assert.equal(out.length, 1, "alerts again once lifted");
});

test("'all' silences have no name to type: the name is forced, duplicates collapse, add/remove work", () => {
  let m = addMute([], { kind: "all", name: "whatever", minutes: 60 }, 1000);
  assert.deepEqual(m, [{ kind: "all", name: "*", until: 1000 + 3_600_000 }]);
  m = addMute(m, { kind: "all", name: "", minutes: null }, 1000);
  assert.deepEqual(m, [{ kind: "all", name: "*", until: null }], "silencing everything again replaces the old one");
  assert.deepEqual(cleanMutes([{ kind: "all", until: null }]), [{ kind: "all", name: "*", until: null }], "no name needed in stored data");
  assert.equal(cleanMutes([{ kind: "everything", name: "*", until: null }]).length, 0, "other kinds are still rejected");
  assert.deepEqual(removeMute(m, { kind: "all", name: "*" }), []);
  const c = normalizeConfig({ mutes: [{ kind: "all", until: null }, { kind: "container", name: "api", until: null }] });
  assert.equal(c.mutes.length, 2);
});
