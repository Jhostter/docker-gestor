import { hasKey, tr, getLang } from "./i18n";

export const bytes = (n: number) => {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n >= 1048576) return (n / 1048576).toFixed(n >= 1.05e8 ? 0 : 1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
};

/** Localized relative time ("hace 5 min" / "5 min ago"). */
export const ago = (ms: number, lang: string = getLang()) => {
  const s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (a < 60) return rtf.format(s, "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
};

type ApiError = { error?: string; code?: string; where?: string; vars?: Record<string, string | number> };

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = d as ApiError, key = `err_${e.code}`;
    throw new Error(e.code && hasKey(key) ? tr(key, { where: e.where ?? "", ...(e.vars ?? {}) }) : (e.error ?? r.statusText));
  }
  return d as T;
}
/** POST that answers with newline-delimited JSON events; `onEvent` runs for each one as it arrives. Abort with `signal`. */
export async function postStream<E>(url: string, body: unknown, onEvent: (e: E) => void, signal?: AbortSignal) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) {
    const d = (await r.json().catch(() => ({}))) as ApiError, key = `err_${d.code}`;
    throw new Error(d.code && hasKey(key) ? tr(key, { where: d.where ?? "", ...(d.vars ?? {}) }) : (d.error ?? r.statusText));
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) onEvent(JSON.parse(l) as E);
  }
}
export const post = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

/** An alert silence: by container name or by Compose stack; `until` null = until it is lifted. */
export type Mute = { kind: "container" | "stack" | "all"; name: string; until: number | null };
/** Is this container silenced right now? By its own name, by its stack and, unless `all` is false, by the silence on everything. */
export const isMutedNow = (mutes: Mute[] | undefined, name: string, project?: string | null, { all = true } = {}) =>
  (mutes ?? []).some((m) => (m.until === null || m.until > Date.now()) && (m.kind === "all" ? all : m.kind === "container" ? m.name === name : !!project && m.name === project));
