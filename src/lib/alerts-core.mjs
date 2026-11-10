// Alert logic with no I/O: configuration validation, Docker-event interpretation and the rules engine.
// Everything that touches the network, the disk or Docker lives in alerts.ts, so this file is unit-testable anywhere.

/** After a `die`, wait this long for a `stop`/`destroy`/`restart`: if it arrives, the user did it on purpose. */
export const SUPPRESS_MS = 3000;

export const DEFAULTS = {
  enabled: false,
  lang: "en",
  rules: {
    died: { enabled: true },
    oom: { enabled: true },
    unhealthy: { enabled: true },
    restartLoop: { enabled: true, count: 3, minutes: 10 },
    cpu: { enabled: false, percent: 90, minutes: 5 },
    memory: { enabled: false, percent: 90, minutes: 2 },
  },
  cooldownMinutes: 10,
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
// Secrets: undefined/null keeps the stored value, a string (even empty) replaces it.
const secret = (incoming, existing) => (incoming === undefined || incoming === null ? existing : String(incoming).trim());

/** Merges `input` over `current`, clamps numbers and validates channels. Throws ConfigError(code). */
export function normalizeConfig(input = {}, current = DEFAULTS) {
  const i = input ?? {}, c = current;
  const r = i.rules ?? {}, cr = c.rules, ch = i.channels ?? {}, cc = c.channels, tg = ch.telegram ?? {}, wh = ch.webhook ?? {};
  const thr = (k, lo = 1) => ({
    enabled: bool(r[k]?.enabled, cr[k].enabled),
    ...(k === "restartLoop"
      ? { count: clamp(r[k]?.count ?? cr[k].count, 2, 20, cr[k].count), minutes: clamp(r[k]?.minutes ?? cr[k].minutes, 1, 1440, cr[k].minutes) }
      : { percent: clamp(r[k]?.percent ?? cr[k].percent, lo, 100, cr[k].percent), minutes: clamp(r[k]?.minutes ?? cr[k].minutes, 1, 1440, cr[k].minutes) }),
  });
  const cfg = {
    enabled: bool(i.enabled, c.enabled),
    lang: i.lang === "es" || i.lang === "en" ? i.lang : c.lang,
    rules: {
      died: { enabled: bool(r.died?.enabled, cr.died.enabled) },
      oom: { enabled: bool(r.oom?.enabled, cr.oom.enabled) },
      unhealthy: { enabled: bool(r.unhealthy?.enabled, cr.unhealthy.enabled) },
      restartLoop: thr("restartLoop"), cpu: thr("cpu"), memory: thr("memory"),
    },
    cooldownMinutes: clamp(i.cooldownMinutes ?? c.cooldownMinutes, 0, 1440, c.cooldownMinutes),
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
  return { ...cfg, channels: { ...cfg.channels, telegram: { ...tg, hasToken: !!token }, webhook: { ...wh, hasAuth: !!authorization } } };
}

/** Normalizes a raw Docker event; returns null for anything that is not a container event. */
export function parseDockerEvent(raw) {
  if (!raw || (raw.Type ?? raw.type) !== "container") return null;
  const a = raw.Actor?.Attributes ?? {};
  return { action: String(raw.Action ?? raw.status ?? ""), id: raw.Actor?.ID ?? raw.id ?? "", name: a.name ?? "", image: a.image ?? "", exitCode: a.exitCode };
}

const MSG = {
  en: {
    died: "🔴 {name} exited with code {code}", oom: "🔴 {name} was killed: out of memory", unhealthy: "🟠 {name} is unhealthy", recovered: "🟢 {name} is healthy again",
    restartLoop: "🟠 {name} crashed {count} times in {minutes} min", cpu: "🟠 {name}: CPU at {percent}% for {minutes}+ min", memory: "🟠 {name}: memory at {percent}% for {minutes}+ min",
    test: "✅ Docker Gestor test alert",
  },
  es: {
    died: "🔴 {name} terminó con código {code}", oom: "🔴 {name} fue detenido: sin memoria", unhealthy: "🟠 {name} no está saludable", recovered: "🟢 {name} vuelve a estar saludable",
    restartLoop: "🟠 {name} se cayó {count} veces en {minutes} min", cpu: "🟠 {name}: CPU al {percent}% durante {minutes}+ min", memory: "🟠 {name}: memoria al {percent}% durante {minutes}+ min",
    test: "✅ Alerta de prueba de Docker Gestor",
  },
};
export function formatAlert(alert, lang = "en", host = "") {
  const tpl = (MSG[lang] ?? MSG.en)[alert.rule] ?? alert.rule;
  const text = tpl.replace(/\{(\w+)\}/g, (_, k) => String(k === "name" ? alert.name : (alert.vars?.[k] ?? `{${k}}`)));
  return host ? `[${host}] ${text}` : text;
}

/**
 * Turns Docker events and usage samples into alerts, with cooldowns and without flagging things you did yourself.
 * `emit(alert)` receives `{ ts, rule, name, image, vars }`.
 */
export class AlertEngine {
  constructor({ getConfig, emit, now = Date.now, schedule = (f, ms) => setTimeout(f, ms), cancel = (h) => clearTimeout(h), sampleMs = 15000 }) {
    Object.assign(this, { getConfig, emit, now, schedule, cancel, sampleMs });
    this.pending = new Map();   // container id -> timer waiting for a stop that would make the `die` intentional
    this.names = new Map();     // container id -> name
    this.restarts = new Map();  // name -> timestamps of unintended deaths
    this.cooldown = new Map();  // "rule:name" -> last emission
    this.unhealthy = new Set(); // names we already alerted as unhealthy
    this.streak = { cpu: new Map(), memory: new Map() };
  }

  #fire(rule, name, vars = {}, image = "", { bypassCooldown = false } = {}) {
    const cfg = this.getConfig();
    if (!cfg.enabled) return;
    const gate = rule === "recovered" ? "unhealthy" : rule;
    if (cfg.rules[gate] && !cfg.rules[gate].enabled) return;
    const key = `${rule}:${name}`, last = this.cooldown.get(key), ms = cfg.cooldownMinutes * 60000;
    if (!bypassCooldown && ms > 0 && last !== undefined && this.now() - last < ms) return;
    this.cooldown.set(key, this.now());
    this.emit({ ts: this.now(), rule, name, image, vars });
  }

  onEvent(e) {
    if (!e || !e.id) return;
    if (e.name) this.names.set(e.id, e.name);
    const name = e.name || this.names.get(e.id) || e.id.slice(0, 12);
    const act = e.action;
    if (act === "die") {
      if (this.pending.has(e.id)) this.cancel(this.pending.get(e.id));
      this.pending.set(e.id, this.schedule(() => {
        this.pending.delete(e.id);
        const cfg = this.getConfig(), now = this.now(), win = cfg.rules.restartLoop.minutes * 60000;
        const hist = (this.restarts.get(name) ?? []).filter((t) => now - t < win);
        hist.push(now); this.restarts.set(name, hist);
        const code = e.exitCode ?? "?";
        if (code !== "0") this.#fire("died", name, { code }, e.image);
        if (hist.length >= cfg.rules.restartLoop.count) this.#fire("restartLoop", name, { count: hist.length, minutes: cfg.rules.restartLoop.minutes }, e.image);
      }, SUPPRESS_MS));
    } else if (act === "stop" || act === "destroy" || act === "restart") {
      if (this.pending.has(e.id)) { this.cancel(this.pending.get(e.id)); this.pending.delete(e.id); }
      if (act === "destroy") { this.names.delete(e.id); this.restarts.delete(name); this.unhealthy.delete(name); }
    } else if (act === "oom") {
      this.#fire("oom", name, {}, e.image);
    } else if (act === "health_status: unhealthy") {
      this.unhealthy.add(name); this.#fire("unhealthy", name, {}, e.image);
    } else if (act === "health_status: healthy") {
      if (this.unhealthy.delete(name)) this.#fire("recovered", name, {}, e.image, { bypassCooldown: true });
    }
  }

  /** `snaps`: [{ name, cpu (%), mem (bytes), limit (bytes) }] of the running containers. */
  onSamples(snaps) {
    const cfg = this.getConfig(), live = new Set(snaps.map((s) => s.name));
    for (const kind of ["cpu", "memory"]) {
      const rule = cfg.rules[kind], map = this.streak[kind];
      for (const n of map.keys()) if (!live.has(n)) map.delete(n);
      if (!rule.enabled) { map.clear(); continue; }
      const needed = Math.max(1, Math.round((rule.minutes * 60000) / this.sampleMs));
      for (const s of snaps) {
        const value = kind === "cpu" ? s.cpu : s.limit > 0 ? (s.mem / s.limit) * 100 : 0;
        if (value >= rule.percent) {
          const n = (map.get(s.name) ?? 0) + 1; map.set(s.name, n);
          if (n >= needed) this.#fire(kind, s.name, { percent: Math.round(value), minutes: rule.minutes });
        } else map.set(s.name, 0);
      }
    }
  }
}
