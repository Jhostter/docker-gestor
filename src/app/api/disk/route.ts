import { guard, json, fail } from "@/lib/docker";
import { diskReport } from "@/lib/disk";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try { return json(await diskReport(new URL(req.url).searchParams.get("fresh") === "1")); } catch (e) { return fail(e); }
}
