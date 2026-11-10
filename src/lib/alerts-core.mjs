// Alert logic with no I/O: configuration validation, Docker-event interpretation and the rules engine.
// Everything that touches the network, the disk or Docker lives in alerts.ts, so this file is unit-testable anywhere.

/** After a `die`, wait this long for a `stop`/`destroy`/`restart`: if it arrives, the user did it on purpose. */
export const SUPPRESS_MS = 3000;

export const DEFAULTS = {
  enabled: false,
  lang: "en",
  // Every rule also takes `exclude` (container names it ignores) and `cooldownMinutes` (null = use the global one).
  rules: {
    died: { enabled: true, exclude: [], cooldownMinutes: null },
    oom: { enabled: true, exclude: [], cooldownMinutes: null },
    unhealthy: { enabled: true, exclude: [], cooldownMinutes: null },
    restartLoop: { enabled: true, count: 3, minutes: 10, exclude: [], cooldownMinutes: null },
    cpu: { enabled: false, percent: 90, minutes: 5, exclude: [], cooldownMinutes: null },
    memory: { enabled: false, percent: 90, minutes: 2, exclude: [], cooldownMinutes: null },
  },
  cooldownMinutes: 10,
  recovery: true, // tell me when a problem is over
  mutes: [],      // [{ kind: "container" | "stack", name, until (ms epoch | null = until removed) }]
  channels: {
    browser: { enabled: true },
    telegram: { enabled: false, token: "", chatId: "" },
    webhook: { enabled: false, url: "", format: "json", authorization: "" },
  },
};

export class ConfigError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const names = (v, d) => {
  if (v === undefined || v === null) return d;
  const list = Array.isArray(v) ? v : String(v).split(/[,\n]/);
  return [...new Set(list.map((x) => String(x).trim()).filter((x) => x && x.length <= 200))].slice(0, 100);
};
const cooldownOf = (v, d) => (v === undefined ? d : v === null || v === "" ? null : clamp(v, 0, 1440, d));
/** Mutes that have not expired, cleaned and de-duplicated. */
export function cleanMutes(list, now = Date.now()) {
  const out = new Map();
  for (const m of Array.isArray(list) ? list : []) {
    const name = String(m?.name ?? "").trim(), kind = m?.kind;
    const until = m?.until === null ? null : Number(m?.until);
    if (!name || name.length > 200 || (kind !== "container" && kind !== "stack")) continue;
    if (until !== null && !(Number.isFinite(until) && until > now)) continue;
    out.set(`${kind}:${name}`, { kind, name, until });
  }
  return [...out.values()].slice(0, 200);
}
/** Pure helpers behind the "silence" feature. `minutes` null = until the user removes it. */
export function addMute(mutes, { kind, name, minutes }, now = Date.now()) {
  const until = minutes === null || minutes === undefined ? null : now + clamp(minutes, 1, 525600, 60) * 60000;
  return cleanMutes([...mutes.filter((m) => !(m.kind === kind && m.name === name)), { kind, name, until }], now);
}
export const removeMute = (mutes, { kind, name }) => mutes.filter((m) => !(m.kind === kind && m.name === name));
/** Is this container silenced, by its own name or by its Compose stack? */
export function isMuted(mutes, name, project, now = Date.now()) {
  return (mutes ?? []).some((m) => (m.until === null || m.until > now) && (m.kind === "container" ? m.name === name : !!project && m.name === project));
}
// Secrets: undefined/null keeps the stored value, a string (even empty) replaces it.
const secret = (incoming, existing) => (incoming === undefined || incoming === null ? existing : String(incoming).trim());

/** Merges `input` over `current`, clamps numbers and validates channels. Throws ConfigError(code). */
export function normalizeConfig(input = {}, current = DEFAULTS) {
  const i = input ?? {}, c = current;
  const r = i.rules ?? {}, cr = c.rules, ch = i.channels ?? {}, cc = c.channels, tg = ch.telegram ?? {}, wh = ch.webhook ?? {};
  const common = (k) => ({ exclude: names(r[k]?.exclude, cr[k].exclude ?? []), cooldownMinutes: cooldownOf(r[k]?.cooldownMinutes, cr[k].cooldownMinutes ?? null) });
  const thr = (k, lo = 1) => ({
    enabled: bool(r[k]?.enabled, cr[k].enabled), ...common(k),
    ...(k === "restartLoop"
      ? { count: clamp(r[k]?.count ?? cr[k].count, 2, 20, cr[k].count), minutes: clamp(r[k]?.minutes ?? cr[k].minutes, 1, 1440, cr[k].minutes) }
      : { percent: clamp(r[k]?.percent ?? cr[k].percent, lo, 100, cr[k].percent), minutes: clamp(r[k]?.minutes ?? cr[k].minutes, 1, 1440, cr[k].minutes) }),
  });
  const cfg = {
    enabled: bool(i.enabled, c.enabled),
    lang: i.lang === "es" || i.lang === "en" ? i.lang : c.lang,
    rules: {
      died: { enabled: bool(r.died?.enabled, cr.died.enabled), ...common("died") },
      oom: { enabled: bool(r.oom?.enabled, cr.oom.enabled), ...common("oom") },
      unhealthy: { enabled: bool(r.unhealthy?.enabled, cr.unhealthy.enabled), ...common("unhealthy") },
      restartLoop: thr("restartLoop"), cpu: thr("cpu"), memory: thr("memory"),
    },
    cooldownMinutes: clamp(i.cooldownMinutes ?? c.cooldownMinutes, 0, 1440, c.cooldownMinutes),
    recovery: bool(i.recovery, c.recovery ?? true),
    mutes: cleanMutes(i.mutes === undefined ? c.mutes : i.mutes),
    channels: {
      browser: { enabled: bool(ch.browser?.enabled, cc.browser.enabled) },
      telegram: { enabled: bool(tg.enabled, cc.telegram.enabled), token: secret(tg.token, cc.telegram.token), chatId: String(tg.chatId ?? cc.telegram.chatId).trim() },
      webhook: { enabled: bool(wh.enabled, cc.webhook.enabled), url: String(wh.url ?? cc.webhook.url).trim(), format: wh.format === "text" || wh.format === "json" ? wh.format : cc.webhook.format, authorization: secret(wh.authorization, cc.webhook.authorization) },
    },
  };
  const { telegram: t, webhook: w } = cfg.channels;
  if (t.token && !/^\d{5,}:[\w-]{20,}$/.test(t.token)) throw new ConfigError("invalid_telegram_token");
  if (t.chatId && !/^(-?\d+|@\w{4,})$/.test(t.chatId)) throw new ConfigError("invalid_telegram_chat");
  if (t.enabled && (!t.token || !t.chatId)) throw new ConfigError("telegram_incomplete");
  if (w.url) { let u; try { u = new URL(w.url); } catch { throw new ConfigError("invalid_webhook_url"); } if (u.protocol !== "http:" && u.protocol !== "https:") throw new ConfigError("invalid_webhook_url"); }
  if (w.enabled && !w.url) throw new ConfigError("webhook_incomplete");
  if (/[\r\n]/.test(w.authorization)) throw new ConfigError("invalid_authorization");
  return cfg;
}

/** The view sent to the browser: secrets never leave the server. */
export function publicConfig(cfg) {
  const { token, ...tg } = cfg.channels.telegram, { authorization, ...wh } = cfg.channels.webhook;
  return { ...cfg, mutes: cleanMutes(cfg.mutes), channels: { ...cfg.channels, telegram: { ...tg, hasToken: !!token }, webhook: { ...wh, hasAuth: !!authorization } } };
}

/** Normalizes a raw Docker event; returns null for anything that is not a container event. */
export function parseDockerEvent(raw) {
  if (!raw || (raw.Type ?? raw.type) !== "container") return null;
  const a = raw.Actor?.Attributes ?? {};
  return { action: String(raw.Action ?? raw.status ?? ""), id: raw.Actor?.ID ?? raw.id ?? "", name: a.name ?? "", image: a.image ?? "", exitCode: a.exitCode, ...(a["com.docker.compose.project"] ? { project: a["com.docker.compose.project"] } : {}) };
}

const MSG = {
  en: {
    died: "🔴 {name} exited with code {code}", oom: "🔴 {name} was killed: out of memory", unhealthy: "🟠 {name} is unhealthy", recovered: "🟢 {name} is healthy again",
    restartLoop: "🟠 {name} crashed {count} times in {minutes} min", cpu: "🟠 {name}: CPU at {percent}% for {minutes}+ min", memory: "🟠 {name}: memory at {percent}% for {minutes}+ min",
    back_up: "🟢 {name} is running again", cpu_ok: "🟢 {name}: CPU back to {percent}%", memory_ok: "🟢 {name}: memory back to {percent}%",
    test: "✅ Docker Gestor test alert",
  },
  es: {
    died: "🔴 {name} terminó con código {code}", oom: "🔴 {name} fue detenido: sin memoria", unhealthy: "🟠 {name} no está saludable", recovered: "🟢 {name} vuelve a estar saludable",
    restartLoop: "🟠 {name} se cayó {count} veces en {minutes} min", cpu: "🟠 {name}: CPU al {percent}% durante {minutes}+ min", memory: "🟠 {name}: memoria al {percent}% durante {minutes}+ min",
    back_up: "🟢 {name} vuelve a estar en marcha", cpu_ok: "🟢 {name}: CPU de nuevo al {percent}%", memory_ok: "🟢 {name}: memoria de nuevo al {percent}%",
    test: "✅ Alerta de prueba de Docker Gestor",
  },
};
export function formatAlert(alert, lang = "en", host = "") {
  const tpl = (MSG[lang] ?? MSG.en)[alert.rule] ?? alert.rule;
  const text = tpl.replace(/\{(\w+)\}/g, (_, k) => String(k === "name" ? alert.name : (alert.vars?.[k] ?? `{${k}}`)));
  return host ? `[${host}] ${text}` : text;
}

/** A recovered container must stay up this long before we say it is running again (a crash loop never qualifies). */
export const STABLE_MS = 30000;
/** Consecutive samples below the threshold before CPU / memory count as back to normal. */
export const CALM_SAMPLES = 2;
// Which rule's switch, exclusions and cooldown govern each message.
const GATE = { recovered: "unhealthy", back_up: "died", cpu_ok: "cpu", memory_ok: "memory" };

/**
 * Turns Docker events and usage samples into alerts, with cooldowns and without flagging things you did yourself.
 * Honours silences (by container or by Compose stack), per-rule exclusions and per-rule cooldowns, and says when a
 * problem is over (healthy again, running again, CPU / memory back to normal) — but only for problems it reported.
 * `emit(alert)` receives `{ ts, rule, name, image, vars }`.
 */
export class AlertEngine {
  constructor({ getConfig, emit, now = Date.now, schedule = (f, ms) => setTimeout(f, ms), cancel = (h) => clearTimeout(h), sampleMs = 15000, stableMs = STABLE_MS }) {
    Object.assign(this, { getConfig, emit, now, schedule, cancel, sampleMs, stableMs });
    this.pending = new Map();    // container id -> timer waiting for a stop that would make the `die` intentional
    this.names = new Map();      // container id -> name
    this.projects = new Map();   // container name -> Compose project (for stack silences)
    this.alive = new Map();      // container id -> running now (from start / die events)
    this.restarts = new Map();   // name -> timestamps of unintended deaths
    this.cooldown = new Map();   // "rule:name" -> last emission
    this.unhealthy = new Set();  // names we already alerted as unhealthy
    this.down = new Set();       // names we reported as crashed and have not seen stable again
    this.recovering = new Map(); // name -> timer that confirms a crashed container stayed up
    this.streak = { cpu: new Map(), memory: new Map() };
    this.calm = { cpu: new Map(), memory: new Map() };
    this.alerted = { cpu: new Set(), memory: new Set() }; // names reported as high on CPU / memory
  }

  /** "sent", "cooldown" (reported a moment ago) or "blocked" (disabled, excluded or silenced: the user does not want it). */
  #fire(rule, name, vars = {}, image = "", { bypassCooldown = false } = {}) {
    const cfg = this.getConfig();
    if (!cfg.enabled) return "blocked";
    const gate = GATE[rule] ?? rule, r = cfg.rules[gate];
    if (r && !r.enabled) return "blocked";
    if (GATE[rule] && cfg.recovery === false) return "blocked";
    if (r?.exclude?.includes(name)) return "blocked";
    if (isMuted(cfg.mutes, name, this.projects.get(name), this.now())) return "blocked";
    const key = `${rule}:${name}`, last = this.cooldown.get(key), ms = (r?.cooldownMinutes ?? cfg.cooldownMinutes) * 60000;
    if (!bypassCooldown && ms > 0 && last !== undefined && this.now() - last < ms) return "cooldown";
    this.cooldown.set(key, this.now());
    this.emit({ ts: this.now(), rule, name, image, vars });
    return "sent";
  }

  #stopRecovery(name) { if (this.recovering.has(name)) { this.cancel(this.recovering.get(name)); this.recovering.delete(name); } }
  #watchRecovery(name, id, image) {
    this.#stopRecovery(name);
    this.recovering.set(name, this.schedule(() => {
      this.recovering.delete(name);
      if (!this.down.has(name) || this.alive.get(id) === false) return;
      this.down.delete(name);
      this.#fire("back_up", name, {}, image, { bypassCooldown: true });
    }, this.stableMs));
  }

  onEvent(e) {
    if (!e || !e.id) return;
    if (e.name) this.names.set(e.id, e.name);
    const name = e.name || this.names.get(e.id) || e.id.slice(0, 12);
    if (e.project) this.projects.set(name, e.project);
    const act = e.action;
    if (act === "start") {
      this.alive.set(e.id, true);
      if (this.down.has(name)) this.#watchRecovery(name, e.id, e.image);
    } else if (act === "die") {
      this.alive.set(e.id, false);
      this.#stopRecovery(name);
      if (this.pending.has(e.id)) this.cancel(this.pending.get(e.id));
      this.pending.set(e.id, this.schedule(() => {
        this.pending.delete(e.id);
        const cfg = this.getConfig(), now = this.now(), win = cfg.rules.restartLoop.minutes * 60000;
        const hist = (this.restarts.get(name) ?? []).filter((t) => now - t < win);
        hist.push(now); this.restarts.set(name, hist);
        const code = e.exitCode ?? "?";
        let reported = false;
        if (code !== "0" && this.#fire("died", name, { code }, e.image) !== "blocked") reported = true;
        if (hist.length >= cfg.rules.restartLoop.count && this.#fire("restartLoop", name, { count: hist.length, minutes: cfg.rules.restartLoop.minutes }, e.image) !== "blocked") reported = true;
        if (reported) {
          this.down.add(name);
          if (this.alive.get(e.id)) this.#watchRecovery(name, e.id, e.image); // it was restarted before we reported the crash
        }
      }, SUPPRESS_MS));
    } else if (act === "stop" || act === "destroy" || act === "restart") {
      if (this.pending.has(e.id)) { this.cancel(this.pending.get(e.id)); this.pending.delete(e.id); }
      if (act === "stop") { this.alive.set(e.id, false); this.#stopRecovery(name); }
      if (act === "destroy") { this.names.delete(e.id); this.alive.delete(e.id); this.restarts.delete(name); this.unhealthy.delete(name); this.down.delete(name); this.projects.delete(name); this.#stopRecovery(name); }
    } else if (act === "oom") {
      if (this.#fire("oom", name, {}, e.image) !== "blocked") this.down.add(name);
    } else if (act === "health_status: unhealthy") {
      if (this.#fire("unhealthy", name, {}, e.image) !== "blocked") this.unhealthy.add(name);
    } else if (act === "health_status: healthy") {
      if (this.unhealthy.delete(name)) this.#fire("recovered", name, {}, e.image, { bypassCooldown: true });
    }
  }

  /** `snaps`: [{ name, cpu (%), mem (bytes), limit (bytes), project? }] of the running containers. */
  onSamples(snaps) {
    const cfg = this.getConfig(), live = new Set(snaps.map((s) => s.name));
    for (const s of snaps) if (s.project) this.projects.set(s.name, s.project);
    for (const kind of ["cpu", "memory"]) {
      const rule = cfg.rules[kind], map = this.streak[kind], calm = this.calm[kind], alerted = this.alerted[kind];
      for (const n of map.keys()) if (!live.has(n)) map.delete(n);
      for (const n of [...calm.keys()]) if (!live.has(n)) calm.delete(n);
      for (const n of [...alerted]) if (!live.has(n)) alerted.delete(n);
      if (!rule.enabled) { map.clear(); calm.clear(); alerted.clear(); continue; }
      const needed = Math.max(1, Math.round((rule.minutes * 60000) / this.sampleMs));
      for (const s of snaps) {
        const value = kind === "cpu" ? s.cpu : s.limit > 0 ? (s.mem / s.limit) * 100 : 0;
        if (value >= rule.percent) {
          calm.set(s.name, 0);
          const n = (map.get(s.name) ?? 0) + 1; map.set(s.name, n);
          if (n >= needed && this.#fire(kind, s.name, { percent: Math.round(value), minutes: rule.minutes }) !== "blocked") alerted.add(s.name);
        } else {
          map.set(s.name, 0);
          if (alerted.has(s.name)) {
            const c = (calm.get(s.name) ?? 0) + 1; calm.set(s.name, c);
            if (c >= CALM_SAMPLES) { alerted.delete(s.name); calm.delete(s.name); this.#fire(kind === "cpu" ? "cpu_ok" : "memory_ok", s.name, { percent: Math.round(value) }, "", { bypassCooldown: true }); }
          }
        }
      }
    }
  }
}
