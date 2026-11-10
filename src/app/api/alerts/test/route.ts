import { guard, json } from "@/lib/docker";
import { startAlerts, testChannel } from "@/lib/alerts";

export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  const { channel } = await req.json().catch(() => ({}));
  if (channel !== "telegram" && channel !== "webhook") return json({ error: "unknown channel" }, 400);
  try { await testChannel(channel); return json({ ok: true }); }
  catch (e) { const reason = e instanceof Error ? e.message : String(e); return json({ error: `Test failed: ${reason}`, code: "alert_test_failed", vars: { reason } }, 502); }
}
