import { guard, json } from "@/lib/docker";
import { getPublicConfig, startAlerts, updateConfig } from "@/lib/alerts";
import { ConfigError } from "@/lib/alerts-core.mjs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  return json(getPublicConfig());
}
export async function PUT(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  try { updateConfig(await req.json()); return json(getPublicConfig()); }
  catch (e) {
    if (e instanceof ConfigError) return json({ error: e.code, code: e.code }, 400);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
