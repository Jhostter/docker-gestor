// Alerts: the I/O around alerts-core.mjs — config file, Docker event watcher, Telegram / webhook delivery, history.
import { hostname } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { docker } from "./docker";
import { dataDir } from "./paths";
import { addSampleHook, alertHistory, recordAlert, SAMPLE_MS } from "./history";
import { AlertEngine, DEFAULTS, formatAlert, normalizeConfig, parseDockerEvent, publicConfig, type Alert, type AlertsConfig } from "./alerts-core.mjs";

/** Label shown in front of every message so you can tell machines apart (default: the hostname). */
const hostLabel = () => process.env.ALERT_HOST ?? hostname();
const TELEGRAM_API = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org"; // overridable for tests
type Delivered = { ts: number; rule: string; name: string; message: string };
type Chan = "telegram" | "webhook";
type State = {
  cfg: AlertsConfig; engine: AlertEngine; listeners: Set<(a: Delivered) => void>; started: boolean;
  stream?: Readable; watching: boolean; retry?: NodeJS.Timeout; backoff: number; lastSeen: number;
  status: Record<Chan, { ok?: number; error?: string }>;
};
const g = globalThis as unknown as { __alerts?: State };

const file = () => join(dataDir(), "alerts.json");

function load(): AlertsConfig {
  try { return normalizeConfig(JSON.parse(readFileSync(file(), "utf8"))); } catch { return structuredClone(DEFAULTS); }
}
function save(cfg: AlertsConfig) {
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 }); // holds the Telegram token: readable only by the owner
  renameSync(tmp, file());
  try { chmodSync(file(), 0o600); } catch { /* not supported on this OS */ }
}

function state(): State {
  if (g.__alerts) return g.__alerts;
  const s: State = { cfg: load(), listeners: new Set(), started: false, watching: false, backoff: 3000, lastSeen: Math.floor(Date.now() / 1000), status: { telegram: {}, webhook: {} }, engine: undefined as unknown as AlertEngine };
  s.engine = new AlertEngine({ getConfig: () => s.cfg, emit: (a) => void dispatch(a), sampleMs: SAMPLE_MS });
  return (g.__alerts = s);
}

/* ---------------- delivery ---------------- */
async function sendTelegram(text: string, cfg: AlertsConfig) {
  const t = cfg.channels.telegram;
  const r = await fetch(`${TELEGRAM_API}/bot${t.token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: t.chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!r.ok || j.ok === false) throw new Error(j.description ?? `HTTP ${r.status}`);
}

async function sendWebhook(a: Alert, text: string, cfg: AlertsConfig) {
  const w = cfg.channels.webhook, headers: Record<string, string> = {};
  if (w.authorization) headers.authorization = w.authorization;
  let body: string;
  if (w.format === "text") { headers["content-type"] = "text/plain; charset=utf-8"; body = text; }
  else {
    headers["content-type"] = "application/json";
    // `text` (Slack) and `content` (Discord) make the same payload work for both; the rest is for custom receivers.
    body = JSON.stringify({ text, content: text, event: a.rule, container: a.name, host: hostLabel(), timestamp: new Date(a.ts).toISOString(), vars: a.vars ?? {} });
  }
  const r = await fetch(w.url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

async function viaChannel(s: State, ch: Chan, send: () => Promise<void>) {
  try { await send(); s.status[ch] = { ok: Date.now() }; }
  catch (e) { s.status[ch] = { ...s.status[ch], error: e instanceof Error ? e.message : String(e) }; } // never include URLs or tokens
}

async function dispatch(a: Alert) {
  const s = state(), cfg = s.cfg, text = formatAlert(a, cfg.lang, hostLabel());
  try { recordAlert(a.ts, a.rule, a.name, text); } catch { /* history is best-effort */ }
  if (cfg.channels.browser.enabled) s.listeners.forEach((f) => f({ ts: a.ts, rule: a.rule, name: a.name, message: text }));
  const jobs: Promise<void>[] = [];
  if (cfg.channels.telegram.enabled) jobs.push(viaChannel(s, "telegram", () => sendTelegram(text, cfg)));
  if (cfg.channels.webhook.enabled) jobs.push(viaChannel(s, "webhook", () => sendWebhook(a, text, cfg)));
  await Promise.all(jobs);
}

/** Sends a test message through one channel using the SAVED configuration (even if the channel is switched off). */
export async function testChannel(ch: Chan) {
  const s = state(), cfg = s.cfg, a: Alert = { ts: Date.now(), rule: "test", name: "docker-gestor" }, text = formatAlert(a, cfg.lang, hostLabel());
  const t = cfg.channels.telegram, w = cfg.channels.webhook;
  if (ch === "telegram" && t.token && t.chatId) await viaThrow(s, ch, () => sendTelegram(text, cfg));
  else if (ch === "webhook" && w.url) await viaThrow(s, ch, () => sendWebhook(a, text, cfg));
  else throw new Error("channel not configured");
}
async function viaThrow(s: State, ch: Chan, send: () => Promise<void>) {
  try { await send(); s.status[ch] = { ok: Date.now() }; }
  catch (e) { s.status[ch] = { ...s.status[ch], error: e instanceof Error ? e.message : String(e) }; throw e; }
}

/* ---------------- Docker event watcher (only while alerts are enabled) ---------------- */
function stopWatch(s: State) {
  s.watching = false; clearTimeout(s.retry); s.retry = undefined;
  s.stream?.destroy(); s.stream = undefined;
}
async function watch(s: State) {
  if (!s.watching || s.stream) return;
  try {
    const stream = (await docker.getEvents({ since: s.lastSeen, filters: { type: ["container"] } })) as unknown as Readable;
    s.stream = stream; s.backoff = 3000;
    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l) continue;
        try { const raw = JSON.parse(l); s.lastSeen = Math.max(s.lastSeen, Number(raw.time) || 0); const e = parseDockerEvent(raw); if (e) s.engine.onEvent(e); } catch { /* partial or foreign line */ }
      }
    });
    const again = () => { if (s.stream !== stream) return; s.stream = undefined; reconnect(s); };
    stream.on("end", again); stream.on("error", again); stream.on("close", again);
  } catch { reconnect(s); }
}
function reconnect(s: State) {
  if (!s.watching || s.retry) return;
  s.retry = setTimeout(() => { s.retry = undefined; void watch(s); }, s.backoff);
  s.retry.unref();
  s.backoff = Math.min(s.backoff * 2, 60000);
}
function apply(s: State) {
  if (s.cfg.enabled) { if (!s.watching) { s.watching = true; s.lastSeen = Math.floor(Date.now() / 1000); void watch(s); } }
  else stopWatch(s);
}

/* ---------------- public API ---------------- */
export function startAlerts() {
  const s = state();
  if (s.started) return;
  s.started = true;
  addSampleHook((snaps) => s.engine.onSamples(snaps));
  apply(s);
}

export function getPublicConfig() {
  const s = state();
  return { ...(publicConfig(s.cfg) as object), status: s.status, watching: s.watching };
}
export function updateConfig(input: unknown) {
  const s = state();
  s.cfg = normalizeConfig(input, s.cfg); // throws ConfigError on bad input; nothing is saved then
  save(s.cfg); apply(s);
}
export function subscribe(fn: (a: Delivered) => void) { const s = state(); s.listeners.add(fn); return () => { s.listeners.delete(fn); }; }
export const history = (limit?: number) => alertHistory(limit);
