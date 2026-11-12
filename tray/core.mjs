// Pure logic of the tray icon: what the menu says and which icon it shows. No systray, no network, no files,
// so it is unit-tested on every OS. tray.mjs does the I/O around it.

export const POLL_MS = 5000;
export const SILENCE_MINUTES = 60;
// Messages that report the end of a problem or a test: they never make the icon turn amber.
const NOT_PROBLEMS = new Set(["recovered", "back_up", "cpu_ok", "memory_ok", "test"]);

/**
 * "es" or "en". Order: TRAY_LANG, the choice saved by `tray:install --lang`, the system locale. Spanish locales get
 * Spanish; everything else, English.
 */
export function pickLang(env = process.env, intl = "en", saved = "") {
  for (const explicit of [env.TRAY_LANG, saved]) if (explicit === "es" || explicit === "en") return explicit;
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || intl || "en";
  return /^es/i.test(raw) ? "es" : "en";
}

const TEXT = {
  en: {
    open: "Open Docker Gestor", running: "{up} of {total} containers running", none: "No containers",
    down: "Docker Gestor is not responding", dockerDown: "Docker is not responding", hint: "Start it with: npm start",
    alertsOn: "Alerts on", alertsOff: "Alerts off", muted: "{n} silenced",
    allUntil: "All alerts silenced until {time}", allForever: "All alerts silenced until you lift it",
    fresh1: "1 new alert — open", freshN: "{n} new alerts — open",
    silence: "Silence all alerts for 1 hour", unsilence: "Lift the silence on all alerts",
    start: "Start service", stop: "Stop service", restart: "Restart service", quit: "Quit tray icon",
    tip: "Docker Gestor — {up}/{total} running", tipDown: "Docker Gestor — not responding", tipFresh: " · {n} new alert(s)",
  },
  es: {
    open: "Abrir Docker Gestor", running: "{up} de {total} contenedores en marcha", none: "Sin contenedores",
    down: "Docker Gestor no responde", dockerDown: "Docker no responde", hint: "Arráncalo con: npm start",
    alertsOn: "Alertas activadas", alertsOff: "Alertas desactivadas", muted: "{n} silenciadas",
    allUntil: "Todas las alertas silenciadas hasta las {time}", allForever: "Todas las alertas silenciadas hasta que lo reactives",
    fresh1: "1 alerta nueva — abrir", freshN: "{n} alertas nuevas — abrir",
    silence: "Silenciar todas las alertas 1 hora", unsilence: "Reactivar todas las alertas",
    start: "Iniciar servicio", stop: "Parar servicio", restart: "Reiniciar servicio", quit: "Salir del icono",
    tip: "Docker Gestor — {up}/{total} en marcha", tipDown: "Docker Gestor — no responde", tipFresh: " · {n} alerta(s) nueva(s)",
  },
};
const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

/** Silences that are in force right now. */
export const activeMutes = (mutes, now) => (Array.isArray(mutes) ? mutes : []).filter((m) => m && (m.until === null || m.until > now));

/** Problems (not recoveries or tests) reported after `seenAt` (ms epoch): what makes the icon amber. */
export const freshAlerts = (history, seenAt) => (Array.isArray(history) ? history : []).filter((h) => h && h.ts > seenAt && !NOT_PROBLEMS.has(h.rule)).length;

/**
 * Condenses what the API said. `online`: the Docker Gestor server answered. `containers`: its list, or null when Docker
 * did not answer. `alerts`: /api/alerts/config. `history`: /api/alerts/history.
 */
export function summarize({ online, containers, alerts, history, seenAt }, now = Date.now()) {
  const list = Array.isArray(containers) ? containers : null;
  const mutes = activeMutes(alerts?.mutes, now);
  const fresh = online && list ? freshAlerts(history, seenAt) : 0;
  return {
    online: !!online, dockerOk: !!list,
    up: list ? list.filter((c) => c.state === "running").length : 0, total: list ? list.length : 0,
    alertsEnabled: !!alerts?.enabled,
    muted: mutes.filter((m) => m.kind !== "all").length, all: mutes.find((m) => m.kind === "all") ?? null,
    fresh,
    status: !online || !list ? "down" : fresh > 0 ? "warn" : "ok",
  };
}

/**
 * The menu for a summary, as FIXED slots: the same entries in the same order every time, each with its own title, `enabled`
 * and `hidden`. Native tray menus cannot be rebuilt reliably (systray2's `update-menu` does not rebuild them on Linux), but
 * the properties of an existing entry can always be updated. Slot ids are what the click handler looks up; the id of a
 * slot that changes meaning (silence ↔ unsilence, start ↔ restart) changes with it.
 * `caps.service`: a service manager (systemd user service) is available to start / stop / restart the server.
 */
export const SLOT_COUNT = 12;
export function buildMenu(v, lang = "en", caps = {}, now = Date.now()) {
  const T = TEXT[lang] ?? TEXT.en, t = (k, vars) => fill(T[k], vars);
  const on = v.online, docker = v.online && v.dockerOk;
  const slot = (id, title, { enabled = true, hidden = false } = {}) => ({ id, title, enabled, hidden });
  const sep = () => slot("sep", "", { hidden: false });
  const status = !on ? t("down") : !docker ? t("dockerDown") : v.total ? t("running", { up: v.up, total: v.total }) : t("none");
  let alerts = "";
  if (on) {
    if (v.all) alerts = v.all.until === null ? t("allForever") : t("allUntil", { time: new Date(v.all.until).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) });
    else alerts = (v.alertsEnabled ? t("alertsOn") : t("alertsOff")) + (v.muted ? ` · ${t("muted", { n: v.muted })}` : "");
  }
  const items = [
    slot("open", t("open"), { enabled: on }),
    sep(),
    slot("status", status, { enabled: false }),
    slot("alerts", alerts, { enabled: false, hidden: !on }),
    slot("fresh", v.fresh === 1 ? t("fresh1") : t("freshN", { n: v.fresh }), { hidden: !(docker && v.fresh > 0) }),
    sep(),
    v.all ? slot("unsilence", t("unsilence"), { hidden: !on }) : slot("silence", t("silence"), { hidden: !on }),
    on ? slot("svc-restart", t("restart"), { hidden: !caps.service }) : slot("svc-start", t("start"), { hidden: !caps.service }),
    slot("svc-stop", t("stop"), { hidden: !(on && caps.service) }),
    slot("hint", t("hint"), { enabled: false, hidden: !(!on && !caps.service) }),
    sep(),
    slot("quit", t("quit")),
  ];
  const icon = !docker ? "down" : v.status;
  return { icon, tooltip: !docker ? t("tipDown") : t("tip", { up: v.up, total: v.total }) + (v.fresh ? t("tipFresh", { n: v.fresh }) : ""), items };
}

/** The slots whose title, enabled or hidden state differ between two menus (what an `update-item` must touch). */
export function changedSlots(prev, next) {
  const out = [];
  next.items.forEach((it, i) => { const p = prev?.items?.[i]; if (!p || p.id !== it.id || p.title !== it.title || p.enabled !== it.enabled || p.hidden !== it.hidden) out.push(i); });
  return out;
}

/** What each menu id does: an HTTP call to the local API, a service command, or something local. Kept as data so it is testable. */
export function actionFor(id, { seenNow = Date.now() } = {}) {
  switch (id) {
    case "open": return { open: true, seenAt: seenNow };
    case "fresh": return { open: true, seenAt: seenNow };
    case "silence": return { http: { method: "POST", path: "/api/alerts/mute", body: { kind: "all", minutes: SILENCE_MINUTES } } };
    case "unsilence": return { http: { method: "DELETE", path: "/api/alerts/mute", body: { kind: "all" } } };
    case "svc-start": return { service: "start" };
    case "svc-stop": return { service: "stop" };
    case "svc-restart": return { service: "restart" };
    case "quit": return { quit: true };
    default: return null;
  }
}
