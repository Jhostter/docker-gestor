import { guard, json } from "@/lib/docker";
import { getPublicConfig, muteAlerts, startAlerts, unmuteAlerts } from "@/lib/alerts";
import { ConfigError } from "@/lib/alerts-core.mjs";
export const dynamic = "force-dynamic";

/** Silence alerts for a container or a Compose stack. Body: { kind: "container" | "stack", name, minutes: number | null }. */
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  const b = await req.json().catch(() => ({}));
  try { muteAlerts(b.kind, b.name, b.minutes === undefined ? null : b.minutes); return json(getPublicConfig()); }
  catch (e) { return e instanceof ConfigError ? json({ error: e.code, code: e.code }, 400) : json({ error: String(e) }, 500); }
}
/** Lift a silence. Body: { kind, name }. */
export async function DELETE(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  const b = await req.json().catch(() => ({}));
  try { unmuteAlerts(b.kind, String(b.name ?? "")); return json(getPublicConfig()); }
  catch (e) { return json({ error: String(e) }, 500); }
}
