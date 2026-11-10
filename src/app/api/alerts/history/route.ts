import { guard, json, fail } from "@/lib/docker";
import { history, startAlerts } from "@/lib/alerts";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  startAlerts();
  try { return json(history(100)); } catch (e) { return fail(e); }
}
