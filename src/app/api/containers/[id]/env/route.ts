import { docker, guard, json, fail } from "@/lib/docker";
import { envValue } from "@/lib/inspect-core.mjs";
export const dynamic = "force-dynamic";

/** The real value of ONE environment variable, only when the user explicitly asks to show it. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = guard(req); if (g) return g;
  const { id } = await ctx.params;
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!/^[a-f0-9]{12,64}$/.test(id)) return json({ error: "invalid id" }, 400);
  if (!/^[\w.\-]{1,255}$/.test(name)) return json({ error: "invalid name" }, 400);
  try {
    const value = envValue(await docker.getContainer(id).inspect(), name);
    return value === undefined ? json({ error: "no such variable" }, 404) : json({ value }, 200, { "cache-control": "no-store" });
  } catch (e) { return fail(e); }
}
