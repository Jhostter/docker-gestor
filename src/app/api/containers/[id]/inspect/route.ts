import { docker, guard, json, fail } from "@/lib/docker";
import { shapeInspect } from "@/lib/inspect-core.mjs";
export const dynamic = "force-dynamic";

/** Container details. Secret-looking values (env vars, command arguments) are never included here. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = guard(req); if (g) return g;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{12,64}$/.test(id)) return json({ error: "invalid id" }, 400);
  try { return json(shapeInspect(await docker.getContainer(id).inspect())); } catch (e) { return fail(e); }
}
