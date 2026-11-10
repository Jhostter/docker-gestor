import { guard, json, fail } from "@/lib/docker";
import { series, startSampler } from "@/lib/history";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  startSampler();
  const q = new URL(req.url).searchParams;
  try { return json(series(q.get("name") ?? "", q.get("range") ?? "1h")); } catch (e) { return fail(e); }
}
